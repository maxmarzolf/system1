import type { FieldErrors } from '../lib'

export function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  return errors[field] ? <span className="admin-field-error" role="alert">{errors[field]}</span> : null
}

export function JsonPreview({ value }: { value: unknown }) {
  return <pre className="signal-trace-json">{JSON.stringify(value, null, 2)}</pre>
}
