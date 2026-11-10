# Frontend

A React 19 + TypeScript app built with Vite (`src/`). It talks to the backend only through `/api` (proxied to port 3001 in development). For how requests move through the backend, see [data-flow.md](data-flow.md).

## Pages

Routes are defined in `src/app/routes.tsx`; every page shares `TopNav` (the active page gets an underline). The navbar order lives in `src/app/navPages.ts`: Practice, Journey, Dashboard, Tune, Evolve, Admin. Cmd/Ctrl + a double-tapped ← or → opens the neighbouring page in that order (`usePageHotkeys`), and `PageSweep` draws a faint sweep across the window in the direction of travel.

| Route | Component | What it does |
|---|---|---|
| `/` | `features/journey/JourneyPage.tsx` | Journey, the home page: the score terrain, the daily work grid and the day detail. Enter opens `/practice` |
| `/practice` | `features/practice/PracticePage.tsx` | The practice screen: recall, MCQ, Ghost Reps, Inline notes, AI completion, the Sliding Window Ladder, and flows |
| `/dashboard` | `features/dashboard/DashboardPage.tsx` | A readiness card per algorithm and playlist; each starts focused practice |
| `/tune` | `features/tune/TunePage.tsx` | Local preferences; saved as you change them |
| `/admin` | `features/admin/AdminPage.tsx` | MCQ signal editor and the read-only recall specs |
| `/evolve` | `features/evolve/EvolvePage.tsx` | AlphaEvolve-style prompt runs for MCQ generation |

`/coach-tuning` and `/submission-tuning` redirect to `/tune`; the old `/practice-history` redirects to `/`.

The practice screen reads its starting deck from the URL:

