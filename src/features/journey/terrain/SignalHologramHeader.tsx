import InfoTip from '@/shared/components/InfoTip'

const SCORE_EXPLANATION = (
  <>
    Every graded answer gives each signal a score from 0 to 100. <strong>Correct choice</strong>: 100 if the answer
    was right, 0 if not. <strong>Yes/no signals</strong> (e.g. concept recognition): how likely Jev judged the answer
    to be a yes, times 100. <strong>Scale signals</strong> (e.g. near miss): where the answer landed on the scale,
    e.g. the middle of three levels is 50. <strong>Recall signals</strong>: the assessor&rsquo;s 0&ndash;100 rating of
    that part of your code. <strong>Speed</strong>: 100 at 10 seconds or faster, falling to 0 at 90 seconds. Signals
    that didn&rsquo;t apply to an answer, like near miss on a correct one, aren&rsquo;t plotted.
  </>
)

/**
 * The terrain's title, explainer and legend. Kept out of SignalHologram (and three.js) so the loading
 * placeholder renders the exact same header: nothing moves when the scene arrives.
 */
export default function SignalHologramHeader({ summary }: { summary: string }) {
  return (
    <div className="signal-hologram-header">
      <div className="signal-hologram-title">
        <p className="dashboard-activity-eyebrow">
          Signal Score Terrain{' '}
          <InfoTip label="what a signal score is">{SCORE_EXPLANATION}</InfoTip>
        </p>
        {/* Always rendered so the line's height is reserved before the summary arrives. */}
        <p className={`history-day-summary signal-hologram-summary${summary ? ' signal-hologram-summary-ready' : ''}`}>
          {summary ? `${summary} · all time` : ' '}
        </p>
        <p className="signal-hologram-explainer">
          Height is how far each signal fell short of a perfect 100, smoothed over time: peaks are weak spots,
          flat ground is where you scored well. Dots are individual answers.
        </p>
      </div>
      <div className="signal-hologram-legend" aria-label="Colors: strong scores to weak scores">
        <span>strong · 100</span>
        <span className="signal-hologram-gradient" aria-hidden="true" />
        <span>weak · 0</span>
      </div>
    </div>
  )
}
