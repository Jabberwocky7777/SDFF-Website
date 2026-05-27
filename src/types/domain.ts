export type AgeTier = 'ascending' | 'prime' | 'declining'

export interface TeamRecord {
  rosterId: number
  userId: string
  teamName: string
  avatarUrl: string | null
  h2hWins: number
  h2hLosses: number
  h2hTies: number
  medianWins: number
  medianLosses: number
  totalWins: number
  totalLosses: number
  pf: number
  pa: number
  mpf: number
  streak: number   // positive = win streak, negative = loss streak
  luckIndex: number  // (h2hWinPct - pfRankPct) * 100; positive = lucky, negative = unlucky
  seed?: number
}

export interface WeekMatchup {
  week: number
  matchupId: number
  team1: { rosterId: number; points: number }
  team2: { rosterId: number; points: number }
  medianPoints: number
  team1BeatMedian: boolean
  team2BeatMedian: boolean
}

export interface EnrichedPlayer {
  playerId: string
  fullName: string
  position: string
  nflTeam: string | null
  age: number | null
  ageTier: AgeTier | null
  isTaxi: boolean
  isOnIR: boolean
  injuryStatus: string | null
  yearsExp: number
}

export interface EnrichedRoster {
  rosterId: number
  userId: string
  teamName: string
  avatarUrl: string | null
  starters: EnrichedPlayer[]
  bench: EnrichedPlayer[]
  taxi: EnrichedPlayer[]
  ir: EnrichedPlayer[]
  faabRemaining: number
}

export interface TimelineEvent {
  id: string
  date: string
  label: string
  description?: string
  type: 'draft' | 'deadline' | 'playoffs' | 'offseason' | 'waiver' | 'season'
}

export interface BylawsSection {
  id: string
  title: string
  items: BylawsItem[]
}

export interface BylawsItem {
  question: string
  answer: string
}
