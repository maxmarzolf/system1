# Frontend

A React 19 + TypeScript app built with Vite (`src/`). It talks to the backend only through `/api` (proxied to port 3001 in development). For how requests move through the backend, see [data-flow.md](data-flow.md).

## Pages

Routes are defined in `src/main.tsx`; every page shares `TopNav` (the active page gets an underline).

| Route | Component | What it does |
|---|---|---|
| `/` | `App.tsx` | The practice screen: recall, MCQ, Ghost Reps, Inline notes, AI completion, the Sliding Window Ladder, and flows |
| `/dashboard` | `DashboardPage.tsx` | A readiness card per algorithm and playlist; each starts focused practice |
| `/practice-history` | `PracticeHistoryPage.tsx` | Journey: the score terrain, the daily work grid and the day detail |
| `/tune` | `TunePage.tsx` | Local preferences; saved as you change them |
| `/admin` | `AdminPage.tsx` | MCQ signal editor and the read-only recall specs |

`/coach-tuning` and `/submission-tuning` redirect to `/tune`.

The practice screen reads its starting deck from the URL:

| Parameter | Effect |
|---|---|
| none | 10 random core algorithms (`/api/coach/problem-drills?count=10`) |
| `focusPattern=<slug>` | That algorithm's core cards (from Dashboard) |
| `focusTag=<tag>` | Cards with that tag |
| `playlist=<slug>` | A playlist: static decks load from the catalog; other playlists stream generated cards, with a single non-streaming request as the fallback |
| `panel=flow` | Opens the Flow configuration (Journey's **/build** link) |

## Source layout

| Files | Role |
|---|---|
| `App.tsx` | The practice screen. It only composes: the hooks, components and pure modules below hold the logic |
| `practice/hooks/` | One hook per concern: `useDecks` (the three decks, on TanStack Query), `usePracticeSession` (moving through a deck; the coach's session plan), `useRecallAttempt` and `useMultipleChoiceAttempt` (answering a card), `usePracticeFlow` (the flow's state, controls, transition timing and stage hotkeys), `usePracticeHotkeys`, `usePracticePanels` (Zen, Flow, related drawer, tags, Ladder), `usePracticeFocus` (the URL focus) |
| `practice/components/` | Presentational pieces of the screen: `CardHeader`, `PromptPanel`, `RecallPanel`, `MultipleChoicePanel`, `FlowPanel`, `SessionSummary`, `PracticeControlBar`, `SubmissionFailureModal`; they take props and fetch nothing |
| `practice/*.ts` | Pure logic, unit-tested without rendering: `focus` (URL to deck request), `targets` (what to type), `cardMeta` (header, tags, question types, History link), `primaryAction` (what the primary button does), `flowReducer` (the flow as actions and planners), `mcqRequests` and `attemptBodies` (request bodies), plus the editor helpers (`inlineNotes`, `lineReview`, `markdownText`) |
| `RecallCodeEditor.tsx` | CodeMirror editor: line status decorations, ghost text, inline notes, autocompletion, AI completion via `/api/coach/inline-completion` |
| `FlowBuilder.tsx`, `practiceFlow.ts` | Flow configuration UI and the flow engine (next step, mastery summary, transition copy) |
| `WindowLadderPanel.tsx`, `windowLadderPlan.ts` | The five-rung Sliding Window Ladder |
| `PracticeHistoryPage.tsx`, `DailyWorkHistory.tsx`, `HistoryDayDetail.tsx`, `SubmissionSignalDetails.tsx` | Journey |
| `SignalHologram.tsx`, `signalTerrain.ts` | The Signal Score Terrain (three.js, loaded lazily) and its surface maths |
| `AdminPage.tsx`, `signalAdmin.ts`, `signalFieldHelp.tsx` | `/admin`, its API client and its field help |
| `TunePage.tsx`, `tuneControls.tsx`, `*Tuning.ts` | Tune and the stored settings it edits |
| `TopNav.tsx`, `InfoTip.tsx`, `theme.tsx` | Shared UI: nav, `?` tooltips, light/dark theme |
| `api/` | The typed API client (`client.ts`) and the shared TanStack Query reads (`queries.ts`) |
| `signalSpecs.ts`, `llmProviderDefault.ts`, `dailyWork.ts`, `hotkeys.ts`, `storedSetting.ts` | Small API helpers, date formatting, keyboard shortcuts, the `localStorage` setting helper |
| `data/` | Local catalogs (skill map, playlists, related LeetCode problems), used when the API has none |

## State

There is no global store. Server data goes through TanStack Query (`src/api/queries.ts` for shared reads, `practice/hooks/useDecks.ts` for practice decks), so two components asking for the same data make one request. Preferences live in `localStorage`, read through `storedSetting.ts` with a validating loader that falls back to defaults for missing or invalid values:

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
- **Adaptive** (`practiceFlow.ts::adaptiveNextFlowStep`):
  - **On a miss** (failed, scored under 65, or missed lines), it remediates: Recall goes to Ghost; Ghost and MCQ go to Microdrill; Microdrill goes back to Recall, so a fresh line-level weakness can be measured.
  - **On a success**, it first proves any modality not yet passed (MCQ, then Microdrill, then Recall), then progresses.
- **Phase:** each step computes a phase from recent scores, streak, missed lines and modality coverage (`establish`, `remediate`, `consolidate`, `challenge` or `mastered`). The phase and a short weakness summary go to MCQ and microdrill generation. Challenge questions may change constraints or edge cases but stay within the anchor card's algorithm.
- **Mastery** needs strong recent scores and passed Recall, MCQ and Microdrill attempts (Ghost only if remediation was needed). Once mastered, the flow moves to the next card in the deck.

## Keyboard shortcuts

Defined once in `hotkeys.ts` and listed on Tune. Mod is ⌘ on macOS and Ctrl elsewhere.

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

Vitest with React Testing Library and jsdom. Tests sit next to the code as `src/*.test.ts[x]`; helpers are in `src/test/`.

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
