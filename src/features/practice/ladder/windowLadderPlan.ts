export type SlidingWindowTechnique = 'fixed' | 'variable'

export const LADDER_REPS_PER_RUNG = 10

export const LADDER_RUNGS: Record<SlidingWindowTechnique, string[]> = {
  fixed: [
    'Add window state',
    'Remove window state',
    'Advance one window',
    'Scan fixed windows',
    'Combine fixed window',
  ],
  variable: [
    'Maintain window state',
    'Code the validity rule',
    'Repair longest window',
    'Minimize valid window',
    'Combine variable window',
  ],
}

const FIXED_TITLES = [
  'permutation in string', 'fixed-size sliding window', 'moving average',
  'maximum average subarray', 'maximum points from cards', 'sliding window maximum',
  'find all anagrams',
]

const VARIABLE_TITLES = [
  'longest substring without repeating', 'longest repeating character replacement',
  'minimum window substring', 'minimum size subarray sum', 'variable-size sliding window',
]

export function slidingWindowTechnique(card: { title: string; tags: string[]; solution?: string }): SlidingWindowTechnique | null {
  if (!card.tags.includes('sliding-window')) return null
  if (card.tags.includes('fixed-window') || card.tags.includes('fixed-size-window')) return 'fixed'
  if (card.tags.includes('variable-window') || card.tags.includes('variable-size-window')) return 'variable'
  const title = card.title.toLowerCase()
  if (FIXED_TITLES.some((name) => title.includes(name))) return 'fixed'
  if (VARIABLE_TITLES.some((name) => title.includes(name))) return 'variable'
  const context = `${title} ${card.tags.join(' ')}`.replaceAll('-', ' ')
  if (/\b(fixed (size )?window|rolling (sum|state)|anagram|permutation)\b/.test(context)) return 'fixed'
  if (/\b(variable (size )?window|expand shrink|shrink timing|valid window rule)\b/.test(context)) return 'variable'
  const solution = card.solution ?? ''
  if (/\bwhile\b[^\n]*(?:left|window|total|count)/.test(solution)) return 'variable'
  if (/\brange\(k,|\bright\s*-\s*k\b|\bright\s*-\s*left\s*\+\s*1\s*>\s*k\b/.test(solution)) return 'fixed'
  return null
}
