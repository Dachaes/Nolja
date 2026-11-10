// playerId 하나에 소켓이 여러 개여도 하나 이상 살아 있으면 연결 상태를 유지합니다.
export interface PlayerPresence {
  playerId: string
  connected: boolean
  reconnectDeadline: string | null
}

export type CloseReason = 'left' | 'reconnect_timeout' | 'expired'
