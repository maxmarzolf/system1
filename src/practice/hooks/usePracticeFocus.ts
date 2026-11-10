import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCatalogPlaylists, useSkillMap } from '../../api/queries'
import { practicePlaylists, type PracticePlaylist } from '../../data/playlists'
import { skillMap as bundledSkillMap, type SkillMapNode } from '../../data/skill-map'
import { resolvePracticeFocus } from '../focus'

const servedOrNull = <T,>(value: T[] | undefined | null) => (Array.isArray(value) && value.length > 0 ? value : null)

/**
 * What the URL asks the practice page to drill, resolved against the served catalog and taxonomy
 * (the bundled copies stand in while the API is unavailable or empty).
 */
export function usePracticeFocus() {
  const [searchParams, setSearchParams] = useSearchParams()
  const playlists = servedOrNull(useCatalogPlaylists<{ playlists?: PracticePlaylist[] }>().data?.playlists) ?? practicePlaylists
  const skillMapQuery = useSkillMap<SkillMapNode[]>()
  const skillMap = servedOrNull(skillMapQuery.data) ?? bundledSkillMap
  const skillMapResolved = !skillMapQuery.isPending
  const focus = useMemo(
    () => resolvePracticeFocus({ searchParams, playlists, skillMap, skillMapResolved }),
    [playlists, searchParams, skillMap, skillMapResolved],
  )
  return {
    focus,
    /** `?panel=flow` (Journey's /build link) opens the Flow panel on arrival. */
    flowPanelRequested: searchParams.get('panel') === 'flow',
    /** Focus the deck on ``tag``, or clear the focus when it is already the focused tag. */
    toggleTag: (tag: string) => setSearchParams(tag === focus.focusedTagSlug ? {} : { focusTag: tag }),
  }
}
