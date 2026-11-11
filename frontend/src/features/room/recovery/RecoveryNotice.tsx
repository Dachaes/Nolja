import { useEffect, useState } from 'react'
import type { Room } from '../types'
import type { ConnectionStatus } from '../realtime/protocol'
import { closedRoomMessage, remainingSeconds } from './recoveryState'
import styles from './RecoveryNotice.module.scss'

// 카운트다운만 매초 갱신해 보드 전체를 다시 그리지 않습니다. 초가 0이어도 종료 결정은 서버가 합니다.
function RecoveryCountdown({ deadline, serverOffset }: { deadline: string; serverOffset: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = remainingSeconds(deadline, serverOffset, now)
  return <p className={styles.countdown} aria-live="off">
    {seconds > 0 ? `복귀 대기 ${Math.floor(seconds / 60)}분 ${seconds % 60}초` : '서버에서 복귀 기한을 확인하고 있어요.'}
  </p>
}

interface RecoveryNoticeProps {
  room: Room
  status: ConnectionStatus
  serverOffset: number
  onLobby: () => void
}

// 본인 연결, 상대 연결, 복구 기한 종료를 구분해 사용자가 현재 입력이 막힌 이유를 알 수 있게 합니다.
export function RecoveryNotice({ room, status, serverOffset, onLobby }: RecoveryNoticeProps) {
  if (room.status === 'closed') return <section className={styles.notice} aria-label="방 종료 안내">
    <p role="alert">{closedRoomMessage(room.closeReason)}</p>
    {room.game.status !== 'finished' && <>
      <p className={styles.help}>마지막 보드를 보관했어요. 이 게임의 승패는 기록하지 않습니다.</p>
      <button type="button" onClick={onLobby}>로비로 돌아가기</button>
    </>}
  </section>
  if (status !== 'connected') return <section className={styles.notice} aria-label="게임 복구 안내">
    <p>마지막으로 확인한 보드를 보여드리고 있어요.</p>
    <p className={styles.help}>연결을 확인한 뒤 같은 참가자와 차례로 이어갑니다.</p>
  </section>
  const missing = room.presence.filter(player => !player.connected)
  if (!missing.length) return null
  const names = missing.map(state => room.players.find(player => player.playerId === state.playerId)?.nickname).join(', ')
  const deadline = missing.map(player => player.reconnectDeadline).filter((value): value is string => !!value).sort()[0]
  return <section className={styles.notice} aria-label="상대 연결 안내">
    <p role="status">{names}님의 연결을 기다리고 있어요.</p>
    <p className={styles.help}>{room.status === 'finished' ? '다시 연결되면 재대결할 수 있어요.' : '게임을 잠시 멈췄어요. 돌아오면 같은 보드와 차례로 이어갑니다.'}</p>
    {deadline && <RecoveryCountdown deadline={deadline} serverOffset={serverOffset} />}
  </section>
}
