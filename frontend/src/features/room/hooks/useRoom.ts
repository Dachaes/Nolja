import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Position } from '../../othello/types'
import { roomApi } from '../api/roomApi'
import { keepNewestRoom, receiveRoom, roomQueryKey } from '../model/roomCache'
import type { Room, RoomSession } from '../types'
import { useRoomConnection } from './useRoomConnection'
import { readRoomSnapshot } from '../recovery/recoveryStorage'

// 연결 수명과 업무 요청을 조합합니다. 착수는 HTTP로 검증하고, 상대 변화는 WebSocket으로 받습니다.
export function useRoom(code: string, session: RoomSession) {
  const client = useQueryClient()
  const queryKey = roomQueryKey(code, session.playerId, session.gameType)
  const connection = useRoomConnection(code, session)
  // 저장된 보드는 화면 표시용으로만 보관합니다. 서버 상태 캐시에 섞으면 손상된 버전 때문에 복구가 막힐 수 있습니다.
  const [recoveredRoom] = useState(() => readRoomSnapshot(code, session))
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const room = await roomApi.state(code, session, signal)
      return receiveRoom(client, session, room)
    },
    // 연결 직후 최신 보드도 WebSocket으로 받습니다. 타이머/포커스 변경에 따른 상태 조회는 하지 않습니다.
    enabled: false,
    retry: false,
    structuralSharing: (previous: unknown, incoming: unknown) =>
      keepNewestRoom(previous as Room | undefined, incoming as Room),
  })

  const move = useMutation({
    mutationFn: ({ position, revision }: { position: Position; revision: number }) =>
      roomApi.move(code, session, position, revision),
    onSuccess: room => {
      receiveRoom(client, session, room)
    },
    // 응답 유실/오래된 버전 같은 실패 때만 일회성 재조회합니다. 정상 게임에서는 폴링하지 않습니다.
    onError: () => {
      void query.refetch()
    },
    retry: false,
  })

  return { query, move, connection, room: query.data ?? recoveredRoom }
}
