export interface FantasyCalcPlayer {
  player: {
    id: string
    name: string
    position: string   // "QB" | "RB" | "WR" | "TE" | "K" | "DEF"
    maybeName: string
    maybeId: string
    maybeTeam: string | null
    age: number | null
    sleeperId: string | null
    nflId: string | null
    rotowireId: number | null
    fleaflickerId: number | null
    mflId: string | null
    espnId: number | null
    yahooId: number | null
  }
  value: number           // dynasty value 0–10000
  overallRank: number
  positionRank: number
  redraftValue: number | null
  redraftRank: number | null
}

export type FantasyCalcResponse = FantasyCalcPlayer[]
