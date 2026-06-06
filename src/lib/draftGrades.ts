import type { SleeperDraftPick } from '@/hooks/useDraftPicks'
import type { SleeperRoster, SleeperUser } from '@/types/sleeper'

export const DRAFT_ID = '1337165092222963712'

export interface KTCPlayer {
  sleeperId: string
  playerName: string
  value: number
  position: string
  age: number
}

export interface SleeperProjection {
  pts_ppr?: number
  [key: string]: unknown
}

export interface TeamGrade {
  userId: string
  rosterId: number
  teamName: string
  ownerName: string
  picks: number
  totalDynastyValue: number
  totalProjPoints: number
  avgAge: number
  valueScore: number
  projScore: number
  combined: number
  grade: 'Contender' | 'Competitive' | 'Rebuilding'
  topPlayers: { name: string; position: string; ktcValue: number; projPts: number }[]
}

const EXCLUDED_POSITIONS = new Set(['K', 'DEF'])

function normalize(val: number, min: number, max: number): number {
  if (max === min) return 50
  return ((val - min) / (max - min)) * 100
}

export function gradeTeams(
  picks: SleeperDraftPick[],
  rosters: SleeperRoster[],
  users: SleeperUser[],
  ktcPlayers: KTCPlayer[],
  sleeperProjections: Record<string, SleeperProjection>,
): TeamGrade[] {
  const byId = new Map<string, KTCPlayer>()
  const byName = new Map<string, KTCPlayer>()
  for (const p of ktcPlayers) {
    if (EXCLUDED_POSITIONS.has(p.position)) continue
    byId.set(p.sleeperId, p)
    byName.set(p.playerName.toLowerCase(), p)
  }

  const userMap = new Map<string, SleeperUser>()
  for (const u of users) userMap.set(u.user_id, u)

  // picked_by is a user_id string; roster_id on the pick is the correct team key
  const picksByRoster = new Map<number, SleeperDraftPick[]>()
  for (const pick of picks) {
    const rid = pick.roster_id
    if (!picksByRoster.has(rid)) picksByRoster.set(rid, [])
    picksByRoster.get(rid)!.push(pick)
  }

  const raw = rosters.map(roster => {
    const user = userMap.get(roster.owner_id)
    const teamPicks = (picksByRoster.get(roster.roster_id) ?? []).filter(
      p => !EXCLUDED_POSITIONS.has(p.metadata.position),
    )

    let totalDynastyValue = 0
    let totalProjPoints = 0
    const ages: number[] = []
    const playerDetails: TeamGrade['topPlayers'] = []

    for (const pick of teamPicks) {
      const fullName = `${pick.metadata.first_name} ${pick.metadata.last_name}`
      const ktc = byId.get(pick.player_id) ?? byName.get(fullName.toLowerCase())
      const ktcValue = ktc?.value ?? 1500
      const projPts = sleeperProjections[pick.player_id]?.pts_ppr ?? 0

      totalDynastyValue += ktcValue
      totalProjPoints += projPts

      const pickMeta = pick.metadata as Record<string, unknown>
      const metaAge = typeof pickMeta.age === 'number' ? pickMeta.age : undefined
      const age = ktc?.age ?? metaAge
      if (age && age > 0) ages.push(age)

      playerDetails.push({ name: fullName, position: pick.metadata.position, ktcValue, projPts })
    }

    const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0
    const topPlayers = [...playerDetails].sort((a, b) => b.ktcValue - a.ktcValue).slice(0, 8)

    return {
      rosterId: roster.roster_id,
      userId: roster.owner_id,
      teamName: user?.metadata.team_name ?? user?.display_name ?? `Team ${roster.roster_id}`,
      ownerName: user?.display_name ?? 'Unknown',
      picks: teamPicks.length,
      totalDynastyValue,
      totalProjPoints,
      avgAge,
      topPlayers,
    }
  })

  const values = raw.map(r => r.totalDynastyValue)
  const projs = raw.map(r => r.totalProjPoints)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const minP = Math.min(...projs)
  const maxP = Math.max(...projs)

  return raw.map(r => {
    const valueScore = normalize(r.totalDynastyValue, minV, maxV)
    const projScore = normalize(r.totalProjPoints, minP, maxP)
    const combined = valueScore * 0.55 + projScore * 0.45

    let grade: TeamGrade['grade']
    if (combined >= 70 || (combined >= 45 && r.avgAge <= 25)) grade = 'Contender'
    else if (combined < 30) grade = 'Rebuilding'
    else grade = 'Competitive'

    return { ...r, valueScore, projScore, combined, grade }
  })
}
