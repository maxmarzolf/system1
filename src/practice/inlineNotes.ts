import type { InlineLens, TemplateMode } from './types'

export const normalizeTyping = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

export const INLINE_NOTE_COLUMN = 48
export const shortenAnnotationNote = (value: string, maxWords = 8) => {
  const cleaned = value
    .replace(/#\s*/g, '')
    .replace(/\bINVARIANT\s*:\s*/gi, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.split(/\s+/).slice(0, maxWords).join(' ')
}

export const patternInlineDecisionNoteForPattern = (patternTag: string) => {
  switch (patternTag) {
    case 'sliding-window':
      return 'window valid before scoring'
    case 'two-pointers':
      return 'answer stays inside pointers'
    case 'binary-search':
      return 'answer stays inside bounds'
    case 'dynamic-programming':
    case 'dp':
      return 'take skip summarize processed prefix'
    case 'graphs':
    case 'graph-traversal':
    case 'dfs-bfs':
      return 'frontier holds unvisited work'
    case 'backtracking':
      return 'path matches current branch'
    case 'heap':
      return 'heap holds current top-k'
    case 'union-find':
      return 'roots name connected groups'
    case 'intervals':
      return 'merged tail alone can overlap'
    case 'prefix-sums':
      return 'seen holds previous prefixes'
    case 'monotonic-stack':
    case 'stack':
      return 'stack keeps unresolved decreasing values'
    default:
      return 'state preserves valid updates'
  }
}

export const inlineDecisionNoteForPattern = (patternTag: string, lens: InlineLens = 'pattern') => {
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    switch (lens) {
      case 'plainEnglish':
        return 'at each item choose take or skip'
      case 'why':
        return 'current best depends on earlier bests'
      case 'transfer':
        return 'define state, transition, final answer'
      case 'debug':
        return 'state meaning matters more than array'
      case 'pattern':
      default:
        return 'state stores best answer so far'
    }
  }

  switch (lens) {
    case 'plainEnglish':
      return 'make the next local decision'
    case 'why':
      return 'preserve the rule before moving on'
    case 'transfer':
      return 'state, update, answer'
    case 'debug':
      return 'check what this state represents'
    case 'pattern':
    default:
      return patternInlineDecisionNoteForPattern(patternTag)
  }
}

export const patternInlineNoteForLine = (trimmedLine: string, patternTag: string) => {
  if (/^return\b/.test(trimmedLine)) {
    if (/max\(take,\s*skip\)/.test(trimmedLine)) return 'best of final choices'
    if (/return\s+0\b/.test(trimmedLine)) return 'nothing to choose'
    if (/return\s+out\b|return\s+res\b|return\s+result\b/.test(trimmedLine)) return 'return collected result'
    return ''
  }
  if (/^while\b/.test(trimmedLine)) {
    if (patternTag === 'sliding-window') return 'shrink until window is valid'
    if (patternTag === 'binary-search') return 'keep narrowing the search'
    if (patternTag === 'graphs' || patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') return 'process frontier until empty'
    return ''
  }
  if (/^(def|for|if|elif|else)\b/.test(trimmedLine)) return ''
  if (patternTag === 'sliding-window') {
    if (/\b(best|ans)\s*=\s*max\(/.test(trimmedLine)) return 'keep best valid window'
    if (/\b(left|l)\s*\+=/.test(trimmedLine)) return 'shrink from the left'
    if (/\b\w+\[[^\]]+\]\s*=\s*\w+\.get\([^)]*\)\s*\+\s*1/.test(trimmedLine) || /\b\w+\[[^\]]+\]\s*\+=/.test(trimmedLine)) {
      return 'include entering value'
    }
    if (/\b\w+\[[^\]]+\]\s*-/.test(trimmedLine)) return 'remove leaving value'
    if (/^del\b/.test(trimmedLine)) return 'drop zero count'
    if (/\.(append|add)\(/.test(trimmedLine) || /^(out|res|result)\s*=\s*\[/.test(trimmedLine)) return 'record current window'
    return ''
  }
  if (patternTag === 'graphs' || patternTag === 'dfs-bfs' || patternTag === 'graph-traversal') {
    if (/\b(visited|seen)\.add\(/.test(trimmedLine)) return 'mark before enqueueing'
    if (/\b(popleft|pop)\(/.test(trimmedLine)) return 'take next frontier node'
    if (/\b(q|queue|frontier)\.(append|add|push)\(/.test(trimmedLine)) return 'enqueue unseen neighbor'
    if (/\.(append|add)\(/.test(trimmedLine)) return 'record reached node'
    return ''
  }
  if (patternTag === 'two-pointers') {
    if (/\b(left|l)\s*\+=/.test(trimmedLine)) return 'move left pointer inward'
    if (/\b(right|r)\s*-/.test(trimmedLine)) return 'move right pointer inward'
    if (/\b(total|cur|area)\s*=/.test(trimmedLine)) return 'measure current pair'
    return ''
  }
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    if (/^take\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was taken'
    if (/^skip\s*=\s*0\b/.test(trimmedLine)) return 'best if previous was skipped'
    if (/take\s*,\s*skip\s*=/.test(trimmedLine)) return 'take x or skip x'
    if (/dp\[/.test(trimmedLine) || /transition/.test(trimmedLine)) return 'build from solved states'
  }
  if (patternTag === 'backtracking') {
    if (/\b(record|res|result|out)\.(append|add)\(/.test(trimmedLine)) return 'record completed path'
    if (/\bpath\.(append|add)\(/.test(trimmedLine)) return 'choose current item'
    if (/\bpath\.pop\(/.test(trimmedLine)) return 'undo current choice'
    if (/\b(dfs|backtrack|search)\(/.test(trimmedLine)) return 'explore this branch'
    return ''
  }
  if (patternTag === 'heap' && /heappush/.test(trimmedLine)) return 'include new candidate'
  if (patternTag === 'heap' && /heappop/.test(trimmedLine)) return 'drop smallest kept item'
  if ((patternTag === 'binary-search') && /mid\s*=/.test(trimmedLine)) return 'probe middle boundary'
  if ((patternTag === 'binary-search') && /left\s*=\s*mid/.test(trimmedLine)) return 'discard lower half'
  if ((patternTag === 'binary-search') && /right\s*=\s*mid/.test(trimmedLine)) return 'keep possible boundary'
  if (['intervals', 'prefix-sums', 'monotonic-stack', 'stack'].includes(patternTag)) {
    if (/\.(append|add|push)\(/.test(trimmedLine)) return 'record resolved state'
    if (/\.(pop|remove)\(/.test(trimmedLine)) return 'discard stale candidate'
    return ''
  }
  if (/\b(union|find)\b/.test(trimmedLine)) return 'merge or locate root'
  if (trimmedLine.startsWith('#')) return ''
  if (patternTag === 'union-find' && /^parent\b|^rank\b/.test(trimmedLine)) return 'self-label before merging'
  return ''
}

export const dynamicProgrammingInlineNoteForLine = (trimmedLine: string, lens: InlineLens) => {
  const hasDpState = /\bdp\s*=/.test(trimmedLine)
  const isLoop = /^for\b/.test(trimmedLine)
  const isTake = /^take\s*=/.test(trimmedLine)
  const isSkip = /^skip\s*=/.test(trimmedLine)
  const isReturn = /^return\b/.test(trimmedLine)
  const isTransition = !isReturn && (/^dp\[[^\]]+\]\s*=\s*max\(/.test(trimmedLine) || /max\(take,\s*skip\)/.test(trimmedLine))

  if (lens === 'pattern') {
    if (hasDpState) return 'state table indexed by prefix'
    if (isLoop) return 'build states left to right'
    if (isTake) return 'candidate using current item'
    if (isSkip) return 'candidate carrying previous best'
    if (isTransition) return 'transition stores best candidate'
    if (isReturn) return 'answer is final state'
  }

  if (lens === 'plainEnglish') {
    if (hasDpState) return 'dp[i] means best using first i items'
    if (isLoop) return 'look at each item in order'
    if (isTake) return 'use this item plus earlier safe best'
    if (isSkip) return 'ignore this item and keep previous best'
    if (isTransition) return 'choose the better of taking or skipping'
    if (isReturn) return 'final slot holds the full answer'
  }

  if (lens === 'why') {
    if (hasDpState) return 'stores solved smaller answers'
    if (isLoop) return 'each step extends the solved prefix'
    if (isTake) return 'taking blocks the adjacent previous item'
    if (isSkip) return 'skipping preserves the known best'
    if (isTransition) return 'optimal answer is the better valid choice'
    if (isReturn) return 'all choices have been summarized'
  }

  if (lens === 'transfer') {
    if (hasDpState) return 'common DP move: name state meaning'
    if (isLoop) return 'common DP move: scan states in order'
    if (isTake) return 'choice branch uses compatible previous state'
    if (isSkip) return 'choice branch carries previous state'
    if (isTransition) return 'transition compares candidate choices'
    if (isReturn) return 'return the state covering the whole input'
  }

  if (lens === 'debug') {
    if (hasDpState) return 'do not memorize array; define dp[i]'
    if (isLoop) return 'i indexes dp slots, val is current item'
    if (isTake) return 'check the index you jump back to'
    if (isSkip) return 'previous best already considered earlier items'
    if (isTransition) return 'if this feels magic, name take and skip'
    if (isReturn) return 'last state is answer only by definition'
  }

  return ''
}

export const transformInlineNoteForLens = (note: string, lens: InlineLens) => {
  if (!note) return ''
  if (lens === 'pattern') return note
  if (lens === 'plainEnglish') return note
    .replace(/^include entering value$/, 'add the new value')
    .replace(/^remove leaving value$/, 'take out the old value')
    .replace(/^record current window$/, 'save this answer')
    .replace(/^mark before enqueueing$/, 'remember this node is seen')
    .replace(/^take next frontier node$/, 'work on the next node')
    .replace(/^enqueue unseen neighbor$/, 'save neighbor to visit later')
    .replace(/^choose current item$/, 'try this choice')
    .replace(/^undo current choice$/, 'put things back before trying next')
  if (lens === 'why') return note
    .replace(/^keep best valid window$/, 'only valid windows can improve answer')
    .replace(/^shrink from the left$/, 'restore the window rule')
    .replace(/^probe middle boundary$/, 'middle tells which half survives')
    .replace(/^discard lower half$/, 'lower values cannot contain answer')
    .replace(/^keep possible boundary$/, 'answer may still be at mid')
  if (lens === 'transfer') return note
    .replace(/^keep best valid window$/, 'update answer after state is valid')
    .replace(/^shrink from the left$/, 'move boundary until invariant holds')
    .replace(/^probe middle boundary$/, 'search on a monotonic decision')
    .replace(/^record resolved state$/, 'emit or store resolved candidate')
    .replace(/^discard stale candidate$/, 'remove candidates that cannot win')
  if (lens === 'debug') return note
    .replace(/^keep best valid window$/, 'update best only after validity check')
    .replace(/^shrink from the left$/, 'ask what broke the invariant')
    .replace(/^probe middle boundary$/, 'check your inclusive bounds')
    .replace(/^record resolved state$/, 'confirm this state is truly done')
    .replace(/^discard stale candidate$/, 'confirm it cannot affect future answers')
  return note
}

export const inlineNoteForLine = (trimmedLine: string, patternTag: string, lens: InlineLens = 'pattern') => {
  if (/^(def|if|elif|else)\b/.test(trimmedLine)) return ''
  if (patternTag === 'dynamic-programming' || patternTag === 'dp') {
    const dpNote = dynamicProgrammingInlineNoteForLine(trimmedLine, lens)
    if (dpNote) return dpNote
  }
  const patternNote = patternInlineNoteForLine(trimmedLine, patternTag)
  return transformInlineNoteForLens(patternNote, lens)
}

export const appendAlignedNote = (line: string, note: string, maxWords = 16) => {
  const compactNote = shortenAnnotationNote(note, maxWords)
  if (!compactNote) return line
  const trimmedRight = line.trimEnd()
  if (!trimmedRight) return `${' '.repeat(INLINE_NOTE_COLUMN)}${compactNote}`
  const padding = ' '.repeat(Math.max(2, INLINE_NOTE_COLUMN - trimmedRight.length))
  return `${trimmedRight}${padding}${compactNote}`
}

export const INLINE_GENERIC_NOTES = [
  'update state for next decision',
  'return final answer',
  'restore rule before continuing',
  'move through core step',
  'choose rule-preserving branch',
  'repeat until state settles',
  'state depends on solved states',
]

export const removeDuplicateInlineNotes = (note: string) => {
  let cleaned = note.trim()
  INLINE_GENERIC_NOTES.forEach((genericNote) => {
    const escaped = genericNote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\s+${escaped}\\b`, 'gi'), genericNote)
  })
  return cleaned.replace(/\s+/g, ' ').trim()
}

export const hasAlignedInlineNote = (line: string) => /.*\S\s{6,}\S/.test(line) || new RegExp(`^\\s{${INLINE_NOTE_COLUMN},}\\S`).test(line)

export const stripKnownInlineNote = (line: string) => {
  const lower = line.toLowerCase()
  const firstIndex = INLINE_GENERIC_NOTES
    .map((note) => lower.indexOf(note.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  return firstIndex === undefined ? line : line.slice(0, firstIndex).trimEnd()
}

export const appendInlineNote = (line: string, patternTag: string, lens: InlineLens = 'pattern') => {
  if (hasAlignedInlineNote(line)) {
    const parts = splitInlineAnnotationLine(line)
    if (!parts.note) return line.trimEnd()
    const cleanedNote = removeDuplicateInlineNotes(parts.note)
    if (INLINE_GENERIC_NOTES.some((note) => note.toLowerCase() === cleanedNote.toLowerCase()) || lens !== 'pattern') {
      if (!parts.code.trim()) return appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens))
      const comment = inlineNoteForLine(parts.code.trim(), patternTag, lens)
      return appendAlignedNote(parts.code, comment)
    }
    return appendAlignedNote(parts.code, cleanedNote)
  }
  const hashIndex = line.indexOf('#')
  if (hashIndex >= 0) {
    const beforeComment = line.slice(0, hashIndex)
    const existingNote = line.slice(hashIndex + 1)
    return appendAlignedNote(beforeComment, existingNote)
  }
  const cleanedLine = stripKnownInlineNote(line)
  const trimmedLine = cleanedLine.trim()
  if (!trimmedLine) return line
  const comment = inlineNoteForLine(trimmedLine, patternTag, lens)
  return appendAlignedNote(cleanedLine, comment)
}

export const shouldPlaceInlineDecisionNoteAfter = (line: string, insideLoop: boolean, patternTag: string, lens: InlineLens = 'pattern') => {
  if (!insideLoop) return false
  const codePart = line.split('#', 1)[0].trim()
  if (!codePart) return false
  if (/^(def|for|while|if|elif|else|return)\b/.test(codePart)) return false
  return Boolean(inlineNoteForLine(codePart, patternTag, lens))
}

export const buildInlineTemplate = (patternTag: string, algorithmTarget: string, lens: InlineLens = 'pattern') => {
  const lines = normalizeTyping(algorithmTarget).split('\n')
  const output: string[] = []
  let inlineDecisionInserted = false
  let insideLoop = false

  lines.forEach((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
    }
    const nextLine = appendInlineNote(line, patternTag, lens)
    output.push(nextLine)
    if (isInlineDecisionLine(nextLine)) {
      inlineDecisionInserted = true
    }
    if (!inlineDecisionInserted && shouldPlaceInlineDecisionNoteAfter(line, insideLoop, patternTag, lens)) {
      output.push(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
      inlineDecisionInserted = true
    }
  })

  if (!inlineDecisionInserted) {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    }
  }

  return output.join('\n')
}

export const extractNestedHelperTarget = (algorithmTarget: string) => {
  const lines = normalizeTyping(algorithmTarget).split('\n')
  for (let start = 0; start < lines.length; start += 1) {
    const match = lines[start]?.match(/^(\s*)def\s+(dfs|backtrack|search|helper)\s*\(/)
    if (!match?.[1]) continue
    const baseIndent = match[1].length
    const block = [lines[start] ?? '']
    for (const nextLine of lines.slice(start + 1)) {
      const indent = nextLine.length - nextLine.trimStart().length
      if (nextLine.trim() && indent <= baseIndent) break
      block.push(nextLine)
    }
    return block
      .map((line) => line.length >= baseIndent ? line.slice(baseIndent) : line.trimStart())
      .join('\n')
      .replace(/\blen\((items|nums|arr|values|candidates|choices|s)\)/g, 'n')
      .trim()
  }
  return ''
}

export const buildCoreShapeTemplate = (patternTag: string, algorithmTarget: string) => {
  if (patternTag === 'backtracking') {
    const nestedHelper = extractNestedHelperTarget(algorithmTarget)
    if (nestedHelper) return buildInlineTemplate(patternTag, nestedHelper)
  }
  return buildInlineTemplate(patternTag, algorithmTarget)
}

export const normalizeInlineTemplateTarget = (rawTarget: string, patternTag: string, lens: InlineLens = 'pattern') => {
  const lines = normalizeTyping(rawTarget)
    .split('\n')
    .filter((line) => !isNoteOnlyInlineDecisionLine(line))
  const output = lines.map((line) => appendInlineNote(line, patternTag, lens))
  if (output.some((line) => isInlineDecisionLine(line))) {
    return output.join('\n')
  }

  let insideLoop = false
  const inlineDecisionIndex = lines.findIndex((line) => {
    if (/^\s*(for|while)\b/.test(line)) {
      insideLoop = true
      return false
    }
    return shouldPlaceInlineDecisionNoteAfter(line, insideLoop, patternTag, lens)
  })
  if (inlineDecisionIndex >= 0) {
    output.splice(inlineDecisionIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
  } else {
    const defIndex = lines.findIndex((line) => /^\s*def\s+/.test(line))
    if (defIndex >= 0) {
      output.splice(defIndex + 1, 0, appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    } else {
      output.unshift(appendAlignedNote('', inlineDecisionNoteForPattern(patternTag, lens)))
    }
  }
  return output.join('\n')
}

export const buildPracticePrompt = (templateMode: TemplateMode, patternTag: string) => {
  const patternLabel = patternTag
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Algorithm'

  const focusByPattern: Record<string, Partial<Record<TemplateMode, string>>> = {
    'sliding-window': {
      algorithm: 'code the expand/shrink/update-best loop',
    },
    'two-pointers': {
      algorithm: 'code the inward pointer scan',
    },
    'binary-search': {
      algorithm: 'code the midpoint discard loop',
    },
    'dynamic-programming': {
      algorithm: 'code the state-transition loop',
    },
    dp: {
      algorithm: 'code the state-transition loop',
    },
    graphs: {
      algorithm: 'code the frontier plus visited loop',
    },
    'graph-traversal': {
      algorithm: 'code the frontier plus visited loop',
    },
    'dfs-bfs': {
      algorithm: 'code the frontier plus visited loop',
    },
    backtracking: {
      algorithm: 'code the choose/recurse/undo loop',
    },
    heap: {
      algorithm: 'code the push/prune heap loop',
    },
    'union-find': {
      algorithm: 'code the find/union component loop',
    },
    intervals: {
      algorithm: 'code the sort-and-merge sweep',
    },
    'prefix-sums': {
      algorithm: 'code the prefix query loop',
    },
    'monotonic-stack': {
      algorithm: 'code the pop-then-push stack loop',
    },
    stack: {
      algorithm: 'code the pop-then-push stack loop',
    },
  }

  const defaultFocus: Record<TemplateMode, string> = {
    algorithm: 'code the reusable pattern loop',
  }
  const spiritByPattern: Record<string, string> = {
    'sliding-window': 'turn one pass into a valid-range search',
    'two-pointers': 'use order to eliminate the losing side',
    'binary-search': 'exploit sorted data by discarding half',
    'dynamic-programming': 'reuse solved state instead of recomputing',
    dp: 'reuse solved state instead of recomputing',
    graphs: 'expand the frontier and visit each state once',
    'graph-traversal': 'expand the frontier and visit each state once',
    'dfs-bfs': 'expand the frontier and visit each state once',
    backtracking: 'explore choices cleanly and undo without drift',
    heap: 'keep the best candidates at the top',
    'union-find': 'treat components as roots and merge fast',
    intervals: 'sort boundaries so overlap becomes local',
    'prefix-sums': 'turn range sums into constant-time lookups',
    'monotonic-stack': 'keep only candidates that still matter',
    stack: 'keep only candidates that still matter',
  }
  const focus = focusByPattern[patternTag]?.[templateMode] || defaultFocus[templateMode]
  const spirit = spiritByPattern[patternTag] || 'lean on the reusable pattern instead of brute force'
  return `${patternLabel}: ${spirit}; ${focus}.`
}

export const splitInlineAnnotationLine = (line: string) => {
  const noteOnlyMatch = line.match(new RegExp(`^(\\s{${INLINE_NOTE_COLUMN},})(\\S.*)$`))
  if (noteOnlyMatch) {
    return { code: '', gap: noteOnlyMatch[1], note: noteOnlyMatch[2], noteOnly: true }
  }

  const inlineMatch = line.match(/^(.*?\S)(\s{6,})(\S.*)$/)
  if (inlineMatch) {
    return { code: inlineMatch[1], gap: inlineMatch[2], note: inlineMatch[3], noteOnly: false }
  }

  return { code: line, gap: '', note: '', noteOnly: false }
}

export const isInlineDecisionLine = (line: string) => {
  const { note, noteOnly } = splitInlineAnnotationLine(line)
  if (!noteOnly) return false
  return /\b(window|answer|state|frontier|path|heap|roots|merged|seen|stack|take|skip|best|rule|choice|decision)\b/i.test(note)
}

export const isNoteOnlyInlineDecisionLine = (line: string) => {
  const match = line.match(new RegExp(`^\\s{${INLINE_NOTE_COLUMN},}(\\S.*)$`))
  if (!match) return false
  return isInlineDecisionLine(appendAlignedNote('', match[1]))
}

export const stripInlineAnnotationNotes = (code: string) =>
  code
    .split('\n')
    .map((line) => splitInlineAnnotationLine(line).code)
    .join('\n')
    .trimEnd()

export const stripHashAnnotationComments = (code: string) =>
  code
    .split('\n')
    .map((line) => line.split('#', 1)[0].trimEnd())
    .join('\n')
    .trimEnd()

export const inlineDisplayLines = (code: string) => {
  const displayLines: Array<{ line: string, sourceLineNumber: number, absorbedDecision: boolean }> = []
  code.split('\n').forEach((line, index) => {
    const parts = splitInlineAnnotationLine(line)
    if (parts.noteOnly && displayLines.length > 0) {
      const previous = displayLines[displayLines.length - 1]
      const previousParts = splitInlineAnnotationLine(previous.line)
      if (previousParts.code.trim()) {
        const combinedNote = [previousParts.note, parts.note].filter((note) => note.trim()).join(' / ')
        previous.line = appendAlignedNote(previousParts.code, combinedNote)
        previous.absorbedDecision = previous.absorbedDecision || isInlineDecisionLine(line)
        return
      }
    }
    displayLines.push({ line, sourceLineNumber: index + 1, absorbedDecision: false })
  })
  return displayLines
}

export const capitalizeInlineTask = (value: string) => {
  const trimmed = value.trim().replace(/[.]+$/, '')
  return trimmed ? `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}.` : ''
}

export const fallbackInlineTaskForLine = (line: string) => {
  const trimmed = line.trim()
  if (/^(async\s+)?def\b|^(export\s+)?(async\s+)?function\b/.test(trimmed)) {
    return 'Define a function that accepts the inputs needed for this problem.'
  }
  if (/^for\b/.test(trimmed)) return 'Visit the next part of the input while keeping the current item available.'
  if (/^while\b/.test(trimmed)) return 'Repeat the core step while its controlling condition still holds.'
  if (/^(if|elif)\b/.test(trimmed)) return 'Check the condition that decides whether this path can continue.'
  if (/^else\b/.test(trimmed)) return 'Handle the remaining case.'
  if (/^return\s+(true|True)\b/.test(trimmed)) return 'Report success once every required step has held.'
  if (/^return\s+(false|False)\b/.test(trimmed)) return 'Stop and report that the goal cannot be completed.'
  if (/^return\b/.test(trimmed)) return 'Return the result produced by the completed state.'
  if (/^[\w,[\]().\s]+\s*=\s*/.test(trimmed)) return 'Set up or update the state needed for the next decision.'
  if (/\.(append|add|push|enqueue)\(/.test(trimmed)) return 'Record the current item so it can contribute later.'
  if (/\.(pop|remove|discard|dequeue)\(/.test(trimmed)) return 'Remove the item that no longer belongs in the active state.'
  return 'Carry out the next state-changing step.'
}

export const buildInlineTaskProgression = (plainTarget: string, inlineTarget: string) => {
  const inlineRows = inlineTarget
    .split('\n')
    .map((line) => splitInlineAnnotationLine(line))
    .filter((parts) => parts.code.trim())

  return plainTarget
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      const note = inlineRows[index]?.note.trim() ?? ''
      return note ? capitalizeInlineTask(note) : fallbackInlineTaskForLine(line)
    })
}
