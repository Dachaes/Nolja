import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isTerminalError, roomApi } from '../api/roomApi'
import { roomQueryKey } from '../model/roomCache'
import { clearSession } from '../model/session'
import type { Room, RoomSession } from '../types'

// 로비 복귀에 필요한 서버 퇴장 → 참가 정보/캐시 제거 → 화면 이동을 한곳에서 처리합니다.
export function useReturnToLobby(code: string, session: RoomSession, room: Room | undefined, onHome: () => void) {
  const client = useQueryClient()
  const submitting = useRef(false)
  const leave = useMutation({ mutationFn: () => roomApi.leave(code, session), retry: false })

  // 이미 종료되었거나 참가 권한이 없는 방에서는 서버 요청 없이 로컬 정보만 정리할 수 있습니다.
  function goToLobby() {
    clearSession(code, session.gameType)
    client.removeQueries({ queryKey: roomQueryKey(code, session.playerId, session.gameType), exact: true })
    onHome()
  }

  async function returnToLobby() {
    if (submitting.current) return
    if (room?.status === 'closed') { goToLobby(); return }
    if (room?.status === 'playing' && !window.confirm('방을 나가면 두 사람의 게임이 종료됩니다. 나갈까요?')) return
    submitting.current = true
    try {
      await leave.mutateAsync()
      goToLobby()
    } catch (error) {
      // 응답을 받기 전에 상대가 퇴장했거나 방이 만료된 경우에도 로비로 돌아갈 수 있습니다.
      // 일시적인 통신 실패이면 화면에 남겨 재시도하게 합니다.
      if (isTerminalError(error)) goToLobby()
    } finally { submitting.current = false }
  }

  return { returnToLobby, goToLobby, pending: leave.isPending, error: leave.error }
}
