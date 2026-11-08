import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSearchParams } from 'react-router-dom'
import FlowBuilder from './FlowBuilder'
import { FLOW_LABELS, buildFlowTransitionCopy, buildFlowGenerationContext, expandFlow, loadFlowConfig, mergeFlowAttempts, nextFlowStep, saveFlowConfig, summarizeFlowMastery, type FlowAttempt, type FlowConfig, type FlowStage, type SubmissionModality } from './practiceFlow'
import RelatedLeetCodeDrawer from './RelatedLeetCodeDrawer'
import { skillMap, type SkillMapNode } from './data/skill-map'
import { practicePlaylists, type PracticePlaylist } from './data/playlists'
import { resolveRelatedLeetCodeSet } from './data/related-leetcode'
import { loadStoredSubmissionTuning, saveStoredSubmissionTuning } from './submissionTuning'
import { loadStoredCodeEditorTuning, saveStoredCodeEditorTuning } from './codeEditorTuning'
import { loadStoredMcqTuning } from './mcqTuning'
import { loadStoredGooglePlaylistTuning } from './googlePlaylistTuning'
import { useCatalogPlaylists, useSkillMap } from './api/queries'
import { useConfiguredProviderLabel } from './llmProviderDefault'
import TopNav from './TopNav'
import { useTheme } from './theme'
import RecallCodeEditor, { type RecallCodeEditorHandle, type RecallEditorLineMeta } from './RecallCodeEditor'
import SlidingWindowLadder from './WindowLadderPanel'
import { slidingWindowTechnique } from './windowLadderPlan'
import { matchesHotkey, type PracticeFlowStage } from './hotkeys'
import { FlowCoachTransition, FlowMicroDrillCard } from './practice/FlowMicroDrillCard'
import { compactFeedbackItems, flowEvaluationScore, flowEvaluationWeaknesses, flowModalityWeakness, requestFlowAttemptHistory } from './practice/flowHistory'
import { inlineDisplayLines, normalizeTyping, splitInlineAnnotationLine } from './practice/inlineNotes'
import { buildFlowFocusSummary, buildFlowGhostScaffold, buildFlowGhostTarget, computeLineReview, createInteractionId, extractFlowGhostFocusedInput, firstIncompleteGhostLineNumber, initialFlowFocus, nextFlowAnchor, nextGhostLineNumber, summarizeFlowFocusLine, summarizeRecallAttempt, toMultipleChoiceFocusLines } from './practice/lineReview'
import { MarkdownCodeContent } from './practice/markdown'
import { usePracticeSession, useSessionPlan } from './practice/hooks/usePracticeSession'
import { useFlowMultipleChoiceDeck, useMultipleChoiceDeck, useRecallDeck } from './practice/hooks/useDecks'
import { MULTIPLE_CHOICE_DIFFICULTY, cardSpecimen, flowMultipleChoiceRequest, multipleChoiceDeckRequest } from './practice/mcqRequests'
import PrimaryActionIcon from './practice/components/PrimaryActionIcon'
import { resolvePracticeFocus } from './practice/focus'
import { resolvePrimaryAction, type PrimaryActionKind } from './practice/primaryAction'
import { INLINE_LENS, RECALL_TARGET_MODE, derivePracticeTargets } from './practice/targets'
import { focusMicroDrillInput } from './practice/markdownText'
import { TEMPLATE_MODE_LABELS } from './practice/patterns'
import { postAttempt, rejectionReason } from './practice/requests'
import { FLOW_TRANSITION_MINIMUM_MS, FLOW_TRANSITION_SETTLE_MS, INLINE_FEEDBACK_ENABLED, emptySkillMapCard, EMPTY_FLOW_MICRODRILL_ACTION_STATE, type AnnotatedDisplayLine, type AttemptPayload, type CoachAttemptFeedback, type Flashcard, type FlowMicroDrillPrimaryActionState, type LlmProviderSelection, type MultipleChoiceChoice, type MultipleChoiceSpecimenContext, type PracticeFlowState, type PracticeFlowTransitionState, type PracticeMode, type RecallAttemptSnapshot, type SubmissionFailureModalState, type SubmissionSaveResponse, type SupportLayer, type TemplateMode } from './practice/types'

