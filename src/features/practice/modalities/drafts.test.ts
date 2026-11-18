import { describe, expect, it } from 'vitest'
import type { AttemptPayload, FlowMicroDrill, MultipleChoiceCard } from '@/features/practice/lib/types'
import { mcqDraft } from './mcq/draft'
import { recallDraft } from './recall/draft'
import { microdrillDraft } from './microdrill/draft'
import { ladderDraft } from './ladder/draft'

const card = { id: 'card-1', title: 'Window', tags: ['sliding-window', 'arrays'] }
const naming = { card, categoryTags: ['sliding-window'] }
const timing = { elapsedMs: 900, interactionId: 'i-1' }

describe('modality drafts', () => {
  it('describes an MCQ answer as the chosen option of the stored question', () => {
    const mcq = { id: 'mcq-1', question: 'Which?', choices: [] } as unknown as MultipleChoiceCard
    expect(mcqDraft(mcq, 'C', timing, { categoryTags: ['x'] })).toEqual({
      modality: 'mcq', card: mcq, question: 'Which?', categoryTags: ['x'], answer: 'C',
      elapsedMs: 900, interactionId: 'i-1', multipleChoiceProblemId: 'mcq-1', modalitySignals: { selectedChoiceId: 'C' },
    })
  })

  it('describes a recall answer from the attempt payload, falling back to the card prompt', () => {
    const payload = {
      modality: 'ghost-rep', userAnswer: 'code', correctAnswer: 'ref', elapsedMs: 5, interactionId: 'i-2',
      supportLayer: 'ghost-reps', liveCoachUsed: true, signals: { modality: { exact: false } },
    } as unknown as AttemptPayload
    expect(recallDraft(payload, { ...naming, question: 'Prompt' })).toMatchObject({
      modality: 'ghost-rep', question: 'Prompt', answer: 'code', reference: 'ref', supportLayer: 'ghost-reps',
      liveCoachUsed: true, modalitySignals: { exact: false }, categoryTags: ['sliding-window'],
    })
    expect(recallDraft({ ...payload, question: 'Own' }, { ...naming, question: 'Prompt' }).question).toBe('Own')
  })

  it('describes a microdrill answer against its stored drill', () => {
    const drill = { id: 'ex-1', prompt: 'Fill', solution: 'a\nb', template: 'x = ___\ny = ____', language: 'python' } as unknown as FlowMicroDrill
    expect(microdrillDraft(drill, 'x = 1\ny = 2', timing, naming)).toMatchObject({
      modality: 'microdrill', question: 'Fill', reference: 'a\nb', exerciseId: 'ex-1',
      modalitySignals: { blankCount: 2, language: 'python', templateLineCount: 2 },
    })
  })

  it('files a ladder rung under the card’s own tags', () => {
    const question = { id: 'rung-1', rungTitle: 'R', question: 'Write', starterCode: '', solution: 'sol', language: 'python' }
    expect(ladderDraft(question, 'ans', timing, { technique: 'fixed', rungIndex: 2, rep: 3 }, naming)).toMatchObject({
      modality: 'ladder', categoryTags: ['sliding-window', 'arrays'], exerciseId: 'rung-1', reference: 'sol',
      modalitySignals: { ladder: true, technique: 'fixed', rungIndex: 2, rep: 3, language: 'python' },
    })
  })
})