| Parameter | Effect |
|---|---|
| none | 10 random core algorithms (`/api/coach/problem-drills?count=10`) |
| `focusPattern=<slug>` | That algorithm's core cards (from Dashboard) |
| `focusTag=<tag>` | Cards with that tag |
| `playlist=<slug>` | A playlist: static decks load from the catalog; other playlists stream generated cards, with a single non-streaming request as the fallback |
| `panel=flow` | Opens the Flow configuration (Journey's **/build** link) |

## Source layout

The code is organized by feature: each page owns a folder, and code used by more than one page lives in `shared/`.

```
src/
  main.tsx        mounts the providers and the router
  app/            the shell: routes.tsx, navPages, TopNav, page hotkeys and sweep, theme, and styles/ (global CSS)
  api/            the typed API client (client.ts) and shared TanStack Query reads (queries.ts)
  shared/
    components/   Icon, IconToggle, Skeleton, InfoTip, settingControls
    lib/          storedSetting, hotkeys, dailyWork, llmProviderDefault
    settings/     the *Tuning modules (localStorage preferences)
    data/         bundled catalogs, used when the API has none
  features/
    practice/     /practice    the practice screen
    dashboard/    /dashboard   readiness cards
    journey/      /            the score terrain, daily work grid and day detail
    admin/        /admin       the signal editor
    tune/         /tune        preferences
    evolve/       /evolve      OpenEvolve MCQ-prompt runs (talks to the evolve service on :3002)
  test/           Vitest setup and helpers
```

Inside a feature:

| Folder | Holds |
|---|---|
| `<Feature>Page.tsx` | The route component. It composes the feature's hooks and components |
| `components/` | Presentational pieces; they take props and fetch nothing |
| `hooks/` | One hook per concern (practice: `useDecks`, `usePracticeSession`, `useRecallAttempt`, `useMultipleChoiceAttempt`, `usePracticeHotkeys`, `usePracticePanels`, `usePracticeFocus`) |
| `lib/` (or `lib.ts`) | Pure logic, unit-tested without rendering (practice: `focus`, `targets`, `cardMeta`, `primaryAction`, `inlineNotes`, `lineReview`, `types`) |
| `api.ts` | The feature's requests (practice: decks, MCQ generation, attempt bodies; admin: the signal admin client) |
| Sub-areas | Practice also has `flow/` (FlowBuilder, the flow engine `practiceFlow.ts`, `flowReducer`, `usePracticeFlow`, the flow cards), `ladder/` (the Sliding Window Ladder) and `editor/` (`RecallCodeEditor`, the CodeMirror editor). Journey has `terrain/` (the three.js Signal Score Terrain) |

**Where new code goes.** Code for one page goes in that page's feature folder. Once a second feature needs it, it moves to `shared/`. A feature never imports another feature, and `shared/` and `api/` never import `features/` or `app/`; ESLint (`no-restricted-imports` in `eslint.config.js`) enforces both. Use `@/` (= `src/`) for imports across modules and relative paths within one.

**Styles.** `app/styles/index.css` imports `base.css` and the numbered section files in cascade order. Later files refine earlier ones (the practice workbench layer overrides card and editor rules), so add rules to the section they belong to and keep the order.

## State

There is no global store. Server data goes through TanStack Query (`src/api/queries.ts` for shared reads, `practice/hooks/useDecks.ts` for practice decks), so two components asking for the same data make one request. Preferences live in `localStorage`, read through `shared/lib/storedSetting.ts` with a validating loader that falls back to defaults for missing or invalid values:

| Key | Holds |
|---|---|
| `system1-theme` | Light or dark high-contrast theme |
| `system1-specimen-tuning-v1` | Type hints, comments, variable naming in generated code |
| `system1-code-editor-tuning-v1` | Editor language, IntelliSense, AI completion, style guide, folding, search panel |
| `system1-mcq-tuning-v1` | MCQ flow mode and set size (1–30) |
| `system1-submission-tuning-v1` | Grading mode, contract strictness and the grading toggles |
| `system1-google-playlist-tuning-v1` | Order of the Google deck |
| `practice-flow-v1` | Flow mode, custom blocks, random stages |
| `system1-ladder-v1:<card>:<technique>` | Ladder progress per card |

The Admin page keeps its view (question type and scope) in the URL, so views can be linked.

## The practice flow

A flow keeps one card as its **anchor** and moves between the four modalities around it. Attempts are tagged with `signals.flow.anchorCardId`, so a flow resumes from stored history (`/api/coach/history`).

- **Custom** repeats the configured blocks in order. **Random** draws each step from the enabled stages, repeats allowed.
- **Adaptive** (`features/practice/flow/practiceFlow.ts::adaptiveNextFlowStep`):
  - **On a miss** (failed, scored under 65, or missed lines), it remediates: Recall goes to Ghost; Ghost and MCQ go to Microdrill; Microdrill goes back to Recall, so a fresh line-level weakness can be measured.
  - **On a success**, it first proves any modality not yet passed (MCQ, then Microdrill, then Recall), then progresses.
- **Phase:** each step computes a phase from recent scores, streak, missed lines and modality coverage (`establish`, `remediate`, `consolidate`, `challenge` or `mastered`). The phase and a short weakness summary go to MCQ and microdrill generation. Challenge questions may change constraints or edge cases but stay within the anchor card's algorithm.
- **Mastery** needs strong recent scores and passed Recall, MCQ and Microdrill attempts (Ghost only if remediation was needed). Once mastered, the flow moves to the next card in the deck.

## Keyboard shortcuts

Defined once in `shared/lib/hotkeys.ts` and listed on Tune. Mod is ⌘ on macOS and Ctrl elsewhere.

| Keys | Action |
|---|---|
| Mod+D / W / A / S | Switch to Recall / Ghost / MCQ / Microdrill |
| Mod+Enter | The card's primary button (Start, Submit, Next) |
| Mod+G | Toggle Ghost Reps |
| Mod+L | Toggle AI completion |
| Mod+← ← / Mod+→ → | Previous or next card |
| Enter | Next targeted line, during a Ghost Rep |
| Tab / Shift+Tab | Indent or outdent |

## Tests

Vitest with React Testing Library and jsdom. Tests sit next to the code they test (`PracticePage.test.tsx` beside `PracticePage.tsx`); helpers are in `src/test/`.

| Helper | Use |
|---|---|
| `test/setup.ts` | jest-dom matchers, cleanup, and jsdom gaps: `matchMedia`, `ResizeObserver`, and Range geometry for CodeMirror |
| `test/fetch.ts` → `mockFetch(routes)` | Stubs `fetch` by method and URL. Unmatched requests return 404, so a missing mock fails loudly. Supports JSON bodies, computed responses and raw text (server-sent events) |
| `test/app.ts` | Practice screen helpers: drill and MCQ fixtures, `typeCode` (writes into the live CodeMirror view), `pressKey`, `flush` |

Patterns worth reusing:

- **Real CodeMirror runs in jsdom.** Edit it through `EditorView.findFromDOM(...)` and `view.dispatch`.
- **The terrain** swaps `THREE.WebGLRenderer` for a fake and stubs the 2D canvas and `IntersectionObserver`. Scene building, the camera, controls and hover raycasting all run for real.
- **Flow tests** use real timers and wait for the transition card to finish before interacting.

Coverage floors are set in `vitest.config.ts` (93% of statements). Raise them as coverage grows.
