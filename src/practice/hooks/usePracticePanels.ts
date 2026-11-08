import { useEffect, useState } from 'react'

/**
 * What is open around the practice card: Zen mode, the Flow panel, the related-problems drawer,
 * the tag list, the header controls and the Ladder. Opening one side panel closes the others,
 * and Escape leaves Zen mode or closes the Flow panel.
 */
export function usePracticePanels({ flowOpenOnArrival, relatedKey }: {
  /** `/?panel=flow` (the Journey page's /build button) opens the Flow panel on arrival. */
  flowOpenOnArrival: boolean
  /** The related drawer closes whenever this changes (a different card or problem set). */
  relatedKey: string
}) {
  const [zen, setZen] = useState(false)
  const [flowOpen, setFlowOpen] = useState(flowOpenOnArrival)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [relatedFor, setRelatedFor] = useState(relatedKey)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [ladderCardId, setLadderCardId] = useState<string | null>(null)

  if (relatedFor !== relatedKey) {
    setRelatedFor(relatedKey)
    setRelatedOpen(false)
  }

  useEffect(() => {
    if (!zen && !flowOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setZen(false)
      setFlowOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flowOpen, zen])

  return {
    zen,
    flowOpen,
    relatedOpen,
    tagsExpanded,
    controlsOpen,
    ladderCardId,
    toggleZen: () => {
      if (!zen) {
        setFlowOpen(false)
        setRelatedOpen(false)
        setTagsExpanded(false)
      }
      setZen((current) => !current)
    },
    toggleFlow: () => {
      setLadderCardId(null)
      setRelatedOpen(false)
      setFlowOpen((open) => !open)
    },
    closeFlow: () => setFlowOpen(false),
    toggleRelated: () => {
      setFlowOpen(false)
      setRelatedOpen((open) => !open)
    },
    closeRelated: () => setRelatedOpen(false),
    toggleTags: () => setTagsExpanded((expanded) => !expanded),
    closeTags: () => setTagsExpanded(false),
    toggleControls: () => setControlsOpen((open) => !open),
    toggleLadder: (cardId: string) => {
      setFlowOpen(false)
      setRelatedOpen(false)
      setLadderCardId((current) => (current === cardId ? null : cardId))
    },
    closeLadder: () => setLadderCardId(null),
  }
}

export type PracticePanels = ReturnType<typeof usePracticePanels>
