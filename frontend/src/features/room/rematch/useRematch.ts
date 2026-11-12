import { useMutation, useQueryClient } from '@tanstack/react-query'
import { roomApi } from '../api/roomApi'
import { receiveRoom } from '../model/roomCache'
import type { RoomSession } from '../types'

// 재대결 HTTP 요청과 캐시 반영을 분리합니다. 상대의 동의는 기존 WebSocket 경로로 들어옵니다.
export function useRematch(code: string, session: RoomSession, gameNumber: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (ready: boolean) => roomApi.rematch(code, session, gameNumber, ready),
    onSuccess: room => {
      receiveRoom(client, session, room)
    },
    // 서버가 처리한 뒤 응답만 유실될 수 있으므로 실패 시 한 번 최신 상태를 확인합니다.
    // 재연결 시에도 같은 전체 상태를 받으므로 여기서 주기 조회를 만들 필요는 없습니다.
    onError: async () => {
      try {
        const room = await roomApi.state(code, session)
        receiveRoom(client, session, room)
      } catch {
        /* 연결/방 종료 안내는 공통 연결 훅이 담당합니다. */
      }
    },
    retry: false,
  })
}
