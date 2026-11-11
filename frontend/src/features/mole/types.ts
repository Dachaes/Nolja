export interface MoleTarget {
  id: number
  hole: number
  appearedAt: string
  expiresAt: string
  claimedBy: string | null
  points: number
}

export interface MoleScore {
  playerId: string
  score: number
  hits: number
  misses: number
  combo: number
  bestCombo: number
}

export interface MoleState {
  startsAt: string | null
  endsAt: string | null
  pausedAt: string | null
  finished: boolean
  holes: (MoleTarget | null)[]
  scores: MoleScore[]
}
