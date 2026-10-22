/**
 * When is an NFL week *over*?
 *
 * The matchup table holds the in-progress week too — the scheduler ingests
 * live scores every 15 minutes on game days — so anything that must only use
 * finished results needs a cutoff that doesn't depend on Sleeper's own week
 * counter (which advances before the week's games have been played).
 *
 * NFL week 1 kicks off the Thursday after Labor Day (first Monday of
 * September). Week N's games run Thursday → Monday night, so the week is final
 * once the following Tuesday morning arrives. 11:00 UTC = 7am EDT / 6am EST,
 * comfortably after the latest Monday-night finish in either offset.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** Tuesday 11:00 UTC. */
const FINAL_HOUR_UTC = 11

/** Epoch ms of week 1's Thursday (00:00 UTC) for an NFL season. */
export function nflKickoffThursday(season: number): number {
  const sept1 = Date.UTC(season, 8, 1)
  const dow = new Date(sept1).getUTCDay() // 0 = Sun … 1 = Mon
  const laborDay = sept1 + ((1 - dow + 7) % 7) * DAY_MS
  return laborDay + 3 * DAY_MS
}

/** Epoch ms at which NFL `week` of `season` counts as final. */
export function nflWeekFinalAt(season: number, week: number): number {
  const thursday = nflKickoffThursday(season) + (week - 1) * 7 * DAY_MS
  return thursday + 5 * DAY_MS + FINAL_HOUR_UTC * 60 * 60 * 1000
}

/**
 * How long a final week is still worth re-pulling from Sleeper.
 *
 * A week goes final the Tuesday morning after its Monday-night game, but
 * Sleeper's own numbers aren't settled then: Monday-night scoring and stat
 * corrections trickle in for days (a Tuesday-evening pull of SDFF week 6 was
 * short by 10-40 points for several teams). Keep re-ingesting until the Friday
 * after, then leave the week alone.
 */
export function nflWeekRefreshUntil(season: number, week: number): number {
  return nflWeekFinalAt(season, week) + 3 * DAY_MS
}

/**
 * The highest week whose results are final *and* were stored after they went
 * final. `lastSyncStartedAt` is when the most recent successful sync of this
 * league-season began: data fetched before a week's cutoff may still hold
 * Monday-night scores mid-game, so that week isn't trusted until a sync has run
 * past it. Returns 0 when no week qualifies.
 */
export function lastFinalWeek(
  season: number,
  now: number,
  lastSyncStartedAt: number | null,
  maxWeek = 18,
): number {
  const seenAt = Math.min(now, lastSyncStartedAt ?? 0)
  let week = 0
  while (week < maxWeek && nflWeekFinalAt(season, week + 1) <= seenAt) week++
  return week
}
