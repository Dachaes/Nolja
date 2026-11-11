import type { GameType, Room } from '../types.ts'
import { isRoomSnapshot } from '../model/roomSnapshot.ts'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'closed'
export type RoomSocketMessage =
  | { type: 'room'; room: Room }
  | { type: 'pong' }
  | { type: 'error'; error: { code: string; message: string }; status: number }

// 소켓 메시지를 해석하는 순수 함수입니다. 전체 상태 검증은 저장소 복구에서도 공유합니다.
export function decodeRoomMessage(raw: string): RoomSocketMessage | null {
  try {
    const message = JSON.parse(raw)
    if (!message || typeof message !== 'object') return null
    if (message.type === 'pong') return { type: 'pong' }
    if (message.type === 'error' && typeof message.error?.code === 'string'
      && typeof message.error?.message === 'string' && Number.isInteger(message.status)) return message
    return message.type === 'room' && isRoomSnapshot(message.room) ? message : null
  } catch { return null }
}

// HTTPS 페이지는 암호화된 wss를 사용합니다. 토큰은 URL에 넣지 않고 첫 프레임으로만 보냅니다.
export function roomSocketUrl(origin: string, code: string, gameType: GameType) {
  const url = new URL(`/ws/games/${gameType}/rooms/` + encodeURIComponent(code), origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
