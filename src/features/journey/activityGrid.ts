/**
 * Lays the daily activity out like a contribution graph: one column per week (Sunday first),
 * one row per weekday. Only places days; the counts come from the server.
 */
import type { DailyWorkDay } from './DailyWorkHistory'

const weekday = (date: string) => new Date(`${date}T12:00:00`).getDay()
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' })

/** Weeks of seven slots, Sunday to Saturday; ``null`` before the first day and after the last. */
export function activityWeeks(days: DailyWorkDay[]): (DailyWorkDay | null)[][] {
  if (!days.length) return []
  const slots: (DailyWorkDay | null)[] = [...Array(weekday(days[0].date)).fill(null), ...days]
  while (slots.length % 7) slots.push(null)
  return Array.from({ length: slots.length / 7 }, (_, index) => slots.slice(index * 7, index * 7 + 7))
}

/** A label for each week that starts a new month (the first week only if a full label fits). */
export function monthLabels(weeks: (DailyWorkDay | null)[][]): { week: number; label: string }[] {
  const labels: { week: number; label: string }[] = []
  let previous = ''
  weeks.forEach((week, index) => {
    const first = week.find((day): day is DailyWorkDay => day !== null)
    if (!first) return
    const month = first.date.slice(0, 7)
    if (month !== previous) {
      // A partial first week too close to the next month would crowd its label.
      if (index > 0 || weeks.length < 3 || weeks[2]?.find(Boolean)?.date.slice(0, 7) === month) {
        labels.push({ week: index, label: monthFormatter.format(new Date(`${first.date}T12:00:00`)) })
      }
      previous = month
    }
  })
  return labels
}

/** The algorithms a day had work in, and its total. */
export const dayWork = (day: DailyWorkDay) => ({
  total: day.segments.reduce((sum, segment) => sum + segment.count, 0),
  slugs: [...new Set(day.segments.filter((segment) => segment.count > 0).map((segment) => segment.slug))],
})
