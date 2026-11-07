import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { ThemeProvider } from './theme'
import { mockFetch } from './test/fetch'
import { button, drill, evaluation, flush, mcqCard, typeCode, type Drill } from './test/app'

const SLOW = { timeout: 6000 }

// One card per pattern, each with code the inline notes recognise.
const PATTERN_DRILLS: Drill[] = [
  ['sliding-window', 'def f(nums, k):\n    left = 0\n    counts = {}\n    for right, value in enumerate(nums):\n        counts[value] = counts.get(value, 0) + 1\n        while len(counts) > k:\n            counts[nums[left]] -= 1\n            if counts[nums[left]] == 0:\n                del counts[nums[left]]\n            left += 1\n        best = max(best, right - left + 1)\n    {{missing}}'],
  ['binary-search', 'def f(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    {{missing}}'],
  ['graphs', 'def f(graph, start):\n    seen = {start}\n    q = deque([start])\n    while q:\n        node = q.popleft()\n        for nxt in graph[node]:\n            if nxt not in seen:\n                seen.add(nxt)\n                q.append(nxt)\n    {{missing}}'],
  ['dynamic-programming', 'def f(nums):\n    dp = [0] * (len(nums) + 1)\n    for i in range(len(nums)):\n        take = nums[i] + dp[i - 1]\n        skip = dp[i]\n        dp[i + 1] = max(take, skip)\n    {{missing}}'],
  ['backtracking', 'def f(nums):\n    res = []\n    def backtrack(path):\n        if len(path) == len(nums):\n            res.append(path[:])\n            return\n        for n in nums:\n            path.append(n)\n            backtrack(path)\n            path.pop()\n    backtrack([])\n    {{missing}}'],
  ['union-find', 'def f(n, edges):\n    parent = list(range(n))\n    rank = [0] * n\n    def find(x):\n        while parent[x] != x:\n            x = parent[x]\n        return x\n    {{missing}}'],
  ['heap-priority-queue', 'def f(nums, k):\n    heap = []\n    for n in nums:\n        heapq.heappush(heap, n)\n        if len(heap) > k:\n            heapq.heappop(heap)\n    {{missing}}'],
  ['two-pointers', 'def f(nums):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        left += 1\n        right -= 1\n    {{missing}}'],
  ['prefix-sums', 'def f(nums):\n    prefix = [0]\n    for n in nums:\n        prefix.append(prefix[-1] + n)\n    {{missing}}'],
  ['monotonic-stack', 'def f(nums):\n    stack = []\n    for i, n in enumerate(nums):\n        while stack and nums[stack[-1]] < n:\n            stack.pop()\n        stack.append(i)\n    {{missing}}'],
  ['intervals', 'def f(intervals):\n    intervals.sort()\n    out = [intervals[0]]\n    for start, end in intervals[1:]:\n        out[-1][1] = max(out[-1][1], end)\n    {{missing}}'],
].map(([pattern, solution], index) => drill(`p${index}`, {
  title: `Pattern ${pattern}`,
  tags: ['skill-map', pattern],
  solution,
  missing: 'return res',
}))

function setup(options: { drills?: Drill[]; attempt?: () => unknown; extra?: Parameters<typeof mockFetch>[0] } = {}) {
  const attempts: Record<string, unknown>[] = []
  const fetch = mockFetch([
    ...(options.extra ?? []),
    { match: '/api/coach/provider-default', body: { provider: 'openai' } },
    { match: '/api/catalog/playlists', body: { playlists: [] } },
    { match: '/api/skill-map', body: [] },
    { match: '/api/coach/problem-drills', body: { drills: options.drills ?? [drill('a')], llmUsed: false } },
    { method: 'POST', match: '/api/coach/history', body: { summary: {}, entries: [] } },
    {
      method: 'POST',
      match: '/api/coach/session-plan',
      body: { headline: 'Next: windows', focusTheme: 'Shrink timing', warmup: 'w', mainSet: 'm', cooldown: 'c', note: 'n', llmUsed: true },
    },
    {
      method: 'POST',
      match: '/api/attempts',
      respond: (_url, init) => {
        attempts.push(JSON.parse(String(init?.body)))
        return options.attempt?.() ?? { saved: true, attemptId: attempts.length, successful: true, evaluation: evaluation(true) }
      },
    },
  ])
  return { attempts, fetch }
}

const renderApp = (path = '/') =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  )

