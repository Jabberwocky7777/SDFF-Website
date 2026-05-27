export interface TradedPick {
  season: string           // e.g. "2027"
  round: number            // 1–4
  roster_id: number        // current owner's roster ID
  previous_owner_id: number
  owner_id: number         // original owner's roster ID
}

export interface PickOwnershipCell {
  season: string
  round: number
  originalOwnerRosterId: number
  currentOwnerRosterId: number
  wasTraded: boolean
}

export interface PickOwnershipRow {
  round: number
  cells: PickOwnershipCell[]
}
