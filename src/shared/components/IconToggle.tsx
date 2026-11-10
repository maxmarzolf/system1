import Icon, { type IconName } from './Icon'

/**
 * An icon button that switches something on or off. ``active`` adds the `active` class; pass
 * ``pressed`` for a toggle and ``expanded``/``controls`` for one that opens a panel.
 * ``label`` is what assistive tech announces; ``srLabel`` adds visually hidden text as well.
 */
export default function IconToggle({
  icon, iconSize, className, active, label, title, srLabel, pressed, expanded, controls, keyShortcuts, disabled, onClick,
}: {
  icon: IconName
  iconSize?: number
  className: string
  active: boolean
  label: string
  title: string
  srLabel?: string
  pressed?: boolean
  expanded?: boolean
  controls?: string
  keyShortcuts?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? `${className} active` : className}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={iconSize} />
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </button>
  )
}
