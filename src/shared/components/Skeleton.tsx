/**
 * Placeholder lines shown while content loads. Each entry is a width class (`w45`…`w95`), optionally
 * with `tall` for a line of code.
 */
export default function Skeleton({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => <div key={index} className={`skeleton-line ${line}`} />)}
    </>
  )
}
