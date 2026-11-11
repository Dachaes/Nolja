import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isTerminalError, type RoomApiError } from '../api/roomApi'
import { receiveRoom } from '../model/roomCache'
import { connectRoom } from '../realtime/connectRoom'
import type { ConnectionStatus } from '../realtime/protocol'
import type { RoomSession } from '../types'
import { clearSession, saveSession } from '../model/session'

// 연결 상태는 React state, 보드는 React Query 캐시에 보관합니다.
// 전송 모듈은 이 훅이 넘긴 콜백을 호출할 뿐 React를 직접 알 필요가 없습니다.
export function useRoomConnection(code: string, session: RoomSession) {
  const client = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<RoomApiError | null>(null)
  const [serverOffset, setServerOffset] = useState(0)
  const connection = useRef<ReturnType<typeof connectRoom> | null>(null)
  const { playerId, token, gameType } = session

  useEffect(() => {
    const subscription = connectRoom({
      code,
      session: { playerId, token, gameType },
      onRoom: room => {
        receiveRoom(client, { playerId, token, gameType }, room)
        saveSession(code, { playerId, token, gameType })
        setServerOffset(Date.parse(room.serverTime) - Date.now())
      },
      onStatus: setStatus,
      onError: error => {
        setError(error)
        if (isTerminalError(error)) clearSession(code, gameType)
      },
    })
    connection.current = subscription
    return () => { subscription.dispose(); connection.current = null }
  }, [client, code, playerId, token, gameType])

  return { status, error, serverOffset, retry: () => connection.current?.retry() }
}
