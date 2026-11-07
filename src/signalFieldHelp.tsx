import type { ReactNode } from 'react'
import type { SignalPrimitive } from './signalAdmin'

/** Descriptions for every field on /admin, shown in each field's info tooltip. */
export const SIGNAL_FIELD_HELP = {
  key: (
    <>
      Permanent ID for the signal. It is the question ID in the Jev request and the key in stored results, so it can
      never change, even after archiving. camelCase, e.g. <code>heapInvariant</code>.
    </>
  ),
  label: 'Human-readable name shown on this page, in the troubleshooting panel and in rubric results. Not sent to Jev.',
  description:
    'Notes for developers and admins: what the signal is for and how to read it. Never sent to Jev. Anything Jev needs belongs in the instructions and criteria.',
  scope: (
    <>
      <strong>General</strong> signals run for every MCQ. An algorithm scope runs only when the MCQ&rsquo;s algorithm
      (from its pattern tag) matches, in addition to the general signals.
    </>
  ),
  source: (
    <>
      <strong>Jev question</strong>: asked to Jev in the same call as the correctness question.{' '}
      <strong>Computed in code</strong>: calculated locally from the submission with no Jev call; its logic can only
      change in code. Fixed once the signal exists.
    </>
  ),
  implementation:
    'The code that computes this signal. Only implementations registered in backend/app/core/signals can be chosen, and their logic is not editable here.',
  primitive: (
    <>
      How Jev answers. <strong>Choice</strong> picks one label from a set. <strong>Score</strong> places the answer on
      an ordered list of levels. <strong>Noul</strong> returns the probability that the statement is true.
    </>
  ),
  instructions: (
    <>
      The question Jev answers about the submission. Refer to state fields by name: <code>question</code>,{' '}
      <code>answers</code>, <code>correctAnswer</code>, <code>submittedAnswer</code>. Jev sees the instructions and
      criteria, never the key.
    </>
  ),
  scoreMap:
    'Turns the chosen label into a 0–100 score for the rubric. Labels without a score are still recorded but left out of the score.',
  role: (
    <>
      <strong>Dimension</strong>: scored, counts toward the overall and conceptual scores. <strong>Modifier</strong>:
      scored, counts toward the overall score only. <strong>Diagnostic</strong>: the answer is recorded (for example,
      which misconception) but never scored.
    </>
  ),
  weight:
    'Relative weight in the overall score, from 0 to 1. Weights need not add up to 1: the share shown on each signal is its weight divided by the total of correctness plus every active signal in its scope.',
  appliesWhen:
    'Which answers this signal is about. Jev is still asked in the same call, but for answers it does not apply to, the result is stored as not applicable and left out of the score.',
  axis:
    'Optional summary score this signal feeds: fidelity (applied the right idea), executable, or fluency. The rubric uses this signal’s score for that axis.',
  displayOrder: 'Sort order within its group on this page and in the Jev request. Lower numbers come first.',
  needsCorrectness: (
    <>
      Questions in one Jev call can&rsquo;t see each other&rsquo;s answers. Turn this on only if the question must know
      whether the person answered correctly: it is then asked in a second Jev call whose state adds{' '}
      <code>answeredCorrectly</code> (1 or 0). Adds cost and latency.
    </>
  ),
  directiveInstructions:
    'The question Jev answers to decide whether the submission is correct. It sees the same state as every signal; its result decides pass or fail.',
  directiveCorrect:
    'What label "1" means. The label itself is fixed: when Jev chooses "1", the submission is graded as answered correctly.',
  directiveIncorrect: 'What label "0" means. The label itself is fixed: when Jev chooses "0", the submission is graded as incorrect.',
  directiveWeight: 'Weight of the correctness result in the overall score, relative to the weights of the signals.',
  tryQuestion:
    'A recent MCQ stored in the database. The draft is asked about it exactly as it would be during a real evaluation.',
  tryAnswer:
    'The choice to evaluate as if the person had picked it. Whether it is correct comes from the stored answer key.',
  criteria: {
    choice:
      'The labels Jev can choose from, each with a description that tells it apart from the others. Up to 255 labels; descriptions are sent to Jev.',
    score:
      'Ordered levels from lowest (0) to highest. Jev returns a position on this scale, stored as 0–100 by dividing by the top level. At least two levels.',
    noul: 'Optional descriptions of what a yes and a no mean. Jev returns the probability of yes, stored as 0–100.',
  } satisfies Record<SignalPrimitive, string>,
} satisfies Record<string, ReactNode | Record<SignalPrimitive, string>>
