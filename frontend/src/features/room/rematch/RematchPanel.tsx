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

// 두 게임의 결과 화면에서 공통으로 사용하는 재대결/로비 이동 버튼입니다.
export function RematchPanel({
  room,
  session,
  connected,
  closed,
  leaving,
  onLobby,
}: RematchPanelProps) {
  const rematch = useRematch(room.code, session, room.gameNumber)
  const submitting = useRef(false)
  const ready = room.rematchReadyPlayerIds.includes(session.playerId)
  const opponent = room.players.find(player => player.playerId !== session.playerId)
  const opponentReady = !!opponent && room.rematchReadyPlayerIds.includes(opponent.playerId)
  const bothConnected = allPlayersConnected(room)
  const disabled =
    !connected || closed || leaving || rematch.isPending || (!ready && !bothConnected)

  // 두 번 빠르게 눌러도 한 요청만 보내고, 서버가 확인한 동의 목록을 화면에 표시합니다.
  async function changeReady() {
    if (submitting.current || disabled) {
      return
    }
    submitting.current = true
    try {
      await rematch.mutateAsync(!ready)
    } catch {
      /* 오류는 아래 alert에 표시합니다. */
    } finally {
      submitting.current = false
    }
  }

  // 방 종료와 연결 문제를 먼저 안내하고, 정상 연결일 때만 재대결 동의 상태를 표시합니다.
  let message = '한 판 더 할까요? 두 사람이 동의하면 시작해요.'
  if (closed) {
    message =
      room.closeReason === 'left'
        ? '상대가 로비로 돌아갔어요. 새 방에서 다시 만나요.'
        : closedRoomMessage(room.closeReason)
  } else if (!connected) {
    message = '다시 연결되면 재대결을 요청할 수 있어요.'
  } else if (!bothConnected) {
    message = '상대가 다시 연결되면 재대결을 시작할 수 있어요.'
  } else if (ready) {
    message = '상대방의 응답을 기다리고 있어요.'
  } else if (opponentReady) {
    message = `${opponent?.nickname}님이 재대결을 요청했어요.`
  }

  let readyLabel = '재대결 요청'
  if (rematch.isPending) {
    readyLabel = '처리 중…'
  } else if (ready) {
    readyLabel = '요청 취소'
  } else if (opponentReady) {
    readyLabel = '재대결 수락'
  }

  return (
    <div className={styles.panel}>
      <p className={styles.message} role="status">
        {message}
      </p>
      {!closed && (
        <p className={styles.help}>
          {room.gameType === 'whack-a-mole'
            ? '점수와 콤보를 초기화하고 30초 동안 다시 겨뤄요.'
            : '재대결은 흑백을 바꿔 시작해요.'}
        </p>
      )}
      {rematch.error && !closed && (
        <p className={styles.error} role="alert">
          {rematch.error.message}
        </p>
      )}
      <div className={styles.buttons}>
        {!closed && (
          <button
            type="button"
            className={styles.primary}
            disabled={disabled}
            onClick={() => void changeReady()}
          >
            {readyLabel}
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          disabled={leaving || rematch.isPending}
          onClick={onLobby}
        >
          {leaving ? '돌아가는 중…' : '로비로 돌아가기'}
        </button>
      </div>
    </div>
  )
}