function App() {
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('recall')
  const [mcqSourceSpecimen, setMcqSourceSpecimen] = useState<MultipleChoiceSpecimenContext | null>(null)
  const [mcqRequestId, setMcqRequestId] = useState(0)
  const [supportLayer, setSupportLayer] = useState<SupportLayer>('none')
  // The served catalog and taxonomy; the bundled copies stay the fallback when the API is unavailable or empty.
  const servedPlaylists = useCatalogPlaylists<{ playlists?: PracticePlaylist[] }>().data?.playlists
  const catalogPlaylists = Array.isArray(servedPlaylists) && servedPlaylists.length > 0 ? servedPlaylists : null
  const skillMapQuery = useSkillMap<SkillMapNode[]>()
  const catalogSkillMap = Array.isArray(skillMapQuery.data) && skillMapQuery.data.length > 0 ? skillMapQuery.data : null
  const catalogSkillMapResolved = !skillMapQuery.isPending
  const [inlineEnabled, setInlineEnabled] = useState(false)
  const [inlineTaskProgress, setInlineTaskProgress] = useState(0)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [relatedDrawerOpen, setRelatedDrawerOpen] = useState(false)
  // /?panel=flow (the Journey page's /build button) opens the Flow configuration on arrival.
  const [flowDrawerOpen, setFlowDrawerOpen] = useState(() => searchParams.get('panel') === 'flow')
  const [zenMode, setZenMode] = useState(false)
  const [headerControlsOpen, setHeaderControlsOpen] = useState(true)
  const flowInteractionVersionRef = useRef(0)
  const [flowConfig, setFlowConfig] = useState(loadFlowConfig)
  const [practiceFlow, setPracticeFlow] = useState<PracticeFlowState | null>(null)
  const [flowTransition, setFlowTransition] = useState<PracticeFlowTransitionState | null>(null)
  const [flowTransitionSettlingId, setFlowTransitionSettlingId] = useState<string | null>(null)
  const [flowAttempts, setFlowAttempts] = useState<FlowAttempt[]>([])
  const flowAttemptsRef = useRef<FlowAttempt[]>([])
  const [flowHistoryLoading, setFlowHistoryLoading] = useState(false)
  const [flowHistoryError, setFlowHistoryError] = useState('')
  const [flowMultipleChoicePosition, setFlowMultipleChoicePosition] = useState(0)
  const [flowMultipleChoiceSelectedChoiceId, setFlowMultipleChoiceSelectedChoiceId] = useState('')
  const [flowMultipleChoiceStartedAt, setFlowMultipleChoiceStartedAt] = useState<number | null>(null)
  const [flowMultipleChoiceSubmittedByCard, setFlowMultipleChoiceSubmittedByCard] = useState<Record<string, string>>({})
  const [flowMicroDrillPrimaryActionState, setFlowMicroDrillPrimaryActionState] = useState<FlowMicroDrillPrimaryActionState>(EMPTY_FLOW_MICRODRILL_ACTION_STATE)
  const flowMicroDrillPrimaryActionRef = useRef<() => void>(() => undefined)
  const primaryCardButtonRef = useRef<HTMLButtonElement | null>(null)

  const llmProvider: LlmProviderSelection = 'auto'
  const configuredProviderLabel = useConfiguredProviderLabel()
  const requestLlmProvider = llmProvider === 'auto' ? '' : llmProvider

  const [aiCompletionShownThisAttempt, setAiCompletionShownThisAttempt] = useState(false)
  const [aiCompletionStatus, setAiCompletionStatus] = useState('')

  const [mainPhase, setMainPhase] = useState<'preview' | 'typing' | 'submitted'>('preview')
  const [mainInput, setMainInput] = useState('')
  const [mainStartedAt, setMainStartedAt] = useState<number | null>(null)
  const [mainCloseEnough, setMainCloseEnough] = useState(false)
  const [multipleChoiceSelectedChoiceId, setMultipleChoiceSelectedChoiceId] = useState('')
  const [multipleChoiceStartedAt, setMultipleChoiceStartedAt] = useState<number | null>(null)
  const [multipleChoiceSubmittedByCard, setMultipleChoiceSubmittedByCard] = useState<Record<string, string>>({})
  // Server (Jev) grade per card id; the browser never decides correctness.
  const [multipleChoiceResultByCard, setMultipleChoiceResultByCard] = useState<Record<string, boolean>>({})
  const [multipleChoiceGrading, setMultipleChoiceGrading] = useState(false)
  const [multipleChoiceSubmitError, setMultipleChoiceSubmitError] = useState('')
  const [currentInteractionId, setCurrentInteractionId] = useState('')
  const [mainRecallHistoryByCard, setMainRecallHistoryByCard] = useState<Record<string, RecallAttemptSnapshot[]>>({})
  const [submissionTuning] = useState(() => loadStoredSubmissionTuning())
  const [ladderActiveCardId, setLadderActiveCardId] = useState<string | null>(null)
  const [codeEditorTuning, setCodeEditorTuning] = useState(() => loadStoredCodeEditorTuning())
  const syntaxTheme = theme === 'light-high-contrast' ? vs : vscDarkPlus
  const [, setCoachFeedback] = useState<CoachAttemptFeedback | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [submissionFailureModal, setSubmissionFailureModal] = useState<SubmissionFailureModalState | null>(null)
  const mcqTuning = useMemo(() => loadStoredMcqTuning(), [])
  const googlePlaylistTuning = useMemo(() => loadStoredGooglePlaylistTuning(), [])
  const multipleChoiceQuestionCount = mcqTuning.questionCount
  const mainInputRef = useRef<RecallCodeEditorHandle | null>(null)
  const flowStageContentRef = useRef<HTMLDivElement | null>(null)
  const shouldFocusMainInputRef = useRef(false)
  const pendingGhostFocusLineRef = useRef<number | null>(null)
  const previewCodeContainerRef = useRef<HTMLDivElement | null>(null)
  const [recallMinHeight, setRecallMinHeight] = useState<number | undefined>(undefined)
  const recallEvaluationPendingRef = useRef(false)
  const availablePlaylists = catalogPlaylists ?? practicePlaylists
  const availableSkillMap = catalogSkillMap ?? skillMap
  const practiceFocus = useMemo(
    () => resolvePracticeFocus({ searchParams, playlists: availablePlaylists, skillMap: availableSkillMap, skillMapResolved: catalogSkillMapResolved }),
    [availablePlaylists, availableSkillMap, catalogSkillMapResolved, searchParams],
  )
  const { focusedPatternSlug, focusedTagSlug, focusedPatternLabel, requestedPlaylist, focusedCardPending, focusedCardNotFound, requestedQuestionType } = practiceFocus
  const recallDeck = useRecallDeck(practiceFocus, googlePlaylistTuning.order, requestLlmProvider)
  const filteredDeck = recallDeck.deck
  const skillMapLoading = recallDeck.loading
  const mcqDeck = useMultipleChoiceDeck(
    practiceMode === 'multiple-choice' && mcqSourceSpecimen
      ? multipleChoiceDeckRequest(mcqSourceSpecimen, { count: multipleChoiceQuestionCount, flowMode: mcqTuning.flowMode, llmProvider: requestLlmProvider })
      : null,
    mcqRequestId,
    requestedQuestionType,
  )
  const multipleChoiceDeck = mcqDeck.deck
  const multipleChoiceLoading = mcqDeck.loading
  const session = usePracticeSession({ disabled: practiceFlow !== null, onMove: () => setLadderActiveCardId(null) })
  const currentTemplateMode: TemplateMode = 'algorithm'

  const startSession = (deckLength: number) => {
    session.start(deckLength)
    sessionPlan.reset()

    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setInlineTaskProgress(0)
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setMultipleChoiceSubmittedByCard({})
    setMultipleChoiceSubmitError('')
    setCurrentInteractionId('')
    setMainRecallHistoryByCard({})
    setAiCompletionShownThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
  }

  useEffect(() => {
    saveStoredSubmissionTuning(submissionTuning)
  }, [submissionTuning])

  useEffect(() => {
    saveStoredCodeEditorTuning(codeEditorTuning)
  }, [codeEditorTuning])

  useEffect(() => {
    if (practiceMode !== 'recall') return
    if (skillMapLoading) return
    startSession(filteredDeck.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, recallDeck.loadedAt, skillMapLoading])

  useEffect(() => {
    if (practiceMode !== 'multiple-choice') return
    if (multipleChoiceLoading) return
    startSession(multipleChoiceDeck.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceMode, mcqDeck.loadedAt, multipleChoiceLoading])

  const currentDeckIndex = session.currentIndex
  const card = (practiceFlow ? filteredDeck.find(item => item.id === practiceFlow.anchorCardId) : filteredDeck[currentDeckIndex]) ?? filteredDeck[0] ?? emptySkillMapCard
  const ladderTechnique = slidingWindowTechnique(card)
  const { practiceTarget, inlineTaskProgression, practicePrompt } = useMemo(() => derivePracticeTargets(card), [card])
  const currentFlowAttempts = useMemo(
    () => practiceFlow ? flowAttempts.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId) : [],
    [flowAttempts, practiceFlow]
  )
  const flowMastery = useMemo(() => summarizeFlowMastery(currentFlowAttempts), [currentFlowAttempts])
  const flowGenerationContext = useMemo(() => buildFlowGenerationContext(currentFlowAttempts), [currentFlowAttempts])
  const flowMcqDeck = useFlowMultipleChoiceDeck(
    practiceFlow?.stage === 'multiple-choice'
      ? flowMultipleChoiceRequest({ flow: practiceFlow, card, prompt: practicePrompt, target: practiceTarget, context: flowGenerationContext, llmProvider: requestLlmProvider })
      : null,
    practiceFlow ? { runId: practiceFlow.runId, step: practiceFlow.step } : null,
  )
  const flowMultipleChoiceDeck = flowMcqDeck.deck
  const multipleChoiceCard = multipleChoiceDeck[currentDeckIndex] ?? multipleChoiceDeck[0] ?? null
  const flowMultipleChoiceCard = flowMultipleChoiceDeck[flowMultipleChoicePosition] ?? flowMultipleChoiceDeck[0] ?? null
  const isFlowActive = practiceFlow !== null
  const ladderActive = ladderActiveCardId === card.id && ladderTechnique !== null
  const currentPracticeMode: PracticeMode = practiceFlow
    ? (practiceFlow.stage === 'multiple-choice' ? 'multiple-choice' : 'recall')
    : practiceMode
  const effectiveSupportLayer: SupportLayer = practiceFlow?.stage === 'ghost' ? 'ghost-reps' : supportLayer
  const activeMultipleChoiceCard = isFlowActive ? flowMultipleChoiceCard : multipleChoiceCard
  const activeCardId = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.id ?? '' : card.id
  const activeCardTitle = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.title ?? 'Multiple Choice' : card.title
  const activeCardDifficulty = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.difficulty ?? MULTIPLE_CHOICE_DIFFICULTY : card.difficulty
  const activeCardTags = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.tags ?? [] : card.tags
  const headerCardTitle = isFlowActive ? practiceFlow?.anchorTitle ?? card.title : activeCardTitle
  const headerCardDifficulty = isFlowActive ? card.difficulty : activeCardDifficulty
  const headerCardDifficultyLabel = headerCardDifficulty === 'Med.' ? 'Medium' : headerCardDifficulty
  const headerCardTags = isFlowActive ? card.tags : activeCardTags
  const isCoreAlgorithmCard = headerCardTags.includes('core-algorithm')
  const isMetaCard = headerCardTags.includes('core-meta') || headerCardTags.includes('meta')
  const skeletonReference = card.skeletonApplicability ?? null
  const tagsListId = `card-tags-${card.id}`

  const flowGhostTarget = useMemo(
    () => buildFlowGhostTarget(practiceFlow?.focus.missedLines ?? []),
    [practiceFlow]
  )
  const flowGhostScaffold = useMemo(
    () => buildFlowGhostScaffold(practiceTarget, practiceFlow?.focus.missedLines ?? []),
    [practiceFlow, practiceTarget]
  )
  const currentRecallSubmissionInput = useMemo(
    () => practiceFlow?.stage === 'ghost'
      ? extractFlowGhostFocusedInput(mainInput, practiceFlow.focus.missedLines)
      : normalizeTyping(mainInput),
    [mainInput, practiceFlow]
  )
  const activeRecallTarget = practiceFlow?.stage === 'ghost' && flowGhostTarget ? flowGhostTarget : practiceTarget
  const currentQuestionType = `${requestedQuestionType}:${RECALL_TARGET_MODE}${inlineEnabled ? `:${INLINE_LENS}` : ''}`
  const currentMultipleChoiceQuestionType = isFlowActive
    ? `skill-map-mcq:card:progressive:flow-cycle-${practiceFlow?.cycle ?? 1}`
    : `skill-map-mcq:card:${mcqTuning.flowMode}`
  const currentSkillTags = useMemo(
    () => [
      ...card.tags,
      `template-${currentTemplateMode}`,
      `target-${RECALL_TARGET_MODE}`,
      ...(inlineEnabled ? [`inline-${INLINE_LENS}`] : []),
      ...(isFlowActive && practiceFlow
        ? ['mode-flow', `flow-stage-${practiceFlow.stage}`, `flow-cycle-${practiceFlow.cycle}`]
        : []),
    ],
    [card.tags, currentTemplateMode, inlineEnabled, isFlowActive, practiceFlow]
  )
  const currentRecallHistoryKey = `${card.id}:${currentTemplateMode}:${RECALL_TARGET_MODE}:${inlineEnabled ? INLINE_LENS : 'plain'}`
  const currentMultipleChoiceSkillTags = useMemo(
    () => [
      ...(activeMultipleChoiceCard?.tags ?? []),
      'mode-multiple-choice',
      'source-card',
      `flow-${isFlowActive ? 'progressive' : mcqTuning.flowMode}`,
      `difficulty-${MULTIPLE_CHOICE_DIFFICULTY === 'Hard' ? 'hard' : 'med'}`,
      ...(isFlowActive && practiceFlow ? ['mode-flow', `flow-cycle-${practiceFlow.cycle}`] : []),
    ],
    [activeMultipleChoiceCard?.tags, isFlowActive, mcqTuning.flowMode, practiceFlow]
  )
  const visibleCardTags = useMemo(
    () => headerCardTags.filter((tag) => tag !== 'skill-map' && tag !== 'skill-map-mcq'),
    [headerCardTags]
  )
  const headerBadgeLabels = [
    ...(!skeletonReference ? [headerCardDifficultyLabel] : []),
    ...(isCoreAlgorithmCard ? ['Core'] : []),
    ...(isMetaCard ? ['Meta'] : []),
  ]
  const hasHeaderDetails = headerBadgeLabels.length > 0 || visibleCardTags.length > 0


  const handleTagClick = (tag: string) => {
    setTagsExpanded(false)
    setSearchParams(tag === focusedTagSlug ? {} : { focusTag: tag })
  }

  const hasRecallDeck = filteredDeck.length > 0
  const hasMultipleChoiceDeck = isFlowActive ? flowMultipleChoiceDeck.length > 0 : multipleChoiceDeck.length > 0
  const hasDeck = currentPracticeMode === 'multiple-choice' ? hasMultipleChoiceDeck : hasRecallDeck
  const activeDeck = currentPracticeMode === 'multiple-choice' ? (isFlowActive ? flowMcqDeck : mcqDeck) : recallDeck
  const activeLoading = activeDeck.loading
  const activeError = activeDeck.error
  const isGhostRepsEnabled = effectiveSupportLayer === 'ghost-reps'
  const currentInlineTask = inlineEnabled && mainPhase === 'typing' && !isGhostRepsEnabled
    ? inlineTaskProgression[inlineTaskProgress]
    : undefined
  const hasAnsweredCurrent = !isFlowActive && session.hasResult(activeCardId)
  const sessionPlan = useSessionPlan({
    session,
    enabled: currentPracticeMode !== 'multiple-choice',
    deck: filteredDeck,
    questionType: requestedQuestionType,
    llmProvider: requestLlmProvider,
  })
  const practiceHistoryHref = useMemo(() => {
    if (!hasDeck) return '/practice-history'

    if (currentPracticeMode === 'multiple-choice' && activeMultipleChoiceCard) {
      const searchParams = new URLSearchParams({
        cardId: activeMultipleChoiceCard.id,
        cardTitle: activeMultipleChoiceCard.title,
        questionType: currentMultipleChoiceQuestionType,
      })

      currentMultipleChoiceSkillTags.forEach((tag) => {
        searchParams.append('tag', tag)
      })

      return `/practice-history?${searchParams.toString()}`
    }

    const searchParams = new URLSearchParams({
      cardId: card.id,
      cardTitle: card.title,
      questionType: currentQuestionType,
    })

    currentSkillTags.forEach((tag) => {
      searchParams.append('tag', tag)
    })

    return `/practice-history?${searchParams.toString()}`
  }, [
    card.id,
    card.title,
    currentPracticeMode,
    activeMultipleChoiceCard,
    currentMultipleChoiceQuestionType,
    currentMultipleChoiceSkillTags,
    currentQuestionType,
    currentSkillTags,
    hasDeck,
  ])
  const currentTemplateLabel = TEMPLATE_MODE_LABELS[currentTemplateMode]
  const activeRecallLabel = currentTemplateLabel
  const practiceLanguage = codeEditorTuning.language
  const targetedGhostLineCount = practiceFlow?.focus.missedLines.filter((line) => line.expected.trim().length > 0).length ?? 0
  const practiceInputLabel = 'Type the full algorithm from memory'
  const supportedPracticeInputLabel = isGhostRepsEnabled
    ? practiceFlow?.stage === 'ghost'
      ? `Type only the ${targetedGhostLineCount || practiceFlow.focus.missedLines.length} targeted line${(targetedGhostLineCount || practiceFlow.focus.missedLines.length) === 1 ? '' : 's'} from memory`
      : `${practiceInputLabel} with Ghost Reps`
    : practiceInputLabel
  const practicePlaceholder = 'Type the full algorithm from memory...'
  const supportedPracticePlaceholder = isGhostRepsEnabled
    ? practiceFlow?.stage === 'ghost'
      ? 'Trace only the lines you missed on the last recall...'
      : `Trace the faint ${activeRecallLabel.toLowerCase()} target here...`
    : practicePlaceholder
  const relatedLeetCodeSet = useMemo(
    () => currentPracticeMode === 'recall'
      ? resolveRelatedLeetCodeSet({
          title: card.title,
          examples: card.plainEnglishPromptDetail?.leetcodeExamples ?? [],
        })
      : null,
    [card.plainEnglishPromptDetail?.leetcodeExamples, card.title, currentPracticeMode]
  )

  useEffect(() => {
    setRelatedDrawerOpen(false)
  }, [card.id, currentTemplateMode, relatedLeetCodeSet?.heading])

  const completeCardInSession = (isCorrect: boolean, elapsedMs?: number) => session.complete(activeCardId, isCorrect, elapsedMs)

  const addFlowAttempts = (incoming: FlowAttempt[]) => {
    const merged = mergeFlowAttempts(flowAttemptsRef.current, incoming)
    flowAttemptsRef.current = merged
    setFlowAttempts(merged)
    return merged
  }

  const loadFlowHistoryForCard = async (anchorCard: Flashcard) => {
    setFlowHistoryLoading(true)
    setFlowHistoryError('')
    try {
      const loaded = await requestFlowAttemptHistory(anchorCard)
      return addFlowAttempts(loaded).filter((attempt) => attempt.anchorCardId === anchorCard.id)
    } catch {
      setFlowHistoryError('Previous attempts are unavailable; this flow will adapt from the current run.')
      return flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === anchorCard.id)
    } finally {
      setFlowHistoryLoading(false)
    }
  }

  const currentFlowSignals = (): Record<string, unknown> | undefined => {
    if (!practiceFlow) return undefined
    return {
      runId: practiceFlow.runId,
      anchorCardId: practiceFlow.anchorCardId,
      anchorTitle: practiceFlow.anchorTitle,
      stage: practiceFlow.stage,
      step: practiceFlow.step,
      cycle: practiceFlow.cycle,
      phase: flowMastery.phase,
      proficiency: flowMastery.proficiency,
      successfulModalities: flowMastery.successfulModalities,
      weaknessSummary: flowMastery.weaknesses.join('; '),
      completedAnchorCount: practiceFlow.completedAnchorIds.length,
    }
  }

  const recordFlowSubmission = ({
    response,
    flowSignals,
    modality,
    modalitySignals,
    elapsedMs,
    interactionId,
    question,
  }: {
    response: SubmissionSaveResponse
    flowSignals: Record<string, unknown>
    modality: SubmissionModality
    modalitySignals: Record<string, unknown>
    elapsedMs: number
    interactionId: string
    question: string
  }) => {
    const anchorCardId = String(flowSignals.anchorCardId ?? '')
    if (!anchorCardId || !response.saved) return
    const missedLineCount = Number(modalitySignals.missedLineCount ?? 0)
    const evaluation = response.evaluation as unknown as Record<string, unknown>
    addFlowAttempts([{
      attemptId: response.attemptId,
      interactionId,
      anchorCardId,
      modality,
      successful: response.successful,
      score: flowEvaluationScore(evaluation),
      elapsedMs,
      missedLineCount: Number.isFinite(missedLineCount) ? Math.max(0, missedLineCount) : 0,
      weaknesses: compactFeedbackItems([
        ...flowEvaluationWeaknesses(evaluation, missedLineCount),
        flowModalityWeakness(modality, response.successful),
      ]),
      question,
      createdAt: new Date().toISOString(),
    }])
  }

  const submitAttemptToServer = async (payload: AttemptPayload) => {
    const flowSignals = payload.outsideFlow ? null : currentFlowSignals()
    const categoryTags = payload.outsideFlow ? card.tags : currentSkillTags
    const requestSignals = {
      ...(payload.signals ?? {}),
      ...(flowSignals ? { flow: flowSignals } : {}),
      modality: {
        ...(payload.signals?.modality ?? {}),
        kind: payload.modality,
      },
    }
    const saved = await postAttempt({
      cardId: card.id,
      cardTitle: card.title,
      question: payload.question ?? practicePrompt,
      questionType: payload.microdrill ? `${currentQuestionType}:microdrill` : currentQuestionType,
      categoryTags,
      correctAnswer: payload.correctAnswer,
      userAnswer: payload.userAnswer,
      mode: payload.mode,
      elapsedMs: payload.elapsedMs,
      sessionId: payload.sessionId ?? (flowSignals?.runId as string | undefined),
      interactionId: payload.interactionId,
      generatedCardId: card.id,
      generatedCard: { ...card, prompt: payload.question ?? practicePrompt },
      templateMode: payload.templateMode,
      supportLayer: payload.supportLayer,
      modality: payload.modality,
      signals: requestSignals,
      liveCoachUsed: payload.liveCoachUsed,
      submissionTuning: { ...submissionTuning, microDrillEnabled: false },
      llmProvider: requestLlmProvider,
    })
    if (flowSignals) {
      recordFlowSubmission({
        response: saved,
        flowSignals,
        modality: payload.modality,
        modalitySignals: payload.signals?.modality ?? {},
        elapsedMs: payload.elapsedMs,
        interactionId: payload.interactionId,
        question: payload.question ?? practicePrompt,
      })
    }
    return saved
  }

  const submitMultipleChoiceAttemptToServer = async (payload: {
    interactionId: string
    selectedChoice: MultipleChoiceChoice
    elapsedMs: number
  }) => {
    if (!activeMultipleChoiceCard) return null
    const flowSignals = currentFlowSignals()
    const requestSignals = {
      ...(flowSignals ? { flow: flowSignals } : {}),
      modality: {
        kind: 'mcq',
        selectedChoiceId: payload.selectedChoice.id,
      },
    }
    const saved = await postAttempt({
      cardId: activeMultipleChoiceCard.id,
      cardTitle: activeMultipleChoiceCard.title,
      question: activeMultipleChoiceCard.question,
      questionType: currentMultipleChoiceQuestionType,
      categoryTags: currentMultipleChoiceSkillTags,
      multipleChoiceProblemId: activeMultipleChoiceCard.id,
      selectedChoiceId: payload.selectedChoice.id,
      mode: 'main-recall',
      elapsedMs: payload.elapsedMs,
      sessionId: flowSignals?.runId as string | undefined,
      interactionId: payload.interactionId,
      generatedCardId: activeMultipleChoiceCard.id,
      generatedCard: {
        ...activeMultipleChoiceCard,
        cardMode: 'multiple-choice',
        prompt: activeMultipleChoiceCard.question,
      },
      templateMode: 'algorithm',
      supportLayer: 'none',
      modality: 'mcq',
      signals: requestSignals,
      liveCoachUsed: false,
      submissionTuning,
      llmProvider: requestLlmProvider,
    })
    if (flowSignals) {
      recordFlowSubmission({
        response: saved,
        flowSignals,
        modality: 'mcq',
        modalitySignals: {
          correct: saved.successful,
          selectedChoiceId: payload.selectedChoice.id,
        },
        elapsedMs: payload.elapsedMs,
        interactionId: payload.interactionId,
        question: activeMultipleChoiceCard.question,
      })
    }
    return saved
  }

  const resetPerCardInteraction = () => {
    setMainPhase('preview')
    setRecallMinHeight(undefined)
    setMainInput('')
    setInlineTaskProgress(0)
    setMainStartedAt(null)
    setMainCloseEnough(false)
    setMultipleChoiceSelectedChoiceId('')
    setMultipleChoiceStartedAt(Date.now())
    setFlowMultipleChoiceSelectedChoiceId('')
    setFlowMultipleChoiceStartedAt(Date.now())
    setCurrentInteractionId('')
    setAiCompletionShownThisAttempt(false)
    setCoachFeedback(null)
    setCoachLoading(false)
    setCoachError('')
    setSubmissionFailureModal(null)
    setTagsExpanded(false)
    shouldFocusMainInputRef.current = false
    pendingGhostFocusLineRef.current = null
  }

  const resetFlowMultipleChoiceState = () => {
    setFlowMultipleChoicePosition(0)
    setFlowMultipleChoiceSelectedChoiceId('')
    setFlowMultipleChoiceStartedAt(null)
    setFlowMultipleChoiceSubmittedByCard({})
    setMultipleChoiceSubmitError('')
  }

  const beginPracticeFlowTransition = ({
    fromStage,
    toStage,
    anchorCardId,
    step,
    mode,
    latestAttempt,
    newAnchor = false,
  }: {
    fromStage: FlowStage | null
    toStage: FlowStage
    anchorCardId: string
    step: number
    mode: FlowConfig['mode']
    latestAttempt?: FlowAttempt
    newAnchor?: boolean
  }) => {
    const copy = buildFlowTransitionCopy({ fromStage, toStage, mode, latestAttempt, newAnchor })
    setFlowMicroDrillPrimaryActionState(EMPTY_FLOW_MICRODRILL_ACTION_STATE)
    setFlowTransitionSettlingId(null)
    setFlowTransition({
      id: createInteractionId(),
      fromStage,
      toStage,
      anchorCardId,
      step,
      startedAt: Date.now(),
      ...copy,
    })
  }

  const startPracticeFlow = async () => {
    flowInteractionVersionRef.current += 1
    const flowInteractionVersion = flowInteractionVersionRef.current
    if (!hasRecallDeck || session.finished) return
    saveFlowConfig(flowConfig)
    const history = await loadFlowHistoryForCard(card)
    if (flowInteractionVersionRef.current !== flowInteractionVersion) return
    const first = nextFlowStep(flowConfig, 0, Math.random, history)
    const runId = createInteractionId()
    setLadderActiveCardId(null)
    setFlowDrawerOpen(false)
    setPracticeMode('recall')
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    beginPracticeFlowTransition({
      fromStage: null,
      toStage: first.stage,
      anchorCardId: card.id,
      step: 0,
      mode: flowConfig.mode,
    })
    setPracticeFlow({
      anchorCardId: card.id,
      anchorTitle: card.title,
      ...first,
      config: structuredClone(flowConfig),
      step: 0,
      runId,
      focus: initialFlowFocus(card),
      completedAnchorIds: [],
    })
    resetPerCardInteraction()
  }

  const stopPracticeFlow = () => {
    flowInteractionVersionRef.current += 1
    setPracticeFlow(null)
    setFlowTransition(null)
    setFlowTransitionSettlingId(null)
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    setPracticeMode('recall')
    resetPerCardInteraction()
  }

  const advancePracticeFlow = async () => {
    if (!practiceFlow || flowTransition) return
    flowInteractionVersionRef.current += 1
    const flowInteractionVersion = flowInteractionVersionRef.current
    const step = practiceFlow.step + 1
    const anchorHistory = flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId)
    const mastery = summarizeFlowMastery(anchorHistory)
    if (practiceFlow.config.mode === 'adaptive' && mastery.mastered) {
      const nextAnchor = nextFlowAnchor(filteredDeck, practiceFlow.anchorCardId, practiceFlow.completedAnchorIds)
      if (nextAnchor) {
        beginPracticeFlowTransition({
          fromStage: practiceFlow.stage,
          toStage: 'recall',
          anchorCardId: nextAnchor.id,
          step,
          mode: practiceFlow.config.mode,
          latestAttempt: anchorHistory.at(-1),
          newAnchor: true,
        })
        await loadFlowHistoryForCard(nextAnchor)
        if (flowInteractionVersionRef.current !== flowInteractionVersion) return
        setPracticeFlow({
          ...practiceFlow,
          anchorCardId: nextAnchor.id,
          anchorTitle: nextAnchor.title,
          stage: 'recall',
          cycle: practiceFlow.cycle + 1,
          step,
          focus: initialFlowFocus(nextAnchor),
          completedAnchorIds: [...practiceFlow.completedAnchorIds, practiceFlow.anchorCardId],
        })
        setSupportLayer('none')
        resetFlowMultipleChoiceState()
        resetPerCardInteraction()
        return
      }
    }
    const next = nextFlowStep(practiceFlow.config, step, Math.random, anchorHistory)
    beginPracticeFlowTransition({
      fromStage: practiceFlow.stage,
      toStage: next.stage,
      anchorCardId: practiceFlow.anchorCardId,
      step,
      mode: practiceFlow.config.mode,
      latestAttempt: anchorHistory.at(-1),
    })
    setPracticeFlow({ ...practiceFlow, ...next, step })
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    resetPerCardInteraction()
  }

  const activatePracticeFlowStage = async (nextStage: PracticeFlowStage) => {
    if (!hasRecallDeck || session.finished || flowTransition) return
    flowInteractionVersionRef.current += 1
    const flowInteractionVersion = flowInteractionVersionRef.current

    if (practiceFlow) {
      const step = practiceFlow.step + 1
      const anchorHistory = flowAttemptsRef.current.filter((attempt) => attempt.anchorCardId === practiceFlow.anchorCardId)
      beginPracticeFlowTransition({
        fromStage: practiceFlow.stage,
        toStage: nextStage,
        anchorCardId: practiceFlow.anchorCardId,
        step,
        mode: practiceFlow.config.mode,
        latestAttempt: anchorHistory.at(-1),
      })
      setFlowDrawerOpen(false)
      setPracticeFlow({ ...practiceFlow, stage: nextStage, step })
      setSupportLayer('none')
      resetFlowMultipleChoiceState()
      resetPerCardInteraction()
      return
    }

    const anchorCard = card
    const anchorHistory = await loadFlowHistoryForCard(anchorCard)
    if (flowInteractionVersionRef.current !== flowInteractionVersion) return

    const hotkeyFlowConfig: FlowConfig = {
      ...structuredClone(flowConfig),
      mode: 'adaptive',
    }
    setLadderActiveCardId(null)
    setFlowDrawerOpen(false)
    setPracticeMode('recall')
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    beginPracticeFlowTransition({
      fromStage: null,
      toStage: nextStage,
      anchorCardId: anchorCard.id,
      step: 0,
      mode: hotkeyFlowConfig.mode,
      latestAttempt: anchorHistory.at(-1),
    })
    setPracticeFlow({
      anchorCardId: anchorCard.id,
      anchorTitle: anchorCard.title,
      stage: nextStage,
      cycle: 1,
      config: hotkeyFlowConfig,
      step: 0,
      runId: createInteractionId(),
      focus: initialFlowFocus(anchorCard),
      completedAnchorIds: [],
    })
    resetPerCardInteraction()
  }

  const activatePracticeFlowStageFromHotkey = useEffectEvent((nextStage: PracticeFlowStage) => {
    void activatePracticeFlowStage(nextStage)
  })

  const toggleInlineHelper = () => {
    if (!INLINE_FEEDBACK_ENABLED) return
    setInlineEnabled((prev) => !prev)
    if (mainPhase !== 'preview') {
      resetPerCardInteraction()
    }
  }

  useEffect(() => {
    resetPerCardInteraction()
    if (practiceFlow?.stage === 'recall' || practiceFlow?.stage === 'ghost') {
      startMainRecall()
    }
    // Flow stages should begin as soon as they are selected; standalone recall still begins from preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardId, currentPracticeMode, flowMultipleChoicePosition, practiceFlow?.cycle, practiceFlow?.stage, practiceFlow?.step, session.position])

  const flowTransitionReady = useMemo(() => {
    if (!flowTransition || !practiceFlow) return false
    if (
      practiceFlow.anchorCardId !== flowTransition.anchorCardId
      || practiceFlow.step !== flowTransition.step
      || practiceFlow.stage !== flowTransition.toStage
    ) return false

    if (flowTransition.toStage === 'recall' || flowTransition.toStage === 'ghost') {
      return mainPhase === 'typing'
    }
    if (flowTransition.toStage === 'multiple-choice') {
      return flowMultipleChoiceDeck.length > 0
        || Boolean(flowMcqDeck.error && !flowMcqDeck.loading)
    }

    const interactionKey = `${practiceFlow.runId}-${practiceFlow.step}`
    return flowMicroDrillPrimaryActionState.interactionKey === interactionKey
      && (flowMicroDrillPrimaryActionState.ready || flowMicroDrillPrimaryActionState.failed)
  }, [
    flowMicroDrillPrimaryActionState,
    flowMultipleChoiceDeck.length,
    flowMcqDeck.error,
    flowMcqDeck.loading,
    flowTransition,
    mainPhase,
    practiceFlow,
  ])

  useEffect(() => {
    if (!flowTransition || !flowTransitionReady) return
    const transitionId = flowTransition.id
    const delay = Math.max(0, FLOW_TRANSITION_MINIMUM_MS - (Date.now() - flowTransition.startedAt))
    let settleTimeoutId: number | undefined
    const readyTimeoutId = window.setTimeout(() => {
      setFlowTransitionSettlingId(transitionId)
      settleTimeoutId = window.setTimeout(() => {
        setFlowTransition((current) => current?.id === transitionId ? null : current)
        setFlowTransitionSettlingId((current) => current === transitionId ? null : current)
        if (flowTransition.toStage === 'recall' || flowTransition.toStage === 'ghost') {
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            if (flowTransition.toStage === 'ghost') {
              const firstTargetLine = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow?.focus.missedLines ?? [])
              if (firstTargetLine) {
                mainInputRef.current?.focusLine(firstTargetLine)
                return
              }
            }
            mainInputRef.current?.focusEnd()
          }))
        }
      }, FLOW_TRANSITION_SETTLE_MS)
    }, delay)
    return () => {
      window.clearTimeout(readyTimeoutId)
      if (settleTimeoutId !== undefined) window.clearTimeout(settleTimeoutId)
    }
  }, [flowGhostScaffold, flowTransition, flowTransitionReady, practiceFlow?.focus.missedLines])

  useEffect(() => {
    if (mainPhase !== 'typing') return
    const pendingGhostLine = pendingGhostFocusLineRef.current
    if (pendingGhostLine !== null) {
      pendingGhostFocusLineRef.current = null
      shouldFocusMainInputRef.current = false
      window.requestAnimationFrame(() => {
        mainInputRef.current?.focusLine(pendingGhostLine)
      })
      return
    }
    if (!shouldFocusMainInputRef.current) return
    shouldFocusMainInputRef.current = false
    window.requestAnimationFrame(() => {
      mainInputRef.current?.focusEnd()
    })
  }, [mainPhase, mainInput])

  const handleGhostRepEnterKey = (context: { value: string, cursorLineNumber: number }) => {
    if (practiceFlow?.stage !== 'ghost' || mainPhase !== 'typing') return false
    const nextLineNumber = nextGhostLineNumber(context.cursorLineNumber, context.value, practiceFlow.focus.missedLines)
    if (!nextLineNumber) return false
    mainInputRef.current?.focusLine(nextLineNumber)
    return true
  }

  const startMainRecall = () => {
    if (!hasDeck || hasAnsweredCurrent || session.finished) return
    setAiCompletionShownThisAttempt(false)
    shouldFocusMainInputRef.current = true
    if (previewCodeContainerRef.current) {
      setRecallMinHeight(previewCodeContainerRef.current.offsetHeight)
    }
    setMainPhase('typing')
    setMainStartedAt(Date.now())
    setInlineTaskProgress(0)
    if (practiceFlow?.stage === 'ghost') {
      setMainInput(flowGhostScaffold)
      pendingGhostFocusLineRef.current = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow.focus.missedLines)
    } else {
      setMainInput('')
      pendingGhostFocusLineRef.current = null
    }
    setCurrentInteractionId(createInteractionId())
  }

  const handleMainInputChange = (nextValue: string, context: { cursorLineNumber: number }) => {
    if (mainPhase !== 'typing') return
    setMainInput(nextValue)
    if (inlineEnabled && !isGhostRepsEnabled) {
      const completedLineCount = nextValue
        .split('\n')
        .slice(0, Math.max(context.cursorLineNumber - 1, 0))
        .filter((line) => line.trim().length > 0)
        .length
      setInlineTaskProgress((current) => Math.max(current, completedLineCount))
    }
  }

  const toggleAiCompletion = () => {
    setCodeEditorTuning((prev) => ({ ...prev, aiCompletion: !prev.aiCompletion }))
  }

  const toggleLadder = () => {
    setFlowDrawerOpen(false)
    setRelatedDrawerOpen(false)
    setLadderActiveCardId((current) => current === card.id ? null : card.id)
  }

  const submitMainRecall = async () => {
    if (
      currentPracticeMode !== 'recall'
      || !hasDeck
      || hasAnsweredCurrent
      || session.finished
      || mainPhase !== 'typing'
      || recallEvaluationPendingRef.current
    ) return

    const flowInteractionVersion = flowInteractionVersionRef.current
    const startedAt = mainStartedAt ?? Date.now()
    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - startedAt, 1)
    const normalizedInput = currentRecallSubmissionInput
    const normalizedInputLines = normalizedInput.split('\n')
    const normalizedTarget = activeRecallTarget
    const isGhostRep = effectiveSupportLayer === 'ghost-reps'
    const lineReviews = computeLineReview(normalizedTarget, normalizedInput).reviews
    const missedLineCount = lineReviews.filter((line) => line.status !== 'match').length
    recallEvaluationPendingRef.current = true
    if (!isGhostRep) {
      setCoachFeedback(null)
      setCoachLoading(true)
      setCoachError('')
      setSubmissionFailureModal(null)
    }
    let submitRejection = ''
    const submission = await submitAttemptToServer({
      mode: 'main-recall',
      correctAnswer: normalizedTarget,
      userAnswer: normalizedInput,
      elapsedMs,
      interactionId,
      templateMode: currentTemplateMode,
      supportLayer: effectiveSupportLayer,
      // Persist AI assistance through the existing readiness signal.
      liveCoachUsed: aiCompletionShownThisAttempt,
      modality: isGhostRep ? 'ghost-rep' : 'total-recall',
      signals: {
        modality: {
          exact: normalizedInput === normalizedTarget,
          aiCompletionShown: aiCompletionShownThisAttempt,
          targetLineCount: normalizedTarget.split('\n').filter((line) => line.trim().length > 0).length,
          submittedLineCount: normalizedInputLines.filter((line) => line.trim().length > 0).length,
          missedLineCount,
          ...(isGhostRep && practiceFlow
            ? { focusedLineNumbers: practiceFlow.focus.missedLines.map((line) => line.lineNumber) }
            : {}),
        },
      },
    })
      .catch((error: unknown) => {
        submitRejection = rejectionReason(error)
        return null
      })
      .finally(() => {
        recallEvaluationPendingRef.current = false
        if (flowInteractionVersionRef.current === flowInteractionVersion) setCoachLoading(false)
      })
    if (flowInteractionVersionRef.current !== flowInteractionVersion) return
    if (practiceFlow && !submission?.saved) {
      setCoachError(submitRejection
        ? `Your rep could not be saved: ${submitRejection}`
        : 'Your rep could not be saved. Submit again to continue.')
      return
    }
    const sound = submission?.successful ?? normalizedInput === normalizedTarget
    const storedFeedback = submission?.evaluation?.feedback ?? {}
    const feedback = Object.keys(storedFeedback).length > 0
      ? storedFeedback as CoachAttemptFeedback
      : null
    if (!isGhostRep) {
      setCoachFeedback(feedback)
      if (!submission) {
        setCoachError(submitRejection
          ? `This attempt was rejected: ${submitRejection}`
          : 'Submission evaluation unavailable for this attempt.')
      }
      if (submission?.feedbackUnavailable) {
        setSubmissionFailureModal({
          providerLabel: configuredProviderLabel,
          message: submission.feedbackUnavailable.message,
        })
      }
    }
    const closeEnough = !isGhostRep && sound
    const historyKey = currentRecallHistoryKey
    const currentHistory = mainRecallHistoryByCard[historyKey] ?? []
    const attemptSnapshot = summarizeRecallAttempt(
      normalizedInputLines,
      sound,
      elapsedMs,
      currentHistory.length + 1,
      effectiveSupportLayer
    )
    setMainCloseEnough(closeEnough)
    setMainPhase('submitted')
    setMainRecallHistoryByCard((prev) => ({
      ...prev,
      [historyKey]: [...(prev[historyKey] ?? []), attemptSnapshot],
    }))

    if (practiceFlow) {
      if (practiceFlow.stage === 'recall') {
        const missedLines = toMultipleChoiceFocusLines(lineReviews)
        setPracticeFlow((current) => current ? {
          ...current,
          focus: {
            sequenceStage: 'recall',
            focusSummary: buildFlowFocusSummary(card.title, missedLines),
            missedLines,
          },
        } : current)
      }
      return
    }

    if (!isGhostRep && closeEnough) {
      completeCardInSession(sound, elapsedMs)
    }
  }

  const submitMultipleChoice = async () => {
    const selectedChoiceId = isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId
    const activeStartedAt = isFlowActive ? flowMultipleChoiceStartedAt : multipleChoiceStartedAt
    if (
      currentPracticeMode !== 'multiple-choice' ||
      !activeMultipleChoiceCard ||
      !hasDeck ||
      hasAnsweredCurrent ||
      session.finished ||
      multipleChoiceGrading ||
      !selectedChoiceId
    ) {
      return
    }

    const selectedChoice = activeMultipleChoiceCard.choices.find((choice) => choice.id === selectedChoiceId)
    if (!selectedChoice) return

    const interactionId = currentInteractionId || createInteractionId()
    if (!currentInteractionId) setCurrentInteractionId(interactionId)
    const elapsedMs = Math.max(Date.now() - (activeStartedAt ?? Date.now()), 1)
    const cardId = activeMultipleChoiceCard.id

    setMultipleChoiceGrading(true)
    setMultipleChoiceSubmitError('')
    let submitRejection = ''
    const saved = await submitMultipleChoiceAttemptToServer({ interactionId, selectedChoice, elapsedMs })
      .catch((error: unknown) => {
        submitRejection = rejectionReason(error)
        return null
      })
    setMultipleChoiceGrading(false)

    if (!saved?.saved) {
      const message = submitRejection
        ? `Your answer could not be graded: ${submitRejection}`
        : 'Your answer could not be graded. Submit again before continuing.'
      setMultipleChoiceSubmitError(message)
      return
    }

    setMultipleChoiceResultByCard((prev) => ({ ...prev, [cardId]: saved.successful }))
    if (isFlowActive && practiceFlow) {
      setFlowMultipleChoiceSubmittedByCard((prev) => ({ ...prev, [cardId]: selectedChoice.id }))
    } else {
      setMultipleChoiceSubmittedByCard((prev) => ({ ...prev, [cardId]: selectedChoice.id }))
      completeCardInSession(saved.successful, elapsedMs)
    }
  }

  const reviseMainRecall = () => {
    if (practiceFlow) return
    if (!hasDeck || hasAnsweredCurrent || session.finished || mainPhase !== 'submitted' || mainCloseEnough) return
    setAiCompletionShownThisAttempt(false)
    shouldFocusMainInputRef.current = true
    setMainPhase('typing')
    setInlineTaskProgress((current) => Math.max(
      current,
      mainInput.split('\n').filter((line) => line.trim().length > 0).length
    ))
    setMainStartedAt(Date.now())
    setCurrentInteractionId(createInteractionId())
  }

  const repeatGhostRep = () => {
    if (!hasDeck || hasAnsweredCurrent || session.finished || mainPhase !== 'submitted') return
    setAiCompletionShownThisAttempt(false)
    shouldFocusMainInputRef.current = true
    setMainPhase('typing')
    setInlineTaskProgress(0)
    if (practiceFlow?.stage === 'ghost') {
      setMainInput(flowGhostScaffold)
      pendingGhostFocusLineRef.current = firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow.focus.missedLines)
    } else {
      setMainInput('')
      pendingGhostFocusLineRef.current = null
    }
    setMainStartedAt(Date.now())
    setMainCloseEnough(false)
    setCurrentInteractionId(createInteractionId())
    setCoachFeedback(null)
    setCoachError('')
    setSubmissionFailureModal(null)
  }

  const goNext = session.next
  const goPrev = session.prev
  const attempts = session.attempts
  const correctCount = session.correctCount
  const canGoNext = session.canGoNext
  const canGoPrev = session.canGoPrev

  const currentCardRecallHistory = useMemo(
    () => mainRecallHistoryByCard[currentRecallHistoryKey] ?? [],
    [currentRecallHistoryKey, mainRecallHistoryByCard]
  )
  const displayLines = useMemo(() => {
    const source = mainPhase === 'submitted'
      ? (mainInput || '')
      : (mainInput || (isGhostRepsEnabled ? '' : `# ${practicePlaceholder}`))
    return source.split('\n').map((line, index): AnnotatedDisplayLine => ({
      text: line,
      sourceLineNumber: source.length > 0 ? index + 1 : null,
    }))
  }, [isGhostRepsEnabled, mainInput, mainPhase, practicePlaceholder])
  const ghostTargetCode = practiceTarget
  const previewDisplayLines = useMemo(() => inlineDisplayLines(practiceTarget), [practiceTarget])
  const previewEditorValue = useMemo(
    () => previewDisplayLines
      .map(({ line }) => splitInlineAnnotationLine(line).code)
      .join('\n')
      .trimEnd(),
    [previewDisplayLines]
  )
  const latestSubmittedAttempt =
    mainPhase === 'submitted' ? currentCardRecallHistory[currentCardRecallHistory.length - 1] ?? null : null
  const latestSubmittedWasGhostRep = latestSubmittedAttempt?.supportLayer === 'ghost-reps'
  const totalRecallEvaluationPending = currentPracticeMode === 'recall'
    && mainPhase === 'typing'
    && coachLoading
    && effectiveSupportLayer !== 'ghost-reps'
  const submittedMultipleChoiceId = activeMultipleChoiceCard
    ? (isFlowActive
        ? flowMultipleChoiceSubmittedByCard[activeMultipleChoiceCard.id] ?? ''
        : multipleChoiceSubmittedByCard[activeMultipleChoiceCard.id] ?? '')
    : ''
  const selectedMultipleChoice = activeMultipleChoiceCard?.choices.find((choice) => choice.id === (isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId)) ?? null
  const multipleChoiceSubmitted = Boolean(submittedMultipleChoiceId)
  const multipleChoiceCorrect = Boolean(submittedMultipleChoiceId && activeMultipleChoiceCard && multipleChoiceResultByCard[activeMultipleChoiceCard.id])
  const multipleChoicePosition = isFlowActive ? flowMultipleChoicePosition + 1 : session.position + 1
  const multipleChoiceTotal = isFlowActive
    ? flowMultipleChoiceDeck.length || 1
    : multipleChoiceDeck.length || multipleChoiceQuestionCount
  const flowMicroDrillActionKey = practiceFlow?.stage === 'microdrill'
    ? `${practiceFlow.runId}-${practiceFlow.step}`
    : ''
  const primaryCardAction = resolvePrimaryAction({
    ladderActive,
    flowStage: practiceFlow?.stage ?? null,
    microDrill: flowMicroDrillPrimaryActionState.interactionKey === flowMicroDrillActionKey
      ? flowMicroDrillPrimaryActionState
      : EMPTY_FLOW_MICRODRILL_ACTION_STATE,
    hasDeck,
    practiceMode: currentPracticeMode,
    mainPhase,
    coachLoading,
    mcqSubmitted: multipleChoiceSubmitted,
    mcqSelected: Boolean(selectedMultipleChoice),
    mcqGrading: multipleChoiceGrading,
    hasAnsweredCurrent,
    sessionFinished: session.finished,
    latestSubmittedWasGhostRep,
    recallEvaluationPending: totalRecallEvaluationPending,
    recallInputEmpty: currentRecallSubmissionInput.trim().length === 0,
    mainCloseEnough,
  })
  const primaryActionHandlers: Record<PrimaryActionKind, () => void> = {
    'flow-next': () => void advancePracticeFlow(),
    'microdrill-submit': () => flowMicroDrillPrimaryActionRef.current(),
    'mcq-submit': () => void submitMultipleChoice(),
    'recall-start': startMainRecall,
    'recall-submit': () => void submitMainRecall(),
    'ghost-repeat': repeatGhostRep,
    'recall-revise': reviseMainRecall,
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.altKey || event.shiftKey || !matchesHotkey(event, 'primary-card-action')) return
      const button = primaryCardButtonRef.current
      if (!button || button.disabled) return
      event.preventDefault()
      event.stopPropagation()
      button.click()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (currentPracticeMode !== 'recall') return
      if (matchesHotkey(event, 'toggle-ai-completion')) {
        event.preventDefault()
        setCodeEditorTuning((prev) => ({ ...prev, aiCompletion: !prev.aiCompletion }))
        return
      }
      if (isFlowActive) return
      if (matchesHotkey(event, 'toggle-ghost-reps')) {
        event.preventDefault()
        setSupportLayer((prev) => (prev === 'ghost-reps' ? 'none' : 'ghost-reps'))
      }
      if (INLINE_FEEDBACK_ENABLED && matchesHotkey(event, 'toggle-inline-feedback')) {
        event.preventDefault()
        toggleInlineHelper()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentPracticeMode, isFlowActive, toggleInlineHelper])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey) return

      const nextStage = matchesHotkey(event, 'flow-full-recall')
        ? 'recall'
        : matchesHotkey(event, 'flow-targeted-ghost')
          ? 'ghost'
          : matchesHotkey(event, 'flow-targeted-mcq')
            ? 'multiple-choice'
            : matchesHotkey(event, 'flow-targeted-microdrill')
              ? 'microdrill'
              : null
      if (!nextStage) return

      event.preventDefault()
      event.stopPropagation()
      activatePracticeFlowStageFromHotkey(nextStage)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    if (!zenMode) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setZenMode(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zenMode])

  useEffect(() => {
    if (!flowDrawerOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setFlowDrawerOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flowDrawerOpen])

  const flowStatusText = !practiceFlow
    ? flowHistoryLoading ? 'Loading prior attempts…' : 'Choose Adaptive to sequence from prior results and cross-modality weaknesses.'
    : practiceFlow.config.mode === 'adaptive'
      ? `${flowMastery.phase === 'mastered' ? 'Mastered' : flowMastery.phase[0].toUpperCase() + flowMastery.phase.slice(1)} · ${flowMastery.proficiency}% proficiency · evidence across ${flowMastery.successfulModalities} modalities · ${FLOW_LABELS[practiceFlow.stage]}`
    : practiceFlow.config.mode === 'random'
      ? `Rep ${practiceFlow.step + 1} · ${FLOW_LABELS[practiceFlow.stage]}. The next modality is chosen when you continue.`
      : `Cycle ${practiceFlow.cycle} · Rep ${practiceFlow.step % expandFlow(practiceFlow.config.blocks).length + 1} of ${expandFlow(practiceFlow.config.blocks).length} · ${FLOW_LABELS[practiceFlow.stage]}`
  const flowFocusPreviewLines = practiceFlow?.focus.missedLines.slice(0, 3) ?? []
  const recallEditorLineMeta = useMemo<RecallEditorLineMeta[]>(() => {
    const lineCount = Math.max((mainInput || '').split('\n').length, displayLines.length, 1)

    return Array.from({ length: lineCount }, (_, index) => {
      const displayLine = displayLines[index]
      const sourceLineNumber = displayLine?.sourceLineNumber ?? index + 1

      return {
        sourceLineNumber,
        status: null,
        inlineDecision: false,
        inlineNote: undefined,
      }
    })
  }, [
    displayLines,
    mainInput,
  ])
  const previewEditorLineMeta = useMemo<RecallEditorLineMeta[]>(() => (
    practiceTarget.split('\n').map((_, index) => ({
      sourceLineNumber: index + 1,
      inlineDecision: false,
      inlineNote: undefined,
    }))
  ), [practiceTarget])

  const microDrillEditorReady = !flowTransition && !flowDrawerOpen
    && practiceFlow?.stage === 'microdrill'
    && flowMicroDrillPrimaryActionState.interactionKey === flowMicroDrillActionKey
    && flowMicroDrillPrimaryActionState.ready
    && !flowMicroDrillPrimaryActionState.submitted

  useEffect(() => {
    if (!microDrillEditorReady) return
    const frame = window.requestAnimationFrame(() => focusMicroDrillInput(flowStageContentRef.current))
    return () => window.cancelAnimationFrame(frame)
  }, [microDrillEditorReady, flowMicroDrillActionKey])


  return (
    <div className={[
      'app',
      relatedDrawerOpen && relatedLeetCodeSet ? 'app-side-drawer-open' : '',
      zenMode ? 'app-zen-mode' : '',
    ].filter(Boolean).join(' ')}>
      {submissionFailureModal && (
        <div className="submission-feedback-modal" onClick={() => setSubmissionFailureModal(null)}>
          <div
            className="submission-feedback-popover"
            role="dialog"
            aria-modal="true"
            aria-label="Submission feedback unavailable"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="dashboard-activity-eyebrow">Submission feedback unavailable</p>
            <h4>Feedback cannot be generated at this time.</h4>
            <p className="coach-panel-copy" style={{ marginBottom: '0.55rem' }}>
              {submissionFailureModal.message}
            </p>
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="secondary" onClick={() => setSubmissionFailureModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <TopNav
        llmProviderLabel={`Auto (${configuredProviderLabel})`}
        practiceHistoryHref={practiceHistoryHref}
      />

      {focusedCardNotFound || focusedCardPending ? (
        <div className="card-shell">
          <section className="card">
            <div
              className={focusedCardNotFound ? 'flow-stage-stack flow-stage-stack-not-found' : 'flow-stage-stack'}
              role={focusedCardNotFound ? 'status' : undefined}
              aria-busy={focusedCardPending || undefined}
            >
              {focusedCardNotFound && 'Card not Found'}
            </div>
          </section>
        </div>
      ) : (
  <div className={[
    'card-shell',
    currentPracticeMode === 'multiple-choice' ? 'card-shell-mcq' : '',
    relatedLeetCodeSet ? 'card-shell-has-drawer' : '',
  ].filter(Boolean).join(' ')}>
      <section className="card">
        <div className="card-header">
          <div className="card-header-main">
            {flowDrawerOpen ? (
              <>
                <span className="related-problems-eyebrow">Flow</span>
                <h3>Flow</h3>
                <p className="card-flow-header-subtitle">
                  {practiceFlow
                    ? `${practiceFlow.config.mode === 'adaptive' ? `Adaptive · ${flowMastery.proficiency}%` : practiceFlow.config.mode === 'random' ? 'Random flow' : `Cycle ${practiceFlow.cycle}`} on ${practiceFlow.anchorTitle}`
                    : card.title}
                </p>
              </>
            ) : (
              <>
                <h3>{headerCardTitle}</h3>
                {currentPracticeMode === 'multiple-choice' ? (
              <div className="mcq-session-meta">
                <span className="mcq-session-context">
                  {isFlowActive ? 'Targeted card flow' : 'Current card'}
                </span>
                <span className="mcq-session-separator" aria-hidden="true">/</span>
                <span className="mcq-session-context">
                  {isFlowActive ? 'Missed-line remediation' : mcqTuning.flowMode === 'progressive' ? 'Socratic chain' : 'Balanced random'}
                </span>
                {(focusedPatternSlug || requestedPlaylist) && (
                  <span className="mcq-session-context">
                    {requestedPlaylist ? 'Playlist bias' : `Focus ${focusedPatternLabel}`}
                  </span>
                )}
                <span className="mcq-session-progress">Question {multipleChoicePosition} of {multipleChoiceTotal}</span>
              </div>
                ) : null}
              </>
            )}
          </div>
          <div className={headerControlsOpen ? 'card-header-aside card-header-aside-open' : 'card-header-aside'}>
            <div
              className="card-header-controls-panel"
              id="card-header-controls-panel"
              inert={!headerControlsOpen}
              aria-hidden={!headerControlsOpen}
            >
              <div className="card-header-side">
              <div className="practice-mode-control" role="group" aria-label="Practice mode">
                <button
                  type="button"
                  className={currentPracticeMode === 'recall' ? 'practice-mode-button active' : 'practice-mode-button'}
                  onClick={() => setPracticeMode('recall')}
                  aria-pressed={currentPracticeMode === 'recall'}
                  title="Recall"
                  disabled={isFlowActive}
                >
                  Recall
                </button>
                <button
                  type="button"
                  className={currentPracticeMode === 'multiple-choice' ? 'practice-mode-button active' : 'practice-mode-button'}
                  onClick={() => {
                    if (practiceMode === 'multiple-choice') return
                    setMcqSourceSpecimen(cardSpecimen(card, practicePrompt, practiceTarget))
                    setMcqRequestId((id) => id + 1)
                    setPracticeMode('multiple-choice')
                  }}
                  aria-pressed={currentPracticeMode === 'multiple-choice'}
                  title="Multiple Choice"
                  disabled={isFlowActive || skillMapLoading || filteredDeck.length === 0}
                >
                  MCQ
                </button>
              </div>
                <div className="support-layer-control" aria-label="Practice support controls">
                <button
                  type="button"
                  className={[
                    INLINE_FEEDBACK_ENABLED && inlineEnabled ? 'navbar-toggle active' : 'navbar-toggle',
                    !INLINE_FEEDBACK_ENABLED ? 'navbar-toggle-crossed' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={toggleInlineHelper}
                  aria-pressed={INLINE_FEEDBACK_ENABLED && inlineEnabled}
                  aria-label={INLINE_FEEDBACK_ENABLED ? (inlineEnabled ? 'Turn Inline off' : 'Turn Inline on') : 'Inline disabled'}
                  title={INLINE_FEEDBACK_ENABLED ? 'Inline' : 'Inline disabled'}
                  disabled={isFlowActive || currentPracticeMode !== 'recall' || !INLINE_FEEDBACK_ENABLED}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={isGhostRepsEnabled ? 'navbar-toggle active' : 'navbar-toggle'}
                  onClick={() => setSupportLayer(isGhostRepsEnabled ? 'none' : 'ghost-reps')}
                  aria-pressed={isGhostRepsEnabled}
                  aria-label={isGhostRepsEnabled ? 'Turn Ghost Reps off' : 'Turn Ghost Reps on'}
                  title="Ghost Reps"
                  disabled={isFlowActive || currentPracticeMode !== 'recall'}
                >
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12.5V6.5a5 5 0 0 1 10 0v6l-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5-1.5-1.5-1.5 1.5Z"/>
                    <circle cx="5.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                    <circle cx="8.5" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className={codeEditorTuning.aiCompletion ? 'navbar-toggle active' : 'navbar-toggle'}
                  onClick={toggleAiCompletion}
                  aria-pressed={codeEditorTuning.aiCompletion}
                  aria-label={codeEditorTuning.aiCompletion ? 'Turn AI completion off' : 'Turn AI completion on'}
                  title="AI completion · Tab accepts a suggestion"
                  disabled={currentPracticeMode !== 'recall'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2.5 14.1 9.9 21.5 12l-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1L12 2.5Z" />
                  </svg>
                </button>
                </div>
              <div className="card-side-drawer-actions" aria-label="Card side controls">
                <button
                  type="button"
                  className={zenMode ? 'card-side-drawer-toggle zen-mode-toggle active' : 'card-side-drawer-toggle zen-mode-toggle'}
                  aria-pressed={zenMode}
                  aria-label={zenMode ? 'Exit Zen mode' : 'Enter Zen mode'}
                  aria-keyshortcuts={zenMode ? 'Escape' : undefined}
                  title={zenMode ? 'Exit Zen mode (Esc)' : 'Enter Zen mode'}
                  onClick={() => {
                    if (!zenMode) {
                      setFlowDrawerOpen(false)
                      setRelatedDrawerOpen(false)
                      setTagsExpanded(false)
                    }
                    setZenMode((current) => !current)
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8.25 4.5H5.625A1.125 1.125 0 0 0 4.5 5.625V8.25m11.25-3.75h2.625A1.125 1.125 0 0 1 19.5 5.625V8.25m0 7.5v2.625a1.125 1.125 0 0 1-1.125 1.125H15.75m-7.5 0H5.625A1.125 1.125 0 0 1 4.5 18.375V15.75" />
                    <circle cx="12" cy="12" r="1.5" />
                  </svg>
                  <span className="sr-only">Zen mode</span>
                </button>
                  <button
                    type="button"
                    className={ladderActive ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                    aria-pressed={ladderActive}
                    aria-expanded={ladderActive}
                    aria-controls="sliding-window-ladder"
                    aria-label={ladderActive ? 'Close Ladder' : 'Open Sliding Window Ladder'}
                    title={ladderTechnique
                      ? currentPracticeMode === 'multiple-choice' && !isFlowActive
                        ? 'Select Recall to open the Ladder for this card'
                        : `${ladderActive ? 'Close' : 'Open'} ${ladderTechnique} Sliding Window Ladder`
                      : 'Ladder available for fixed or variable sliding window cards'}
                    onClick={toggleLadder}
                    disabled={!ladderTechnique || (currentPracticeMode === 'multiple-choice' && !isFlowActive)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                    </svg>
                    <span className="sr-only">Ladder</span>
                  </button>
                <button
                  type="button"
                  className={flowDrawerOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                  aria-expanded={flowDrawerOpen}
                  aria-controls="card-flow-panel"
                  aria-label={flowDrawerOpen ? 'Hide Flow menu' : 'Show Flow menu'}
                  title="Flow"
                  onClick={() => {
                    setLadderActiveCardId(null)
                    setRelatedDrawerOpen(false)
                    setFlowDrawerOpen((open) => {
                      if (open) return false
                      return true
                    })
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  <span className="sr-only">Flow</span>
                </button>
                  <button
                    type="button"
                    className={relatedDrawerOpen ? 'card-side-drawer-toggle active' : 'card-side-drawer-toggle'}
                    aria-expanded={relatedDrawerOpen}
                    aria-controls={relatedLeetCodeSet ? 'related-problems-drawer' : undefined}
                    aria-label={relatedDrawerOpen ? 'Hide related LeetCode drawer' : 'Show related LeetCode drawer'}
                    title={relatedLeetCodeSet ? 'Related LeetCode' : 'No related LeetCode problems for this card'}
                    disabled={!relatedLeetCodeSet}
                    onClick={() => {
                      setFlowDrawerOpen(false)
                      setRelatedDrawerOpen((open) => !open)
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                    <span className="sr-only">Related LeetCode</span>
                  </button>
                  <button
                    type="button"
                    className={tagsExpanded ? 'card-side-drawer-toggle card-tags-drawer-toggle active' : 'card-side-drawer-toggle card-tags-drawer-toggle'}
                    aria-expanded={tagsExpanded}
                    aria-controls={hasHeaderDetails ? tagsListId : undefined}
                    aria-label={tagsExpanded ? 'Hide tags' : 'Show tags'}
                    title={hasHeaderDetails ? (tagsExpanded ? 'Hide tags' : 'Show tags') : 'No tags for this card'}
                    disabled={!hasHeaderDetails}
                    onClick={() => setTagsExpanded((current) => !current)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                    <span className="sr-only">Tags</span>
                  </button>
              </div>
            </div>
            </div>
            <button
              type="button"
              className="card-header-settings-toggle"
              aria-controls="card-header-controls-panel"
              aria-expanded={headerControlsOpen}
              aria-label={headerControlsOpen ? 'Hide card controls' : 'Show card controls'}
              title={headerControlsOpen ? 'Hide card controls' : 'Show card controls'}
              onClick={() => setHeaderControlsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </button>
          </div>
          {hasHeaderDetails && (
            <div className={tagsExpanded ? 'tags expanded' : 'tags'}>
              <div className="tags-list" id={tagsListId} aria-label="Card details and tags" aria-hidden={!tagsExpanded}>
                {headerBadgeLabels.map((label, index) => (
                  <span className="tag-item" key={`badge-${label}`}>
                    <span className="tag tag-static">{label.toLowerCase()}</span>
                    {(index < headerBadgeLabels.length - 1 || visibleCardTags.length > 0) && <span className="tag-separator" aria-hidden="true">,</span>}
                  </span>
                ))}
                {visibleCardTags.map((tag, index) => (
                  <span className="tag-item" key={tag}>
                    <button
                      type="button"
                      className={focusedTagSlug === tag ? 'tag tag-button active' : 'tag tag-button'}
                      onClick={() => handleTagClick(tag)}
                      aria-pressed={focusedTagSlug === tag}
                      disabled={!tagsExpanded}
                    >
                      {tag.replaceAll('-', ' ')}
                    </button>
                    {index < visibleCardTags.length - 1 && <span className="tag-separator" aria-hidden="true">,</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {session.finished && (
          <p className="status success" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Session complete. {correctCount} of {attempts} {currentPracticeMode === 'multiple-choice' ? 'questions were correct' : 'cards were sound'}.
          </p>
        )}
        {session.finished && currentPracticeMode === 'recall' && (
          <div className="hint" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            <strong>Coach Session Plan</strong>
            {sessionPlan.loading && <p style={{ margin: '0.5rem 0 0' }}>Building your next-session plan...</p>}
            {sessionPlan.error && <p style={{ margin: '0.5rem 0 0' }}>{sessionPlan.error}</p>}
            {sessionPlan.plan && (
              <div style={{ marginTop: '0.6rem' }}>
                <p style={{ margin: '0.3rem 0' }}><strong>{sessionPlan.plan.headline}</strong></p>
                <p style={{ margin: '0.3rem 0' }}><strong>Focus:</strong> {sessionPlan.plan.focusTheme}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Warmup:</strong> {sessionPlan.plan.warmup}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Main Set:</strong> {sessionPlan.plan.mainSet}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Cooldown:</strong> {sessionPlan.plan.cooldown}</p>
                <p style={{ margin: '0.3rem 0' }}><strong>Note:</strong> {sessionPlan.plan.note}</p>
                <p style={{ margin: '0.3rem 0', opacity: 0.8 }}>Generated by {sessionPlan.plan.llmUsed ? 'LLM coach + rules' : 'rules coach'}.</p>
              </div>
            )}
          </div>
        )}

        <div className={flowTransition ? 'flow-stage-stack flow-stage-stack-transitioning' : 'flow-stage-stack'}>
        {flowTransition && (
          <FlowCoachTransition
            transition={flowTransition}
            settling={flowTransitionSettlingId === flowTransition.id}
          />
        )}
        <div
          ref={flowStageContentRef}
          className={[
            'flow-stage-content',
            practiceFlow ? `flow-stage-content-${practiceFlow.stage}` : '',
            flowTransition
              ? flowTransitionSettlingId === flowTransition.id
                ? 'flow-stage-content-settling'
                : 'flow-stage-content-preparing'
              : '',
          ].filter(Boolean).join(' ')}
          aria-hidden={flowTransition ? true : undefined}
          inert={flowTransition ? true : undefined}
        >
        {isFlowActive && coachError && mainPhase === 'typing' && <p className="flow-submit-error" role="alert">{coachError}</p>}
        {ladderActive && ladderTechnique ? (
          <SlidingWindowLadder
            key={card.id}
            cardId={card.id}
            cardTitle={card.title}
            cardPrompt={practicePrompt}
            cardTarget={practiceTarget}
            technique={ladderTechnique}
            provider={requestLlmProvider}
            theme={theme}
            onClose={() => setLadderActiveCardId(null)}
            onSave={(question, answer, elapsedMs, interactionId, rungIndex, rep) => submitAttemptToServer({
              mode: 'main-recall', correctAnswer: question.solution, userAnswer: answer, question: question.question,
              microdrill: true, elapsedMs, interactionId,
              templateMode: currentTemplateMode, supportLayer: 'none', liveCoachUsed: false,
              modality: 'microdrill',
              signals: { modality: { ladder: true, technique: ladderTechnique, rungIndex, rep, language: 'python' } },
              outsideFlow: true,
            })}
          />
        ) : practiceFlow?.stage === 'microdrill' ? (
          <FlowMicroDrillCard
            key={flowMicroDrillActionKey}
            title={card.title} prompt={practicePrompt} target={practiceTarget}
            focus={practiceFlow.focus.focusSummary} rep={practiceFlow.step + 1}
            context={flowGenerationContext}
            provider={requestLlmProvider} theme={theme} syntaxTheme={syntaxTheme}
            actionKey={flowMicroDrillActionKey}
            primaryActionRef={flowMicroDrillPrimaryActionRef}
            onPrimaryActionStateChange={setFlowMicroDrillPrimaryActionState}
            onSave={(drill, answer, elapsedMs, interactionId) => submitAttemptToServer({
              mode: 'main-recall', correctAnswer: drill.solution, userAnswer: answer, question: drill.prompt,
              microdrill: true, elapsedMs, interactionId,
              templateMode: currentTemplateMode, supportLayer: 'none', liveCoachUsed: false,
              modality: 'microdrill',
              signals: {
                modality: {
                  blankCount: drill.template.match(/_{3,}/g)?.length ?? 0,
                  language: drill.language,
                  templateLineCount: drill.template.split('\n').length,
                },
              },
            })}
          />
        ) : flowDrawerOpen ? (
          <aside
            id="card-flow-panel"
            className="card-flow-panel card-flow-panel-open"
            aria-label="Flow configuration"
          >
            <div className="related-problems-body card-flow-body">
              <FlowBuilder config={flowConfig} disabled={isFlowActive} onChange={(config) => { setFlowConfig(config); saveFlowConfig(config) }} />
              <p className="card-flow-status">{flowStatusText}</p>
              {flowHistoryError && <p className="card-flow-summary" role="status">{flowHistoryError}</p>}
              {practiceFlow?.focus.focusSummary && (
                <p className="card-flow-summary">{practiceFlow.focus.focusSummary}</p>
              )}
              {flowFocusPreviewLines.length > 0 && (
                <div className="card-flow-focus-list" aria-label="Targeted lines">
                  {flowFocusPreviewLines.map((line) => (
                    <span key={`${line.lineNumber}-${line.status}-${line.expected}`} className="card-flow-focus-chip">
                      L{line.lineNumber} {summarizeFlowFocusLine(line)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        ) : (
        <div className="card-grid">
          <div className="panel prompt-surface-panel">
            {currentPracticeMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="prompt-surface-section skeleton-group" role="status" aria-label="Generating multiple-choice question">
                    <div className="prompt-section-content" aria-hidden="true">
                      <span className="prompt-section-label">Question</span>
                    </div>
                    <div className="skeleton-line w95 tall" />
                    <div className="skeleton-line w80" />
                    <div className="skeleton-line w60" />
                  </div>
                ) : (
                  <div className="prompt-surface-section">
                    <span className="prompt-section-label">Question</span>
                    <p className="prompt prompt-surface-body prompt-bar">Multiple choice is unavailable right now.</p>
                    <p className="hint">{activeError || 'No question set was returned.'}</p>
                    {isFlowActive && <button type="button" className="secondary" onClick={flowMcqDeck.retry}>Retry MCQ</button>}
                  </div>
                )
              ) : activeMultipleChoiceCard ? (
                <div className="prompt-surface-section">
                  <div className="prompt-section-content">
                    <span className="prompt-section-label">Question</span>
                    <div className="prompt prompt-surface-body multiple-choice-question">
                      <MarkdownCodeContent
                        text={activeMultipleChoiceCard.question}
                        syntaxTheme={syntaxTheme}
                        theme={theme}
                        editorBlocks
                      />
                    </div>
                  </div>
                </div>
              ) : null
            ) : !hasDeck ? (
              activeLoading ? (
                <div className="prompt-surface-section skeleton-group" role="status" aria-label="Loading prompt">
                  <span className="prompt-section-label" aria-hidden="true">Prompt</span>
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80" />
                  <div className="skeleton-line w60" />
                </div>
              ) : (
                <div className="prompt-surface-section">
                  <span className="prompt-section-label">Prompt</span>
                  <p className="prompt prompt-surface-body prompt-bar">The skill-map deck is unavailable right now.</p>
                  <p className="hint">{activeError || 'No drills were returned.'}</p>
                </div>
              )
            ) : (
              <div className="drill-fade-in">
                <div className="prompt-surface-section">
                  <div className="prompt-section-content">
                    <span className="prompt-section-label">{skeletonReference ? 'Explanation' : 'Prompt'}</span>
                    <p className="prompt prompt-surface-body">{skeletonReference ? skeletonReference.explanation : practicePrompt}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={currentPracticeMode === 'recall' && hasDeck && mainPhase === 'preview' ? 'panel recall-preview-panel' : 'panel'}>
            {currentPracticeMode === 'multiple-choice' ? (
              !hasDeck ? (
                activeLoading ? (
                  <div className="multiple-choice-card" role="status" aria-label="Generating answer choices">
                    <div className="mcq-section-heading" aria-hidden="true">
                      <span className="prompt-section-label">Choose one answer</span>
                    </div>
                    <div className="multiple-choice-options">
                      {['A', 'B', 'C', 'D'].map((choice) => (
                        <div className="multiple-choice-option multiple-choice-option-loading" key={choice} aria-hidden="true">
                          <span className="multiple-choice-option-id">{choice}</span>
                          <div className="skeleton-group">
                            <div className="skeleton-line w95" />
                            <div className="skeleton-line w60" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 0 }}>
                    {activeError || 'No multiple choice questions are available yet.'}
                  </div>
                )
              ) : activeMultipleChoiceCard ? (
                <div className="multiple-choice-card">
                  <div className="mcq-section-heading">
                    <span className="prompt-section-label">Choose one answer</span>
                  </div>
                  <div className="multiple-choice-options" role="radiogroup" aria-label="Answer choices">
                    {activeMultipleChoiceCard.choices.map((choice) => {
                      const isSelected = (isFlowActive ? flowMultipleChoiceSelectedChoiceId : multipleChoiceSelectedChoiceId) === choice.id
                      const isSubmittedChoice = submittedMultipleChoiceId === choice.id
                      const isCorrectChoice = activeMultipleChoiceCard.correctChoiceId === choice.id
                      const resultClass = multipleChoiceSubmitted
                        ? isCorrectChoice
                          ? ' correct'
                          : isSubmittedChoice
                            ? ' incorrect'
                            : ''
                        : ''
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          className={`multiple-choice-option${isSelected ? ' selected' : ''}${resultClass}`}
                          onClick={() => {
                            if (!multipleChoiceSubmitted) {
                              if (isFlowActive) {
                                setFlowMultipleChoiceSelectedChoiceId(choice.id)
                                return
                              }
                              setMultipleChoiceSelectedChoiceId(choice.id)
                            }
                          }}
                          disabled={multipleChoiceSubmitted || hasAnsweredCurrent || session.finished}
                          role="radio"
                          aria-checked={isSelected || isSubmittedChoice}
                        >
                          <span className="multiple-choice-option-id">{choice.id}</span>
                          <span className="multiple-choice-option-text">
                            <MarkdownCodeContent text={choice.text} syntaxTheme={syntaxTheme} compact />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {multipleChoiceSubmitError && !multipleChoiceSubmitted ? (
                    <p className="hint" role="alert">{multipleChoiceSubmitError}</p>
                  ) : null}
                  {multipleChoiceSubmitted && (
                    <div className={multipleChoiceCorrect ? 'mcq-feedback mcq-feedback-correct' : 'mcq-feedback mcq-feedback-incorrect'} role="status">
                      <div className="mcq-feedback-heading">
                        <span className="mcq-feedback-mark" aria-hidden="true">{multipleChoiceCorrect ? '✓' : '↗'}</span>
                        <strong>{multipleChoiceCorrect ? 'Correct' : 'Not quite'}</strong>
                      </div>
                      <div className="mcq-feedback-explanation">
                        <MarkdownCodeContent text={activeMultipleChoiceCard.explanation} syntaxTheme={syntaxTheme} compact />
                      </div>
                    </div>
                  )}
                </div>
              ) : null
            ) : !hasDeck ? (
              activeLoading ? (
                <div className="skeleton-group">
                  <div className="skeleton-line w60" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w80 tall" />
                  <div className="skeleton-line w95 tall" />
                  <div className="skeleton-line w45" />
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 0 }}>
                  {activeError || 'No drills are available yet.'}
                </div>
              )
            ) : mainPhase === 'preview' && (
              <div className="drill-fade-in">
                <div
                  className="code-container recall-editor-container"
                  ref={(node) => {
                    previewCodeContainerRef.current = node
                  }}
                >
                  <div className="typing-editor-shell">
                    <div className="recall-editor-code-wrap">
                      <div className="recall-submit-summary-slot" aria-live="polite" />
                      <RecallCodeEditor
                        value={previewEditorValue}
                        language={practiceLanguage}
                        theme={theme}
                        editable={false}
                        placeholder=""
                        lineMeta={previewEditorLineMeta}
                        intellisense={codeEditorTuning.intellisense}
                        styleGuide={codeEditorTuning.styleGuide}
                        commonPatterns={codeEditorTuning.commonPatterns}
                        foldControls={codeEditorTuning.foldControls}
                        showSearchPanel={codeEditorTuning.showSearchPanel}
                        onChange={() => {}}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasDeck && mainPhase !== 'preview' && (
              <>
                <label className="answer-label" htmlFor="main-recall-input">
                  {supportedPracticeInputLabel}
                </label>
                <div
                  className={[
                    'code-container recall-editor-container',
                    latestSubmittedWasGhostRep ? 'recall-editor-container-ghost-submitted' : '',
                    totalRecallEvaluationPending ? 'recall-editor-container-recall-evaluating' : '',
                  ].filter(Boolean).join(' ')}
                  aria-busy={totalRecallEvaluationPending || undefined}
                  style={recallMinHeight ? { minHeight: recallMinHeight } : undefined}
                >
                  <div className="typing-editor-shell">
                    <div className="recall-editor-code-wrap">
                      <div className="recall-submit-summary-slot" aria-live="polite">
                        {totalRecallEvaluationPending ? (
                          <div className="recall-submit-summary recall-submit-summary-loading" role="status">
                            <span className="recall-submit-loading-indicator" aria-hidden="true" />
                            <span>Evaluating recall…</span>
                          </div>
                        ) : mainPhase === 'submitted' && latestSubmittedAttempt ? (
                          <div className="recall-submit-summary">
                            <span className="recall-submit-metric">
                              <span className="recall-submit-metric-name">Outcome</span>
                              <span className="recall-submit-metric-value">{latestSubmittedAttempt.exact ? 'Sound' : 'Needs work'}</span>
                            </span>
                            <span className="recall-submit-metric">
                              <span className="recall-submit-metric-name">Time</span>
                              <span className="recall-submit-metric-value">{(latestSubmittedAttempt.elapsedMs / 1000).toFixed(1)}s</span>
                            </span>
                          </div>
                        ) : null}
                        {!isFlowActive && mainPhase === 'submitted' && coachError ? (
                          <p className="flow-submit-error" role="alert">{coachError}</p>
                        ) : null}
                      </div>
                      <RecallCodeEditor
                        ref={mainInputRef}
                        value={mainInput}
                        language={practiceLanguage}
                        theme={theme}
                        editable={mainPhase === 'typing' && !totalRecallEvaluationPending}
                        disabled={hasAnsweredCurrent || session.finished || totalRecallEvaluationPending}
                        placeholder={mainPhase === 'typing' && (isGhostRepsEnabled || inlineEnabled) ? '' : supportedPracticePlaceholder}
                        ghostTarget={mainPhase === 'typing' && isGhostRepsEnabled ? ghostTargetCode : undefined}
                        inlineTask={currentInlineTask}
                        aiCompletion={{
                          cardId: card.id,
                          cardTitle: card.title,
                          prompt: practicePrompt,
                          provider: requestLlmProvider,
                        }}
                        aiCompletionEnabled={codeEditorTuning.aiCompletion && mainPhase === 'typing' && !isGhostRepsEnabled && !totalRecallEvaluationPending && !hasAnsweredCurrent && !session.finished}
                        onAiCompletionShown={() => setAiCompletionShownThisAttempt(true)}
                        onAiCompletionStatus={setAiCompletionStatus}
                        lineMeta={recallEditorLineMeta}
                        minHeight={recallMinHeight}
                        intellisense={codeEditorTuning.intellisense}
                        styleGuide={codeEditorTuning.styleGuide}
                        commonPatterns={codeEditorTuning.commonPatterns}
                        foldControls={codeEditorTuning.foldControls}
                        showSearchPanel={codeEditorTuning.showSearchPanel}
                        onChange={handleMainInputChange}
                        onEnterKey={handleGhostRepEnterKey}
                      />
                      {aiCompletionStatus && mainPhase === 'typing' && <p className="hint" role="status">{aiCompletionStatus}</p>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
        )}
        </div>
        </div>

        {!flowTransition && (flowDrawerOpen ? (
          <div className="card-control-bar">
            <div className="card-control-group card-control-group-primary">
              <button
                type="button"
                ref={primaryCardButtonRef}
                className="card-control-button"
                onClick={practiceFlow ? stopPracticeFlow : startPracticeFlow}
                disabled={!practiceFlow && (!hasRecallDeck || session.finished || flowHistoryLoading)}
              >
                {practiceFlow ? 'Stop flow' : 'Start flow'}
              </button>
            </div>
          </div>
        ) : (
        <div className="card-control-bar">
          <div className="card-control-group">
            <button type="button" className="secondary card-control-button" onClick={goPrev} disabled={!canGoPrev} aria-label="Previous card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
              </svg>
              <span>Previous</span>
            </button>
            <button type="button" className="secondary card-control-button" onClick={goNext} disabled={!canGoNext} aria-label="Next card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
              </svg>
              <span>Next</span>
            </button>
          </div>
          {primaryCardAction && (
          <div className="card-control-group card-control-group-primary">
              <button
                type="button"
                ref={primaryCardButtonRef}
                className={isFlowActive && primaryCardAction.label === 'Next'
                  ? 'card-control-button card-control-button-flow-next'
                  : 'card-control-button'}
                onClick={primaryActionHandlers[primaryCardAction.kind]}
                disabled={primaryCardAction.disabled}
                aria-label={isFlowActive && primaryCardAction.label === 'Next' ? 'Continue to the next modality' : undefined}
              >
                {isFlowActive && primaryCardAction.label === 'Next' ? (
                  <>
                    <span>{primaryCardAction.label}</span>
                    <PrimaryActionIcon kind={primaryCardAction.kind} />
                  </>
                ) : (
                  <>
                    <PrimaryActionIcon kind={primaryCardAction.kind} />
                    <span>{primaryCardAction.label}</span>
                  </>
                )}
              </button>
          </div>
          )}
        </div>
        ))}
      </section>
      {relatedLeetCodeSet && (
        <RelatedLeetCodeDrawer
          relatedSet={relatedLeetCodeSet}
          open={relatedDrawerOpen}
          onClose={() => setRelatedDrawerOpen(false)}
        />
      )}
      </div>
      )}
    </div>
  )
}

export default App
