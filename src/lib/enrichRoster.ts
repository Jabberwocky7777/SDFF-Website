import type { SleeperRoster, SleeperUser, SleeperPlayersMap } from '@/types/sleeper'
import type { EnrichedRoster, EnrichedPlayer } from '@/types/domain'
import { getAgeTier } from './ageTier'
import { avatarUrl, getTeamName } from './formatters'

const IR_SLOTS = ['IR', 'IR_FLEX']
const TAXI_SLOT = 'BN' // taxi is tracked via roster.taxi array, not position slot

function buildPlayer(
  playerId: string,
  players: SleeperPlayersMap,
  taxiIds: Set<string>,
  irIds: Set<string>,
): EnrichedPlayer {
  const p = players[playerId]
  if (!p) {
    return {
      playerId,
      fullName: 'Unknown Player',
      position: '?',
      nflTeam: null,
      age: null,
      ageTier: null,
      isTaxi: taxiIds.has(playerId),
      isOnIR: irIds.has(playerId),
      injuryStatus: null,
      yearsExp: 0,
    }
  }
  return {
    playerId,
    fullName: p.full_name || `${p.first_name} ${p.last_name}`,
    position: p.position,
    nflTeam: p.team,
    age: p.age,
    ageTier: getAgeTier(p.position, p.age),
    isTaxi: taxiIds.has(playerId),
    isOnIR: irIds.has(playerId),
    injuryStatus: p.injury_status,
    yearsExp: p.years_exp ?? 0,
  }
}

export function enrichRoster(
  roster: SleeperRoster,
  users: SleeperUser[],
  players: SleeperPlayersMap,
): EnrichedRoster {
  const taxiIds = new Set(roster.taxi ?? [])
  const irIds = new Set(roster.reserve ?? [])
  const starterIds = new Set(roster.starters ?? [])

  const starterPlayers = (roster.starters ?? [])
    .filter((id) => id !== '0')
    .map((id) => buildPlayer(id, players, taxiIds, irIds))

  const benchPlayers = (roster.players ?? [])
    .filter((id) => !starterIds.has(id) && !taxiIds.has(id) && !irIds.has(id))
    .map((id) => buildPlayer(id, players, taxiIds, irIds))

  const taxiPlayers = Array.from(taxiIds).map((id) =>
    buildPlayer(id, players, taxiIds, irIds),
  )

  const irPlayers = Array.from(irIds).map((id) =>
    buildPlayer(id, players, taxiIds, irIds),
  )

  const waiver_budget = 100
  const used = roster.settings.waiver_budget_used ?? 0
  const faabRemaining = waiver_budget - used

  void IR_SLOTS
  void TAXI_SLOT

  return {
    rosterId: roster.roster_id,
    userId: roster.owner_id,
    teamName: getTeamName(roster.owner_id, users),
    avatarUrl: avatarUrl(users.find((u) => u.user_id === roster.owner_id)?.avatar),
    starters: starterPlayers,
    bench: benchPlayers,
    taxi: taxiPlayers,
    ir: irPlayers,
    faabRemaining,
  }
}
