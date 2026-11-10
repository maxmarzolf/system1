import { playlistQuestionsToSkillMap, type PracticePlaylist } from '@/shared/data/playlists'
import type { SkillMapNode } from '@/shared/data/skill-map'
import { DEFAULT_TEMPLATE_MODES, TEMPLATE_MODE_ORDER, patternLabelFromSlug, patternToSlug } from './patterns'
import type { TemplateMode } from './types'

/**
 * What the practice page was asked to drill, read from its URL:
 * `?playlist=`, `?focusPattern=` (with optional `focusMethod=` and `focusMode=`), or `?focusTag=`.
 * With none of them it is a random core-algorithm deck.
 */
export type PracticeFocus = {
  focusedPatternSlug: string
  focusedTagSlug: string
  focusedPatternLabel: string
  requestedPlaylist: PracticePlaylist | null
  /** Waiting on the served taxonomy before a focused pattern can be resolved. */
  focusedCardPending: boolean
  /** The taxonomy is in and has no such pattern. */
  focusedCardNotFound: boolean
  requestedSkillMap: SkillMapNode[]
  requestedSkillMapSignature: string
  requestedTemplateMode: TemplateMode
  requestedTemplateTargets: Record<string, Partial<Record<TemplateMode, string>>>
  requestedQuestionType: string
}

export function resolvePracticeFocus({
  searchParams,
  playlists,
  skillMap,
  skillMapResolved,
}: {
  searchParams: URLSearchParams
  playlists: PracticePlaylist[]
  skillMap: SkillMapNode[]
  skillMapResolved: boolean
}): PracticeFocus {
  const param = (name: string) => searchParams.get(name)?.trim() || ''
  const focusedPatternSlug = param('focusPattern')
  const focusedTagSlug = param('focusTag')
  const focusedModeParam = param('focusMode')
  const requestedPlaylistSlug = param('playlist')
  const focusedMethods = new Set(searchParams.getAll('focusMethod').map((method) => method.trim()).filter(Boolean))

  const requestedPlaylist = playlists.find((playlist) => playlist.slug === requestedPlaylistSlug) ?? null
  const focusedPatternNode = skillMap.find((node) => patternToSlug(node.algorithm) === focusedPatternSlug) ?? null
  const patternFocused = Boolean(focusedPatternSlug && !requestedPlaylist)

  const requestedSkillMap = (() => {
    if (requestedPlaylist) return playlistQuestionsToSkillMap(requestedPlaylist)
    if (!focusedPatternNode) return skillMap
    const chosen = focusedMethods.size > 0
      ? focusedPatternNode.skills.filter((method) => focusedMethods.has(method))
      : focusedPatternNode.skills
    const methods = chosen.length > 0 ? chosen : focusedPatternNode.skills
    return methods.map((method) => ({ algorithm: focusedPatternNode.algorithm, skills: [method] }))
  })()

  const requestedTemplateMode = TEMPLATE_MODE_ORDER.includes(focusedModeParam as TemplateMode)
    ? focusedModeParam as TemplateMode
    : DEFAULT_TEMPLATE_MODES[0]

  return {
    focusedPatternSlug,
    focusedTagSlug,
    focusedPatternLabel: focusedPatternNode?.algorithm ?? patternLabelFromSlug(focusedPatternSlug),
    requestedPlaylist,
    focusedCardPending: patternFocused && !skillMapResolved,
    focusedCardNotFound: patternFocused && skillMapResolved && !focusedPatternNode,
    requestedSkillMap,
    requestedSkillMapSignature: JSON.stringify(requestedSkillMap),
    requestedTemplateMode,
    requestedTemplateTargets: Object.fromEntries(requestedSkillMap.map((node) => [patternToSlug(node.algorithm), {}])),
    requestedQuestionType: requestedPlaylist
      ? `playlist:${requestedPlaylist.slug}`
      : focusedTagSlug
        ? `tag:${focusedTagSlug}`
        : focusedPatternSlug
          ? 'skill-map-core-algorithm'
          : 'skill-map',
  }
}
