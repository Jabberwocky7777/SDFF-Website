/**
 * Calendar dates in America/New_York.
 *
 * KTC takes one value snapshot per day, so "the value on the day of the trade"
 * is a calendar-date lookup, and the calendar that matters is the league's:
 * a Sunday-evening trade in New York is already Monday in UTC. `Intl` is used
 * rather than arithmetic so DST is somebody else's problem.
 */
const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Epoch ms → 'YYYY-MM-DD' in America/New_York. */
export function nyDateString(ms: number): string {
  // en-CA formats as YYYY-MM-DD already.
  return FORMATTER.format(new Date(ms))
}

/** Shift a 'YYYY-MM-DD' string by whole days. Calendar arithmetic, no tz. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}
