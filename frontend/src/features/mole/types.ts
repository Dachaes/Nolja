// 서버가 보내는 두더지 한 마리의 정보입니다. claimedBy가 null이면 아직 잡히지 않았습니다.
export interface MoleTarget {
  id: number
  hole: number
  appearedAt: string
  expiresAt: string
  claimedBy: string | null
  points: number
}

// 현재 콤보와 최고 콤보를 별도로 보관해 실수 후에도 최고 기록을 표시합니다.
export interface MoleScore {
  playerId: string
  score: number
  hits: number
  misses: number
  combo: number
  bestCombo: number
}

// 게임 시작 전 시각은 null이며, 일시정지 중에는 pausedAt을 기준으로 남은 시간을 계산합니다.
export interface MoleState {
  startsAt: string | null
  endsAt: string | null
  pausedAt: string | null
  finished: boolean
  holes: (MoleTarget | null)[]
  scores: MoleScore[]
}
