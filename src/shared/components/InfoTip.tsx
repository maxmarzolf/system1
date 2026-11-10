import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type InfoTipProps = {
  /** What the tip describes, for the button's accessible name ("About <label>"). */
  label: string
  children: ReactNode
}

/**
 * A "?" button that opens a short description. Click (or Enter/Space) toggles it;
 * clicking elsewhere or pressing Escape closes it. Safe inside a <label>: the
 * click does not reach the label's form control.
 */
export default function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Shift the bubble left just enough to stay inside the viewport (never past its left edge).
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !bubbleRef.current) return
    const gutter = 12
    const button = buttonRef.current.getBoundingClientRect()
    const width = bubbleRef.current.offsetWidth
    // clientWidth, not innerWidth: the unpositioned bubble can widen the page and inflate innerWidth.
    const overflow = button.left + width - (document.documentElement.clientWidth - gutter)
    bubbleRef.current.style.left = `${overflow > 0 ? -Math.min(overflow, button.left - gutter) : 0}px`
  }, [open])

  return (
    <span className="info-tip" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="info-tip-button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        ?
      </button>
      {open ? (
        <span ref={bubbleRef} id={id} role="tooltip" className="info-tip-bubble">
          {children}
        </span>
      ) : null}
    </span>
  )
}
