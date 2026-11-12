import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { loadFlowConfig, saveFlowConfig, type FlowStage } from './flow/practiceFlow'
import RelatedLeetCodeDrawer from './components/RelatedLeetCodeDrawer'
import { resolveRelatedLeetCodeSet } from '@/shared/data/related-leetcode'
import { loadStoredSubmissionTuning, saveStoredSubmissionTuning } from '@/shared/settings/submissionTuning'
import { loadStoredCodeEditorTuning, saveStoredCodeEditorTuning } from '@/shared/settings/codeEditorTuning'
import { loadStoredMcqTuning } from '@/shared/settings/mcqTuning'
import { loadStoredGooglePlaylistTuning } from '@/shared/settings/googlePlaylistTuning'
import { useConfiguredProviderLabel } from '@/shared/lib/llmProviderDefault'
import TopNav from '@/app/TopNav'
import { useTheme } from '@/app/theme'
import SlidingWindowLadder from './ladder/WindowLadderPanel'
import { slidingWindowTechnique } from './ladder/windowLadderPlan'
import FlowMicroDrillCard from './flow/FlowMicroDrillCard'
import { buildFlowFocusSummary, buildFlowGhostScaffold, buildFlowGhostTarget, firstIncompleteGhostLineNumber, toMultipleChoiceFocusLines } from './lib/lineReview'
import { usePracticeFlowControls, usePracticeFlowState, type FlowChange } from './flow/usePracticeFlow'
import { useMultipleChoiceAttempt } from './hooks/useMultipleChoiceAttempt'
import { useRecallAttempt, type RecallSubmitted } from './hooks/useRecallAttempt'
import { usePracticeSession, useSessionPlan } from './hooks/usePracticeSession'
import { usePracticeHotkeys } from './hooks/usePracticeHotkeys'
import { useMultipleChoiceHotkeys } from './hooks/useMultipleChoiceHotkeys'
import { usePracticePanels } from './hooks/usePracticePanels'
import { usePracticeFocus } from './hooks/usePracticeFocus'
import FlowPanel from './flow/FlowPanel'
import MultipleChoicePanel from './components/MultipleChoicePanel'
import PracticeControlBar from './components/PracticeControlBar'
import PromptPanel from './components/PromptPanel'
import RecallPanel from './components/RecallPanel'
import SessionSummary from './components/SessionSummary'
import SubmissionFailureModal from './components/SubmissionFailureModal'
import { useFlowMultipleChoiceDeck, useMultipleChoiceDeck, useRecallDeck } from './hooks/useDecks'
import { cardSpecimen, flowMultipleChoiceRequest, multipleChoiceAttemptBody, multipleChoiceDeckRequest, postAttempt, recallAttemptBody } from './api'
import { resolvePrimaryAction, type PrimaryActionKind } from './lib/primaryAction'
import { derivePracticeTargets } from './lib/targets'
import { focusMicroDrillInput } from './lib/markdownText'
import { describeCard } from './lib/cardMeta'
import { questionTypeLabel, questionTypeOf, type QuestionType } from './lib/questionType'
import { useDoubleTapArrows } from '@/shared/lib/useDoubleTapArrows'
import { INLINE_FEEDBACK_ENABLED, emptySkillMapCard, EMPTY_FLOW_MICRODRILL_ACTION_STATE, type AttemptPayload, type MultipleChoiceCard, type MultipleChoiceSpecimenContext, type PracticeMode, type SupportLayer, type TemplateMode } from './lib/types'

