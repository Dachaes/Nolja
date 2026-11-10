import { useRef } from 'react'
import type { Room, RoomSession } from '../types'
import { useRematch } from './useRematch'
import styles from './RematchPanel.module.scss'
import { allPlayersConnected, closedRoomMessage } from '../recovery/recoveryState'

interface RematchPanelProps {
  room: Room
  session: RoomSession
  connected: boolean
  closed: boolean
  leaving: boolean
  onLobby: () => void
}

// 결과 화면의 다음 행동만 담당합니다. 결과/보드 계산은 오셀로 기능에 남겨 둡니다.
export function RematchPanel({ room, session, connected, closed, leaving, onLobby }: RematchPanelProps) {
  const rematch = useRematch(room.code, session, room.gameNumber)
  const submitting = useRef(false)
  const ready = room.rematchReadyPlayerIds.includes(session.playerId)
  const opponent = room.players.find(player => player.playerId !== session.playerId)
  const opponentReady = !!opponent && room.rematchReadyPlayerIds.includes(opponent.playerId)
  const bothConnected = allPlayersConnected(room)
  const disabled = !connected || closed || leaving || rematch.isPending || (!ready && !bothConnected)

  // 두 번 빠르게 눌러도 한 요청만 보내고, 서버가 확인한 동의 목록을 화면에 표시합니다.
  async function changeReady() {
    if (submitting.current || disabled) return
    submitting.current = true
    try { await rematch.mutateAsync(!ready) }
    catch { /* 오류는 아래 alert에 표시합니다. */ }
    finally { submitting.current = false }
  }

  const message = closed ? room.closeReason === 'left' ? '상대가 로비로 돌아갔어요. 새 방에서 다시 만나요.' : closedRoomMessage(room.closeReason)
    : !connected ? '다시 연결되면 재대결을 요청할 수 있어요.'
    : !bothConnected ? '상대가 다시 연결되면 재대결을 시작할 수 있어요.'
    : ready ? '상대방의 응답을 기다리고 있어요.'
    : opponentReady ? `${opponent?.nickname}님이 재대결을 요청했어요.`
    : '한 판 더 할까요? 두 사람이 동의하면 시작해요.'

  return <div className={styles.panel}>
    <p className={styles.message} role="status">{message}</p>
    {!closed && <p className={styles.help}>재대결은 흑백을 바꿔 시작해요.</p>}
    {rematch.error && !closed && <p className={styles.error} role="alert">{rematch.error.message}</p>}
    <div className={styles.buttons}>
      {!closed && <button type="button" className={styles.primary} disabled={disabled} onClick={() => void changeReady()}>
        {rematch.isPending ? '처리 중…' : ready ? '요청 취소' : opponentReady ? '재대결 수락' : '재대결 요청'}
      </button>}
      <button type="button" className={styles.secondary} disabled={leaving || rematch.isPending} onClick={onLobby}>
        {leaving ? '돌아가는 중…' : '로비로 돌아가기'}
      </button>
    </div>
  </div>
}
