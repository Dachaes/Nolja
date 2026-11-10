import { isRoomSnapshot } from '../model/roomSnapshot.ts'
import type { Room, RoomSession } from '../types.ts'

const key = (code: string) => `nollja:recovery:${code}`

// 마지막 확인된 보드는 복구 중 읽기 전용 표시용입니다. 서버 인증 전에는 절대로 착수에 사용하지 않습니다.
export function readRoomSnapshot(code: string, session: RoomSession): Room | undefined {
  try {
    const saved: { playerId?: unknown; room?: unknown; savedAt?: unknown } | null = JSON.parse(sessionStorage.getItem(key(code)) ?? 'null')
    if (!saved || saved.playerId !== session.playerId || !isRoomSnapshot(saved.room)
      || saved.room.code !== code || !saved.room.players.some(player => player.playerId === session.playerId)
      || typeof saved.savedAt !== 'number' || !Number.isFinite(saved.savedAt)) return undefined
    // 서버 만료 시각까지의 남은 수명을 저장 당시 기기 시각에 더해 기기 간 시계 차이를 줄입니다.
    const remainingLifetime = Date.parse(saved.room.expiresAt) - Date.parse(saved.room.serverTime)
    if (Date.now() - saved.savedAt >= remainingLifetime || Date.now() < saved.savedAt) {
      clearRoomSnapshot(code)
      return undefined
    }
    return saved.room
  } catch { return undefined }
}

// receiveRoom이 검증한 최신 서버 상태만 저장합니다. 저장소의 revision은 신뢰하지 않습니다.
// 복구한 옛 보드를 다시 저장해 유효 시간을 연장하지 않습니다.
export function saveRoomSnapshot(room: Room, session: RoomSession) {
  if (!isRoomSnapshot(room) || !room.players.some(player => player.playerId === session.playerId)) return
  try {
    sessionStorage.setItem(key(room.code), JSON.stringify({ playerId: session.playerId, room, savedAt: Date.now() }))
  } catch { /* 저장 공간 부족/저장소 차단 시에도 현재 연결된 대국은 계속할 수 있습니다. */ }
}

export function clearRoomSnapshot(code: string) {
  try { sessionStorage.removeItem(key(code)) } catch { /* 저장소 접근이 차단되어도 로비 이동은 계속합니다. */ }
}