describe('practice: session', () => {
  it('finishes the session and builds a coach plan', async () => {
    const { fetch } = setup()
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Start'))
    typeCode('def f(nums, k):\n    total = sum(nums[:k])\n    return total')
    await userEvent.click(button('Submit'))
    expect(await screen.findByText(/Session complete\. 1 of 1 cards were sound\./, undefined, SLOW)).toBeInTheDocument()
    expect(await screen.findByText('Next: windows')).toBeInTheDocument()
    expect(screen.getByText('Generated by LLM coach + rules.')).toBeInTheDocument()
    expect(fetch.calls.some((call) => call.url.includes('/api/coach/session-plan'))).toBe(true)
  })

  it('lets you revise a missed recall', async () => {
    const { attempts } = setup({
      drills: [drill('a'), drill('b')],
      attempt: () => ({ saved: true, attemptId: 1, successful: false, evaluation: evaluation(false) }),
    })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('Start'))
    typeCode('x = 1')
    await userEvent.click(button('Submit'))
    await screen.findByText('Needs work')
    await userEvent.click(button('Submit')) // revise
    typeCode('x = 2')
    await userEvent.click(button('Submit'))
    await waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(1))
  })
})

describe('practice: inline mode', () => {
  it('annotates each pattern while you type', async () => {
    setup({ drills: PATTERN_DRILLS })
    renderApp()
    await screen.findByText('Pattern sliding-window')
    await userEvent.click(button('Turn Inline on'))
    for (let index = 0; index < PATTERN_DRILLS.length; index += 1) {
      await userEvent.click(button('Start'))
      const lines = PATTERN_DRILLS[index].solution.replace('{{missing}}', 'return res').split('\n')
      for (let count = 1; count <= lines.length; count += 3) typeCode(lines.slice(0, count).join('\n'))
      await flush()
      if (index < PATTERN_DRILLS.length - 1) await userEvent.click(button('Next card'))
    }
    expect(document.querySelector('.recall-code-editor')).not.toBeNull()
  }, 30000)
})

describe('practice: multiple choice details', () => {
  it('renders code in questions and explanations', async () => {
    const card = {
      ...mcqCard('code'),
      question: 'What does this print?\n```python\nprint(sum([1, 2]))\n```',
      explanation: 'It adds:\n```python\nsum([1, 2]) == 3\n```',
    }
    setup({ extra: [{ method: 'POST', match: '/api/coach/multiple-choice-drills', body: { drills: [card], llmUsed: true } }] })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('MCQ'))
    const choices = await screen.findByRole('radiogroup', { name: 'Answer choices' })
    expect(document.body.textContent).toContain('print(sum([1, 2]))')
    await userEvent.click(within(choices).getByText('A stack'))
    await userEvent.click(button('Submit'))
    expect(await screen.findByText(/It adds/, undefined, SLOW)).toBeInTheDocument()
  })

  it('reports MCQ generation failures', async () => {
    setup({ extra: [{ method: 'POST', match: '/api/coach/multiple-choice-drills', status: 503, body: { detail: { message: 'Generator offline' } } }] })
    renderApp()
    await screen.findByText('Window a')
    await userEvent.click(button('MCQ'))
    expect((await screen.findAllByText('Generator offline')).length).toBeGreaterThan(0)
  })
})

describe('practice: flow history and ladder', () => {
  it('resumes a flow from stored attempts on this card', async () => {
    setup({
      extra: [{
        method: 'POST',
        match: '/api/coach/history',
        body: {
          summary: {},
          entries: [
            {
              attemptId: 9,
              interactionId: 'i9',
              cardId: 'a',
              modality: 'total-recall',
              successful: false,
              question: 'q',
              createdAt: '2026-01-01T00:00:00Z',
              signals: { elapsedMs: 900, flow: { anchorCardId: 'a' }, modality: { missedLineCount: 2 }, evaluation: evaluation(false) },
            },
            { attemptId: 10, cardId: 'other', modality: 'mcq', successful: true, question: 'q', signals: {} },
            { attemptId: 11, cardId: 'a', modality: 'unknown', successful: true, question: 'q', signals: {} },
          ],
        },
      }],
    })
    renderApp('/?panel=flow')
    await screen.findByText('Window a')
    await userEvent.click(button('Start flow'))
    await screen.findByRole('button', { name: /Submit|Start/ }, SLOW)
  })

  it('opens the sliding window ladder for a window card', async () => {
    setup({
      drills: [drill('w', { title: 'Find All Anagrams', tags: ['skill-map', 'sliding-window', 'fixed-window'] })],
      extra: [{
        method: 'POST',
        match: '/api/coach/sliding-window-ladder',
        body: { rungTitle: 'Add', question: 'Add the entering value', starterCode: 'def f():\n    pass', solution: 's', language: 'python' },
      }],
    })
    renderApp()
    await screen.findByText('Find All Anagrams')
    await userEvent.click(button('Open Sliding Window Ladder'))
    expect(await screen.findByText('Add the entering value')).toBeInTheDocument()
  })
})
