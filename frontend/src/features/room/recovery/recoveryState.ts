import type { Room } from '../types.ts'
import type { CloseReason } from './types.ts'

// UI의 입력 제한과 안내에 공통으로 사용하는 계산입니다. 실제 허용 여부는 서버에서도 검사합니다.
export const allPlayersConnected = (room: Room) => room.presence.every(player => player.connected)

export function closedRoomMessage(reason: CloseReason | null) {
  if (reason === 'reconnect_timeout') {
    return '재접속 대기 시간이 지나 종료된 방입니다.'
  }
  if (reason === 'expired') {
    return '방의 유효 시간이 지났습니다. 새 방을 만들어 주세요.'
  }
  return '참가자가 나가서 종료된 방입니다.'
}

// 초가 0이 되어도 브라우저가 임의로 방을 닫지 않습니다. 서버의 종료 상태를 기다립니다.
export function remainingSeconds(deadline: string, serverOffset: number, now: number) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - now - serverOffset) / 1000))
}
