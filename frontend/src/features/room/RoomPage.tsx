import { useRef, useState } from 'react'
import { RoomHeader } from './components/RoomHeader'
import { OthelloGame } from '../othello/OthelloGame'
import type { Position } from '../othello/types'
import { isTerminalError } from './api/roomApi'
import { RoomEntry } from './components/RoomEntry'
import { WaitingRoom } from './components/WaitingRoom'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useRoom } from './hooks/useRoom'
import { readSession, saveSession } from './model/session'
import { useReturnToLobby } from './lobby/useReturnToLobby'
import { RematchPanel } from './rematch/RematchPanel'
import { RecoveryNotice } from './recovery/RecoveryNotice'
import { allPlayersConnected } from './recovery/recoveryState'
import type { Admission, RoomSession } from './types'
import styles from './RoomPage.module.scss'

// 방 코드와 기존 참가 정보를 받아, 입장 전/후 화면을 결정하는 페이지의 입력값입니다.
interface RoomPageProps {
  code: string
  initialSession?: RoomSession
  onHome: () => void
}

// 참가 정보가 없으면 닉네임 폼, 있으면 인증이 필요한 방 화면을 보여줍니다.
export function RoomPage({ code, initialSession, onHome }: RoomPageProps) {
  // 초기화 함수로 읽으므로 매 렌더마다 저장소에 접근하지 않습니다.
  const [session, setSession] = useState<RoomSession | null>(() => initialSession ?? readSession(code))

  // 링크 입장 성공 후 조회/착수 요청에 사용할 참가 ID와 토큰을 보관합니다.
  function admitted(admission: Admission) {
    const next = { playerId: admission.playerId, token: admission.token }
    saveSession(code, next)
    setSession(next)
  }

  if (!session) return <RoomEntry code={code} onAdmitted={admitted} />
  return <ConnectedRoom code={code} session={session} onHome={onHome} />
}

// 서버의 실시간 상태와 화면 전환을 조합하는 인증된 참가자용 화면입니다.
// 분리된 컴포넌트이므로 참가 여부에 따라 훅을 조건부로 호출하지 않아도 됩니다.
function ConnectedRoom({ code, session, onHome }: { code: string; session: RoomSession; onHome: () => void }) {
  const { query, move, connection, room } = useRoom(code, session)
  // state가 다음 렌더에 반영되기 전 연속 클릭까지 막기 위한 즉시 변경 가능한 잠금입니다.
  const acting = useRef(false)
  const lobby = useReturnToLobby(code, session, room, onHome)
  // 닉네임이 아닌 서버 발급 playerId로 자신의 참가 정보를 찾습니다.
  const me = room?.players.find(player => player.playerId === session.playerId)
  const roomError = connection.error ?? query.error
  const terminal = isTerminalError(roomError) || (connection.status === 'closed' && !!roomError)
  const bothConnected = !!room && allPlayersConnected(room)
  // 화면에서도 입력을 제한하지만 최종 권한과 차례 검사는 서버가 다시 수행합니다.
  // 연결 오류나 다른 요청 처리 중에는 오래된 보드에 착수하지 못하게 합니다.
  const canPlay = !!room && room.status === 'playing' && room.game.currentTurn === me?.color
    && connection.status === 'connected' && bothConnected && !terminal && !move.isPending && !lobby.pending
  const activityLabel = room?.status === 'closed' ? '게임 종료'
    : connection.status !== 'connected' ? '연결 복구 중' : !bothConnected ? '게임 일시정지' : undefined
  // 이미 더 최신 상태로 복구했다면 이전 보드에서 발생한 착수 오류를 계속 표시하지 않습니다.
  const moveError = move.error && room?.revision === move.variables?.revision ? move.error : null

  // 현재 보고 있는 방 버전을 함께 보내 중복 요청이나 오래된 화면의 착수를 막습니다.
  async function placeDisc(position: Position) {
    if (!canPlay || !room || acting.current) return
    acting.current = true
    try { await move.mutateAsync({ position, revision: room.revision }) }
    catch { /* 오류는 아래 안내에 표시하고, 실패한 요청은 일회성 조회로 상태를 확인합니다. */ }
    finally { acting.current = false }
  }

  return (
    <div className={styles.page}>
      <RoomHeader code={code} />
      {/* 참가 권한 상실/방 종료와 일시적인 통신 오류를 구분하여 안내합니다. */}
      {terminal ? <main className={styles.state}>
        <h2>이 방에 참여할 수 없어요</h2>
        <p role="alert">{roomError?.message}</p>
        <button type="button" onClick={lobby.goToLobby}>로비로 돌아가기</button>
      </main> : <>
        <ConnectionStatus status={connection.status} onRetry={connection.retry} />
        {room && <RecoveryNotice room={room} status={connection.status} serverOffset={connection.serverOffset} onLobby={lobby.goToLobby} />}
        {(moveError || lobby.error) && <p className={styles.notice} role="alert">{(lobby.error ?? moveError)?.message}</p>}
        {!room && !query.isError && <main className={styles.state} role="status">방에 연결하는 중…</main>}
        {/* 상대가 입장해 서버 상태가 playing으로 바뀌면 대기실에서 보드로 전환됩니다. */}
        {room && me && (room.status === 'waiting'
          ? <WaitingRoom code={code} host={me} onLeave={() => void lobby.returnToLobby()} leaving={lobby.pending} />
          : <OthelloGame game={room.game} players={room.players} me={me} canPlay={canPlay} gameNumber={room.gameNumber}
              roomClosed={room.status === 'closed'} activityLabel={activityLabel}
              onPlay={position => void placeDisc(position)} onLeave={() => void lobby.returnToLobby()} leaving={lobby.pending}
              finishedActions={<RematchPanel key={room.gameNumber} room={room} session={session} connected={connection.status === 'connected'}
                closed={room.status === 'closed'} leaving={lobby.pending} onLobby={() => void lobby.returnToLobby()} />} />)}
      </>}
    </div>
  )
}
