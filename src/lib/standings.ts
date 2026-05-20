import type { SleeperRoster, SleeperUser, SleeperMatchup } from '@/types/sleeper'
import type { TeamRecord } from '@/types/domain'
import { computeWeeklyMedian } from './median'
import { getMpf } from './mpf'
import { avatarUrl, getTeamName } from './formatters'

export function computeStandings(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  allWeekMatchups: SleeperMatchup[][],
): TeamRecord[] {
  const records = new Map<number, TeamRecord>()

  for (const roster of rosters) {
    const user = users.find((u) => u.user_id === roster.owner_id)
    const pf = (roster.settings.fpts ?? 0) + (roster.settings.fpts_decimal ?? 0) / 100
    const pa = (roster.settings.fpts_against ?? 0) + (roster.settings.fpts_against_decimal ?? 0) / 100

    records.set(roster.roster_id, {
      rosterId: roster.roster_id,
      userId: roster.owner_id,
      teamName: getTeamName(roster.owner_id, users),
      avatarUrl: avatarUrl(user?.avatar),
      h2hWins: roster.settings.wins ?? 0,
      h2hLosses: roster.settings.losses ?? 0,
      h2hTies: roster.settings.ties ?? 0,
      medianWins: 0,
      medianLosses: 0,
      totalWins: roster.settings.wins ?? 0,
      totalLosses: roster.settings.losses ?? 0,
      pf,
      pa,
      mpf: getMpf(roster),
      streak: 0,
    })
  }

  // Compute median wins/losses from weekly matchup data
  for (const weekMatchups of allWeekMatchups) {
    if (weekMatchups.length === 0) continue
    const median = computeWeeklyMedian(weekMatchups)
    for (const m of weekMatchups) {
      const rec = records.get(m.roster_id)
      if (!rec) continue
      if (m.points > median) {
        rec.medianWins++
        rec.totalWins++
      } else {
        rec.medianLosses++
        rec.totalLosses++
      }
    }
  }

  // Compute streak from most recent weeks
  for (const record of records.values()) {
    let streak = 0
    for (let i = allWeekMatchups.length - 1; i >= 0; i--) {
      const weekMatchups = allWeekMatchups[i]
      const m = weekMatchups.find((wm) => wm.roster_id === record.rosterId)
      if (!m) break
      const opponent = weekMatchups.find(
        (wm) => wm.matchup_id === m.matchup_id && wm.roster_id !== m.roster_id,
      )
      if (!opponent) break
      const won = m.points > opponent.points
      if (streak === 0) {
        streak = won ? 1 : -1
      } else if ((streak > 0 && won) || (streak < 0 && !won)) {
        streak += won ? 1 : -1
      } else {
        break
      }
    }
    record.streak = streak
  }

  const sorted = Array.from(records.values()).sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins
    return b.pf - a.pf
  })

  // Assign seeds 1–5 by record
  const top5 = new Set<number>()
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    sorted[i].seed = i + 1
    top5.add(sorted[i].rosterId)
  }

  // Seed 6: highest PF among non-seeds-1-5
  const remaining = sorted.filter((r) => !top5.has(r.rosterId))
  if (remaining.length > 0) {
    const seed6 = remaining.reduce((best, cur) => (cur.pf > best.pf ? cur : best))
    seed6.seed = 6
  }

  return sorted
}