function PracticePage() {
  const { state: arrivalState } = useLocation()
  const startTotalRecallOnArrival = (arrivalState as { startTotalRecall?: boolean } | null)?.startTotalRecall === true
  const autoStartedRecallRef = useRef(false)
  const { theme } = useTheme()
  const { focus: practiceFocus, flowPanelRequested } = usePracticeFocus()
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('recall')
  const [mcqSourceSpecimen, setMcqSourceSpecimen] = useState<MultipleChoiceSpecimenContext | null>(null)
  const [mcqRequestId, setMcqRequestId] = useState(0)
  const [supportLayer, setSupportLayer] = useState<SupportLayer>('none')
  const [inlineEnabled, setInlineEnabled] = useState(false)
  const [flowConfig, setFlowConfig] = useState(loadFlowConfig)
  const flowState = usePracticeFlowState()
  const practiceFlow = flowState.flow
  const flowMicroDrillPrimaryActionRef = useRef<() => void>(() => undefined)
  const primaryCardButtonRef = useRef<HTMLButtonElement | null>(null)

  const configuredProviderLabel = useConfiguredProviderLabel()
  // Always "Auto": an empty provider lets the server use its configured one.
  const requestLlmProvider = ''
  const [submissionTuning] = useState(() => loadStoredSubmissionTuning())
  const [codeEditorTuning, setCodeEditorTuning] = useState(() => loadStoredCodeEditorTuning())
  const syntaxTheme = theme === 'light-high-contrast' ? vs : vscDarkPlus
  const mcqTuning = useMemo(() => loadStoredMcqTuning(), [])
  const googlePlaylistTuning = useMemo(() => loadStoredGooglePlaylistTuning(), [])
  const multipleChoiceQuestionCount = mcqTuning.questionCount
  const flowStageContentRef = useRef<HTMLDivElement | null>(null)
  const { focusedCardPending, focusedCardNotFound, requestedQuestionType } = practiceFocus
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
  const session = usePracticeSession({ disabled: practiceFlow !== null, onMove: () => panels.closeLadder() })
  const currentTemplateMode: TemplateMode = 'algorithm'

  const startSession = (deckLength: number) => {
    session.start(deckLength)
    sessionPlan.reset()
    recall.reset()
    recall.resetHistory()
    sessionMcq.resetAll(true)
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
  const flowMcqDeck = useFlowMultipleChoiceDeck(
    practiceFlow?.stage === 'multiple-choice'
      ? flowMultipleChoiceRequest({ flow: practiceFlow, card, prompt: practicePrompt, target: practiceTarget, context: flowState.generationContext, llmProvider: requestLlmProvider })
      : null,
    practiceFlow ? { runId: practiceFlow.runId, step: practiceFlow.step } : null,
  )
  const flowMultipleChoiceDeck = flowMcqDeck.deck
  const multipleChoiceCard = multipleChoiceDeck[currentDeckIndex] ?? multipleChoiceDeck[0] ?? null
  const flowMultipleChoiceCard = flowMultipleChoiceDeck[0] ?? null
  const isFlowActive = practiceFlow !== null
  const currentPracticeMode: PracticeMode = practiceFlow
    ? (practiceFlow.stage === 'multiple-choice' ? 'multiple-choice' : 'recall')
    : practiceMode
  const effectiveSupportLayer: SupportLayer = practiceFlow?.stage === 'ghost' ? 'ghost-reps' : supportLayer
  const activeMultipleChoiceCard = isFlowActive ? flowMultipleChoiceCard : multipleChoiceCard
  const activeCardId = currentPracticeMode === 'multiple-choice' ? activeMultipleChoiceCard?.id ?? '' : card.id
  const skeletonReference = card.skeletonApplicability ?? null

  const flowGhostTarget = useMemo(
    () => buildFlowGhostTarget(practiceFlow?.focus.missedLines ?? []),
    [practiceFlow]
  )
  const flowGhostScaffold = useMemo(
    () => buildFlowGhostScaffold(practiceTarget, practiceFlow?.focus.missedLines ?? []),
    [practiceFlow, practiceTarget]
  )
  const activeRecallTarget = practiceFlow?.stage === 'ghost' && flowGhostTarget ? flowGhostTarget : practiceTarget

  const hasRecallDeck = filteredDeck.length > 0
  const hasMultipleChoiceDeck = isFlowActive ? flowMultipleChoiceDeck.length > 0 : multipleChoiceDeck.length > 0
  const hasDeck = currentPracticeMode === 'multiple-choice' ? hasMultipleChoiceDeck : hasRecallDeck
  const cardMeta = describeCard({
    card,
    mcqCard: activeMultipleChoiceCard,
    mode: currentPracticeMode,
    flow: practiceFlow,
    inlineEnabled,
    requestedQuestionType,
    mcqFlowMode: mcqTuning.flowMode,
    hasDeck,
  })
  const activeDeck = currentPracticeMode === 'multiple-choice' ? (isFlowActive ? flowMcqDeck : mcqDeck) : recallDeck
  const activeLoading = activeDeck.loading
  const activeError = activeDeck.error
  const isGhostRepsEnabled = effectiveSupportLayer === 'ghost-reps'
  const hasAnsweredCurrent = !isFlowActive && session.hasResult(activeCardId)
  const sessionPlan = useSessionPlan({
    session,
    enabled: currentPracticeMode !== 'multiple-choice',
    deck: filteredDeck,
    questionType: requestedQuestionType,
    llmProvider: requestLlmProvider,
  })
  const recall = useRecallAttempt({
    blocked: !hasDeck || hasAnsweredCurrent || session.finished,
    active: currentPracticeMode === 'recall',
    flowFocus: practiceFlow?.focus ?? null,
    ghostStage: practiceFlow?.stage === 'ghost',
    ghostScaffold: flowGhostScaffold,
    supportLayer: effectiveSupportLayer,
    inlineEnabled,
    target: activeRecallTarget,
    templateMode: currentTemplateMode,
    historyKey: cardMeta.recallHistoryKey,
    providerLabel: configuredProviderLabel,
    save: (payload) => submitAttemptToServer(payload),
    flowVersion: flowState.versionRef,
    onSubmitted: (result) => handleRecallSubmitted(result),
  })
  const mainPhase = recall.phase
  const currentInlineTask = inlineEnabled && mainPhase === 'typing' && !isGhostRepsEnabled
    ? inlineTaskProgression[recall.inlineTaskProgress]
    : undefined
  const sessionMcq = useMultipleChoiceAttempt()
  const flowMcq = useMultipleChoiceAttempt()
  const mcq = isFlowActive ? flowMcq : sessionMcq
  const mcqView = mcq.viewOf(activeMultipleChoiceCard)
  const flowControls = usePracticeFlowControls(flowState, {
    config: flowConfig,
    card,
    deck: filteredDeck,
    canStart: hasRecallDeck && !session.finished,
    onChange: (change) => handleFlowChange(change),
  })
  const targetedGhostLineCount = practiceFlow?.focus.missedLines.filter((line) => line.expected.trim().length > 0).length ?? 0
  const relatedLeetCodeSet = useMemo(
    () => currentPracticeMode === 'recall'
      ? resolveRelatedLeetCodeSet({
          title: card.title,
          examples: card.plainEnglishPromptDetail?.leetcodeExamples ?? [],
        })
      : null,
    [card.plainEnglishPromptDetail?.leetcodeExamples, card.title, currentPracticeMode]
  )

  const panels = usePracticePanels({
    flowOpenOnArrival: flowPanelRequested,
    relatedKey: `${card.id}:${relatedLeetCodeSet?.heading ?? ''}`,
  })
  const ladderActive = panels.ladderCardId === card.id && ladderTechnique !== null

  const completeCardInSession = (isCorrect: boolean, elapsedMs?: number) => session.complete(activeCardId, isCorrect, elapsedMs)

  const submitAttemptToServer = async (payload: AttemptPayload) => {
    const flowSignals = payload.outsideFlow ? null : flowState.signals() ?? null
    const saved = await postAttempt(recallAttemptBody(payload, {
      card, prompt: practicePrompt, questionType: cardMeta.questionType, skillTags: cardMeta.skillTags,
      flowSignals, submissionTuning, llmProvider: requestLlmProvider,
    }))
    if (flowSignals) {
      flowState.recordSubmission({
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

  const submitMultipleChoiceAttemptToServer = async (mcqCard: MultipleChoiceCard, choiceId: string, elapsedMs: number, interactionId: string) => {
    const flowSignals = flowState.signals() ?? null
    const saved = await postAttempt(multipleChoiceAttemptBody({
      card: mcqCard, choiceId, elapsedMs, interactionId, questionType: cardMeta.mcqQuestionType, skillTags: cardMeta.mcqSkillTags,
      flowSignals, submissionTuning, llmProvider: requestLlmProvider,
    }))
    if (flowSignals) {
      flowState.recordSubmission({
        response: saved,
        flowSignals,
        modality: 'mcq',
        modalitySignals: { correct: saved.successful, selectedChoiceId: choiceId },
        elapsedMs,
        interactionId,
        question: mcqCard.question,
      })
    }
    return saved
  }

  const resetPerCardInteraction = () => {
    recall.reset()
    sessionMcq.resetCard()
    flowMcq.resetCard()
    panels.closeTags()
  }

  const resetFlowMultipleChoiceState = () => flowMcq.resetAll(false)

  /** Reset the card on screen whenever the flow starts, moves or stops. */
  const handleFlowChange = (change: FlowChange) => {
    if (change !== 'stop') panels.closeFlow()
    if (change === 'start') panels.closeLadder()
    if (change !== 'move') setPracticeMode('recall')
    setSupportLayer('none')
    resetFlowMultipleChoiceState()
    resetPerCardInteraction()
  }

  /** Put the cursor in a newly selected Recall or Ghost editor. */
  const focusStageEditor = (toStage: FlowStage) => {
    if (toStage !== 'recall' && toStage !== 'ghost') return
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const firstTargetLine = toStage === 'ghost'
        ? firstIncompleteGhostLineNumber(flowGhostScaffold, practiceFlow?.focus.missedLines ?? [])
        : null
      if (firstTargetLine) recall.editorRef.current?.focusLine(firstTargetLine)
      else recall.editorRef.current?.focusEnd()
    }))
  }

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
      recall.start()
      focusStageEditor(practiceFlow.stage)
    }
    // Flow stages should begin as soon as they are selected; standalone recall still begins from preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCardId, currentPracticeMode, practiceFlow?.cycle, practiceFlow?.stage, practiceFlow?.step, session.position])

  useEffect(() => {
    if (!startTotalRecallOnArrival || autoStartedRecallRef.current || skillMapLoading || !hasRecallDeck || focusedCardPending || focusedCardNotFound) return
    autoStartedRecallRef.current = true
    recall.start()
    focusStageEditor('recall')
    // The earlier card and session effects have reset the new deck before this arrival action runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTotalRecallOnArrival, skillMapLoading, hasRecallDeck, focusedCardPending, focusedCardNotFound, activeCardId])

  const toggleAiCompletion = () => {
    setCodeEditorTuning((prev) => ({ ...prev, aiCompletion: !prev.aiCompletion }))
  }

  const handleRecallSubmitted = ({ sound, closeEnough, isGhostRep, elapsedMs, lineReviews }: RecallSubmitted) => {
    if (practiceFlow) {
      if (practiceFlow.stage === 'recall') {
        const missedLines = toMultipleChoiceFocusLines(lineReviews)
        flowState.setFocus({ sequenceStage: 'recall', focusSummary: buildFlowFocusSummary(card.title, missedLines), missedLines })
      }
      return
    }
    if (!isGhostRep && closeEnough) completeCardInSession(sound, elapsedMs)
  }

  const submitMultipleChoice = async () => {
    const mcqCard = activeMultipleChoiceCard
    if (currentPracticeMode !== 'multiple-choice' || !mcqCard || !hasDeck || hasAnsweredCurrent || session.finished) return
    const interactionId = recall.ensureInteractionId()
    await mcq.submit(
      mcqCard,
      (selectedChoice, elapsedMs) => submitMultipleChoiceAttemptToServer(mcqCard, selectedChoice.id, elapsedMs, interactionId),
      (saved, elapsedMs) => {
        if (!isFlowActive) completeCardInSession(saved.successful, elapsedMs)
      },
    )
  }

  const latestSubmittedAttempt = recall.latest
  const latestSubmittedWasGhostRep = latestSubmittedAttempt?.supportLayer === 'ghost-reps'
  const totalRecallEvaluationPending = currentPracticeMode === 'recall'
    && mainPhase === 'typing'
    && recall.evaluating
    && effectiveSupportLayer !== 'ghost-reps'
  const flowMicroDrillActionKey = practiceFlow?.stage === 'microdrill'
    ? `${practiceFlow.runId}-${practiceFlow.step}`
    : ''
  const primaryCardAction = resolvePrimaryAction({
    ladderActive,
    flowStage: practiceFlow?.stage ?? null,
    microDrill: flowState.microDrillAction.interactionKey === flowMicroDrillActionKey
      ? flowState.microDrillAction
      : EMPTY_FLOW_MICRODRILL_ACTION_STATE,
    hasDeck,
    practiceMode: currentPracticeMode,
    mainPhase,
    coachLoading: recall.evaluating,
    mcqSubmitted: mcqView.submitted,
    mcqSelected: Boolean(mcqView.selectedChoice),
    mcqGrading: mcq.grading,
    hasAnsweredCurrent,
    sessionFinished: session.finished,
    latestSubmittedWasGhostRep,
    recallEvaluationPending: totalRecallEvaluationPending,
    recallInputEmpty: recall.submissionInput.trim().length === 0,
    mainCloseEnough: recall.closeEnough,
  })
  const primaryActionHandlers: Record<PrimaryActionKind, () => void> = {
    'flow-next': () => void flowControls.advance(),
    'microdrill-submit': () => flowMicroDrillPrimaryActionRef.current(),
    'mcq-submit': () => void submitMultipleChoice(),
    'recall-start': recall.start,
    'recall-submit': () => void recall.submit(),
    'ghost-repeat': recall.repeat,
    'recall-revise': recall.revise,
  }

  usePracticeHotkeys({
    primaryButtonRef: primaryCardButtonRef,
    // The card action is unavailable while the Flow panel is open.
    onSubmitKey: () => {
      if (panels.flowOpen || !primaryCardAction || primaryCardAction.disabled) return
      primaryActionHandlers[primaryCardAction.kind]()
    },
    onHiddenPrimaryKey: () => {
      if (panels.flowOpen || !primaryCardAction?.keyboardOnly || primaryCardAction.disabled) return false
      primaryActionHandlers[primaryCardAction.kind]()
      return true
    },
    recallActive: currentPracticeMode === 'recall',
    flowActive: isFlowActive,
    onToggleAiCompletion: toggleAiCompletion,
    onToggleGhostReps: () => setSupportLayer((current) => (current === 'ghost-reps' ? 'none' : 'ghost-reps')),
    onToggleInline: toggleInlineHelper,
  })

  useMultipleChoiceHotkeys({
    enabled: currentPracticeMode === 'multiple-choice'
      && !mcqView.submitted && !hasAnsweredCurrent && !session.finished
      && !panels.flowOpen,
    choiceIds: activeMultipleChoiceCard?.choices.map((choice) => choice.id) ?? [],
    onChoose: mcq.select,
  })

  const microDrillEditorReady = !panels.flowOpen
    && practiceFlow?.stage === 'microdrill'
    && flowState.microDrillAction.interactionKey === flowMicroDrillActionKey
    && flowState.microDrillAction.ready
    && !flowState.microDrillAction.submitted

  useEffect(() => {
    if (!microDrillEditorReady) return
    const frame = window.requestAnimationFrame(() => focusMicroDrillInput(flowStageContentRef.current))
    return () => window.cancelAnimationFrame(frame)
  }, [microDrillEditorReady, flowMicroDrillActionKey])

  const chooseMultipleChoice = () => {
    if (practiceMode === 'multiple-choice') return
    setMcqSourceSpecimen(cardSpecimen(card, practicePrompt, practiceTarget))
    setMcqRequestId((id) => id + 1)
    setPracticeMode('multiple-choice')
  }
  const questionType = questionTypeOf(currentPracticeMode, effectiveSupportLayer)
  /** Switch to a question type; false when it is not available yet (MCQ needs a loaded deck). */
  const selectQuestionType = (next: QuestionType) => {
    if (next === 'mcq') {
      if (skillMapLoading || filteredDeck.length === 0) return false
      setSupportLayer('none')
      chooseMultipleChoice()
      return true
    }
    setPracticeMode('recall')
    setSupportLayer(next === 'ghost' ? 'ghost-reps' : 'none')
    return true
  }
  // The four modified double arrows select a modality directly. Microdrill begins a Flow.
  useDoubleTapArrows(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'], (key) => {
    const stage: FlowStage = key === 'ArrowUp' ? 'recall'
      : key === 'ArrowLeft' ? 'microdrill'
        : key === 'ArrowRight' ? 'ghost'
          : 'multiple-choice'
    if (isFlowActive || ladderActive || stage === 'microdrill') {
      void flowControls.activateStage(stage)
      return
    }
    const next: QuestionType = stage === 'multiple-choice' ? 'mcq' : stage
    selectQuestionType(next)
  })

  const saveMicroDrill = (payload: Pick<AttemptPayload, 'correctAnswer' | 'userAnswer' | 'question' | 'elapsedMs' | 'interactionId' | 'signals' | 'outsideFlow'>) =>
    submitAttemptToServer({
      mode: 'main-recall', microdrill: true, templateMode: currentTemplateMode, supportLayer: 'none', liveCoachUsed: false, modality: 'microdrill', ...payload,
    })

  const stage = ladderActive && ladderTechnique ? (
    <SlidingWindowLadder
      key={card.id}
      cardId={card.id}
      cardTitle={card.title}
      cardPrompt={practicePrompt}
      cardTarget={practiceTarget}
      technique={ladderTechnique}
      provider={requestLlmProvider}
      theme={theme}
      onClose={panels.closeLadder}
      onSave={(question, answer, elapsedMs, interactionId, rungIndex, rep) => saveMicroDrill({
        correctAnswer: question.solution, userAnswer: answer, question: question.question, elapsedMs, interactionId,
        signals: { modality: { ladder: true, technique: ladderTechnique, rungIndex, rep, language: 'python' } },
        outsideFlow: true,
      })}
    />
  ) : practiceFlow?.stage === 'microdrill' ? (
    <FlowMicroDrillCard
      key={flowMicroDrillActionKey}
      title={card.title} prompt={practicePrompt} target={practiceTarget}
      focus={practiceFlow.focus.focusSummary} rep={practiceFlow.step + 1}
      context={flowState.generationContext}
      provider={requestLlmProvider} theme={theme} syntaxTheme={syntaxTheme}
      actionKey={flowMicroDrillActionKey}
      primaryActionRef={flowMicroDrillPrimaryActionRef}
      onPrimaryActionStateChange={flowState.setMicroDrillAction}
      onSave={(drill, answer, elapsedMs, interactionId) => saveMicroDrill({
        correctAnswer: drill.solution, userAnswer: answer, question: drill.prompt, elapsedMs, interactionId,
        signals: {
          modality: {
            blankCount: drill.template.match(/_{3,}/g)?.length ?? 0,
            language: drill.language,
            templateLineCount: drill.template.split('\n').length,
          },
        },
      })}
    />
  ) : panels.flowOpen ? (
    <FlowPanel
      config={flowConfig}
      locked={isFlowActive}
      onConfigChange={(config) => { setFlowConfig(config); saveFlowConfig(config) }}
      status={flowControls.statusText}
      historyError={flowState.historyError}
      focus={practiceFlow?.focus ?? null}
    />
  ) : (
    <div className="card-grid">
      <PromptPanel
        mode={currentPracticeMode}
        hasDeck={hasDeck}
        loading={activeLoading}
        error={activeError}
        onRetry={isFlowActive ? flowMcqDeck.retry : null}
        mcqCard={activeMultipleChoiceCard}
        prompt={practicePrompt}
        explanation={skeletonReference ? skeletonReference.explanation : null}
        topic={cardMeta.headerTitle}
        syntaxTheme={syntaxTheme}
        theme={theme}
      />
      {currentPracticeMode === 'multiple-choice' ? (
        <MultipleChoicePanel
          hasDeck={hasDeck}
          loading={activeLoading}
          error={activeError}
          card={activeMultipleChoiceCard}
          attempt={mcq}
          locked={hasAnsweredCurrent || session.finished}
          syntaxTheme={syntaxTheme}
        />
      ) : (
        <RecallPanel
          hasDeck={hasDeck}
          loading={activeLoading}
          error={activeError}
          attempt={recall}
          target={practiceTarget}
          theme={theme}
          tuning={codeEditorTuning}
          ghostReps={isGhostRepsEnabled}
          ghostStageLines={practiceFlow?.stage === 'ghost' ? targetedGhostLineCount || practiceFlow.focus.missedLines.length : null}
          inlineEnabled={inlineEnabled}
          inlineTask={currentInlineTask}
          inFlow={isFlowActive}
          locked={hasAnsweredCurrent || session.finished}
          evaluating={totalRecallEvaluationPending}
          aiCompletion={{ cardId: card.id, cardTitle: card.title, prompt: practicePrompt, provider: requestLlmProvider, historyKey: cardMeta.recallHistoryKey }}
        />
      )}
    </div>
  )

  return (
    <div className={['app', panels.relatedOpen && relatedLeetCodeSet ? 'app-side-drawer-open' : '', panels.zen ? 'app-zen-mode' : ''].filter(Boolean).join(' ')}>
      {recall.failure && <SubmissionFailureModal failure={recall.failure} onClose={recall.dismissFailure} />}
      <TopNav questionType={questionTypeLabel(questionType, practiceFlow?.stage ?? null)} practiceHistoryHref={cardMeta.historyHref} />

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
        <div className={['card-shell', currentPracticeMode === 'multiple-choice' ? 'card-shell-mcq' : '', relatedLeetCodeSet ? 'card-shell-has-drawer' : ''].filter(Boolean).join(' ')}>
          <section className="card">
            {session.finished && (
              <SessionSummary mode={currentPracticeMode} correctCount={session.correctCount} attempts={session.attempts} plan={sessionPlan} />
            )}

            <div className="flow-stage-stack">
              <div ref={flowStageContentRef} className="flow-stage-content">
                {isFlowActive && recall.error && mainPhase === 'typing' && <p className="flow-submit-error" role="alert">{recall.error}</p>}
                {stage}
              </div>
            </div>

            <PracticeControlBar
              primaryButtonRef={primaryCardButtonRef}
              flowPanelOpen={panels.flowOpen}
              flowRunning={isFlowActive}
              canStartFlow={hasRecallDeck && !session.finished && !flowState.historyLoading}
              onStartFlow={() => void flowControls.start()}
              onStopFlow={flowControls.stop}
              action={primaryCardAction}
              onAction={primaryCardAction ? primaryActionHandlers[primaryCardAction.kind] : () => {}}
            />
          </section>
          {relatedLeetCodeSet && (
            <RelatedLeetCodeDrawer relatedSet={relatedLeetCodeSet} open={panels.relatedOpen} onClose={panels.closeRelated} />
          )}
        </div>
      )}
    </div>
  )
}

export default PracticePage
