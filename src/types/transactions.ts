export type TransactionType = 'trade' | 'free_agent' | 'waiver' | 'commissioner'

export interface TransactionAdds {
  [playerId: string]: number  // playerId -> rosterId that added
}

export interface TransactionDrops {
  [playerId: string]: number  // playerId -> rosterId that dropped
}

export interface DraftPickTransfer {
  season: string
  round: number
  roster_id: number
  previous_owner_id: number
  owner_id: number
}

export interface WaiverBudget {
  amount: number
  sender: number    // roster_id
  receiver: number  // roster_id
}

export interface SleeperTransaction {
  transaction_id: string
  type: TransactionType
  status: 'complete' | 'failed' | 'processing'
  roster_ids: number[]
  adds: TransactionAdds | null
  drops: TransactionDrops | null
  draft_picks: DraftPickTransfer[]
  waiver_budget: WaiverBudget[]
  created: number   // Unix timestamp ms
  leg: number       // week number
  consenter_ids: number[]
}
