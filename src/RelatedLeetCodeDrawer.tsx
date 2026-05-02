import type { RelatedLeetCodeSet } from './data/related-leetcode'

type RelatedLeetCodeDrawerProps = {
  relatedSet: RelatedLeetCodeSet
  open: boolean
  onClose: () => void
}

export default function RelatedLeetCodeDrawer({ relatedSet, open, onClose }: RelatedLeetCodeDrawerProps) {
  return (
    <aside
      id="related-problems-drawer"
      className={open ? 'related-problems-drawer related-problems-drawer-open' : 'related-problems-drawer'}
      aria-label="Related LeetCode questions"
      aria-hidden={!open}
    >
      <div className="related-problems-header">
        <div>
          <span className="related-problems-eyebrow">Shape Matches</span>
          <h3>Highly Corresponding LeetCode</h3>
          <p>{relatedSet.heading}</p>
        </div>
        <button type="button" className="related-problems-close" onClick={onClose} aria-label="Close related problems drawer">
          Close
        </button>
      </div>
      <div className="related-problems-body">
        <p className="related-problems-description">{relatedSet.description}</p>
        <ol className="related-problems-list">
          {relatedSet.problems.map((problem) => (
            <li key={problem.id} className="related-problem-item">
              <span className="related-problem-number">#{problem.id}</span>
              <span className="related-problem-title">{problem.title}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}