export type DailyWorkRange = 'week' | 'month' | 'all'

/** The viewer's IANA timezone; history days are grouped by the viewer's calendar, not UTC. */
export const viewerTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** History ranges; ``days`` is the window sent to /api/skill-map-overview (0 = all time).
 * A single day is chosen by clicking its date on the grid's x axis. */
export const DAILY_WORK_RANGES: { value: DailyWorkRange; label: string; days: number }[] = [
  { value: 'week', label: 'Week', days: 7 },
  { value: 'month', label: 'Month', days: 30 },
  { value: 'all', label: 'All-Time', days: 0 },
]

const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

// Calendar dates (YYYY-MM-DD) are parsed at noon so the local timezone never shifts the day.
const parseCalendarDate = (value: string) => new Date(`${value}T12:00:00`)
export const formatCalendarDate = (value: string) => shortDateFormatter.format(parseCalendarDate(value))
export const formatCalendarWeekday = (value: string) => weekdayFormatter.format(parseCalendarDate(value))
export const formatLongCalendarDate = (value: string) => longDateFormatter.format(parseCalendarDate(value))
