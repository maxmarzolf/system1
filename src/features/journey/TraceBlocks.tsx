/** Verbatim blocks for the submission detail views. */

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="signal-trace-json">{JSON.stringify(value, null, 2)}</pre>
}

/** Raw text as sent or received (a prompt, a model reply), shown verbatim. */
export function TextBlock({ value }: { value: unknown }) {
  return <pre className="signal-trace-json signal-trace-text">{String(value ?? '')}</pre>
}
