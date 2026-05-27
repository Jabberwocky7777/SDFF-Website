import type { TeamRecord } from '@/types/domain'

export interface PowerRankEntry {
  rosterId: number
  teamName: string
  avatarUrl: string | null
  score: number         // 0–100
  combinedWinPct: number
  normalizedPF: number
  normalizedMPF: number
  recentFormPct: number
  summary: string
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50
  return Math.round(((value - min) / (max - min)) * 100)
}

function recentFormWinPct(
  rosterId: number,
  allWeekMatchups: { roster_id: number; matchup_id: number; points: number }[][],
  weeksBack = 3,
): number {
  const recent = allWeekMatchups.slice(-weeksBack)
  let wins = 0
  let total = 0
  for (const week of recent) {
    const me = week.find((m) => m.roster_id === rosterId)
    if (!me) continue
    // H2H result
    const opp = week.find((m) => m.matchup_id === me.matchup_id && m.roster_id !== me.roster_id)
    if (opp) {
      wins += me.points > opp.points ? 1 : 0
      total++
    }
    // Median result
    const scores = week.map((m) => m.points).sort((a, b) => a - b)
    const mid = Math.floor(scores.length / 2)
    const median = scores.length % 2 === 0
      ? (scores[mid - 1] + scores[mid]) / 2
      : scores[mid]
    wins += me.points > median ? 1 : 0
    total++
  }
  return total > 0 ? wins / total : 0
}

export function computePowerRankings(
  standings: TeamRecord[],
  allWeekMatchups: { roster_id: number; matchup_id: number; points: number }[][],
): PowerRankEntry[] {
  if (standings.length === 0) return []

  const pfValues = standings.map((s) => s.pf)
  const mpfValues = standings.map((s) => s.mpf)
  const pfMin = Math.min(...pfValues)
  const pfMax = Math.max(...pfValues)
  const mpfMin = Math.min(...mpfValues)
  const mpfMax = Math.max(...mpfValues)

  const entries: PowerRankEntry[] = standings.map((team) => {
    const total = team.totalWins + team.totalLosses
    const combinedWinPct = total > 0 ? team.totalWins / total : 0
    const normalizedPF = normalize(team.pf, pfMin, pfMax)
    const normalizedMPF = normalize(team.mpf, mpfMin, mpfMax)
    const recentFormPct = recentFormWinPct(team.rosterId, allWeekMatchups)

    const score = Math.round(
      0.40 * combinedWinPct * 100 +
      0.30 * normalizedPF +
      0.20 * normalizedMPF +
      0.10 * recentFormPct * 100,
    )

    // Auto-generate summary based on dominant factor
    let summary = ''
    if (normalizedPF >= 85) summary = 'Leads league in scoring'
    else if (combinedWinPct >= 0.75) summary = 'Elite combined record'
    else if (normalizedMPF >= 85) summary = 'Tops in max potential'
    else if (recentFormPct >= 0.8) summary = 'Hot streak — 3-week surge'
    else if (team.luckIndex >= 15) summary = 'Lucky record — watch out for regression'
    else if (team.luckIndex <= -15) summary = 'Unlucky — better than record shows'
    else if (normalizedPF <= 30) summary = 'Scoring dragging down ranking'
    else summary = 'Steady performer'

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      avatarUrl: team.avatarUrl,
      score,
      combinedWinPct,
      normalizedPF,
      normalizedMPF,
      recentFormPct,
      summary,
    }
  })

  return entries.sort((a, b) => b.score - a.score)
}
