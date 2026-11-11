import type { QueryClient } from '@tanstack/react-query'
import type { GameType, Room, RoomSession } from '../types.ts'
import { saveRoomSnapshot } from '../recovery/recoveryStorage.ts'

// HTTP 착수 응답과 WebSocket 상태 알림은 어느 쪽이 먼저 도착할지 정해져 있지 않습니다.
// 같은 버전은 재사용하고, 오래된 응답으로 보드가 되돌아가지 않도록 공통 비교 함수를 사용합니다.
export function keepNewestRoom(previous: Room | undefined, incoming: Room): Room {
  return previous && previous.gameType === incoming.gameType && previous.code === incoming.code && previous.revision >= incoming.revision ? previous : incoming
}

export const roomQueryKey = (code: string, playerId: string, gameType: GameType) => ['room', gameType, code, playerId] as const

// 메모리 캐시는 서버에서 받은 상태만 비교합니다. 디스크의 손상된 큰 revision이 서버를 이길 수 없습니다.
// HTTP와 소켓 모두 이 함수를 거쳐 화면과 복구용 저장소에 같은 최신 상태를 남깁니다.
export function receiveRoom(client: QueryClient, session: RoomSession, room: Room): Room {
  if (room.gameType !== session.gameType) throw new Error('다른 게임의 방 정보는 적용할 수 없습니다.')
  const accepted = client.setQueryData<Room>(roomQueryKey(room.code, session.playerId, session.gameType), previous => keepNewestRoom(previous, room))
  if (accepted?.revision === room.revision) saveRoomSnapshot(room, session)
  return accepted ?? room
}
