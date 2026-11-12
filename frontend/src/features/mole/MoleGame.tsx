import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Room, RoomSession } from '../room/types'
import { roomApi } from '../room/api/roomApi'
import { receiveRoom } from '../room/model/roomCache'
import { RematchPanel } from '../room/rematch/RematchPanel'
import { MoleHole } from './MoleHole'
import { moleClock } from './model'
import type { MoleScore } from './types'
import styles from './MoleGame.module.scss'

interface MoleGameProps {
  room: Room
  session: RoomSession
  connected: boolean
  bothConnected: boolean
  serverOffset: number
  leaving: boolean
  onLeave: () => void
}

// 두 참가자의 점수 카드는 같은 구조를 사용하고 본인 여부에 따라 색상만 바꿉니다.
function ScoreCard({ name, score, mine }: { name: string; score: MoleScore; mine: boolean }) {
  return (
    <section
      className={`${styles.scoreCard} ${mine ? styles.mine : styles.theirs}`}
      aria-label={`${name} 점수`}
    >
      <span className={styles.playerName}>
        <i />
        {name}
        {mine && ' (나)'}
      </span>
      <strong key={score.score} className={styles.score}>
        {score.score.toLocaleString()}
        <small>점</small>
      </strong>
      <span className={styles.combo}>
        {score.combo >= 3 ? `${score.combo} COMBO!` : `연속 ${score.combo}회`}
      </span>
    </section>
  )
}

// 점수와 두더지는 서버 상태를 그대로 표시하고, 화면용 시계와 클릭 효과만 로컬에서 관리합니다.
export function MoleGame({
  room,
  session,
  connected,
  bothConnected,
  serverOffset,
  leaving,
  onLeave,
}: MoleGameProps) {
  const game = room.mole!
  const client = useQueryClient()
  // 같은 두더지에 대한 중복 클릭만 막습니다. 다른 구멍은 응답을 기다리지 않고 누를 수 있습니다.
  const pending = useRef(new Set<string>())
  const [now, setNow] = useState(Date.now)
  const [miss, setMiss] = useState<{ hole: number; at: number } | null>(null)
  const hit = useMutation({
    mutationFn: ({ hole, moleId }: { hole: number; moleId: number | null }) =>
      roomApi.hit(room.code, session, hole, moleId, room.gameNumber),
    onSuccess: updated => {
      receiveRoom(client, session, updated)
    },
    retry: false,
  })

  // 화면의 남은 시간과 효과만 갱신합니다. 서버에 주기적으로 조회하는 타이머가 아닙니다.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 80)
    return () => clearInterval(timer)
  }, [])

  // 기기마다 시계가 달라도 서버와 같은 기준으로 카운트다운을 표시합니다.
  const serverNow = now + serverOffset
  const { countdown, remaining, active } = moleClock(game, serverNow)
  const closed = room.status === 'closed'
  const finished = game.finished
  const canPlay = active && connected && bothConnected && !closed && !leaving
  const me = game.scores.find(score => score.playerId === session.playerId)!
  const opponent = game.scores.find(score => score.playerId !== session.playerId)!
  const nickname = (id: string) =>
    room.players.find(player => player.playerId === id)?.nickname ?? '친구'
  let result = `${nickname(opponent.playerId)}님이 이겼어요!`
  if (me.score === opponent.score) {
    result = '무승부예요!'
  } else if (me.score > opponent.score) {
    result = '내가 이겼어요!'
  }

  // 여러 상태가 겹칠 때는 결과 → 종료 → 연결 대기 → 준비 순으로 안내합니다.
  let message = '먼저 잡으면 내 점수!'
  if (finished) {
    message = '30초 대결이 끝났어요'
  } else if (closed) {
    message = '대결이 종료됐어요'
  } else if (!connected || !bothConnected || game.pausedAt) {
    message = '연결을 기다리며 잠시 쉬어요'
  } else if (countdown > 0) {
    message = '준비됐나요? 곧 시작해요!'
  } else if (remaining <= 0) {
    message = '점수를 확인하고 있어요'
  }

  async function whack(hole: number, clickedAt: number) {
    if (!canPlay) {
      return
    }
    const target = game.holes[hole]
    if (target?.claimedBy) {
      return
    }
    const key = `${room.gameNumber}:${hole}:${target?.id ?? 'empty'}`
    if (pending.current.has(key)) {
      return
    }
    pending.current.add(key)
    if (!target) {
      setMiss({ hole, at: clickedAt })
    }
    try {
      await hit.mutateAsync({ hole, moleId: target?.id ?? null })
    } catch {
      /* 오류는 화면에 표시합니다. 점수는 임의로 바꾸지 않고 서버의 최신 상태를 유지합니다. */
    } finally {
      pending.current.delete(key)
    }
  }

  return (
    <main className={styles.game}>
      <div className={styles.heading}>
        <div>
          <p>둘이서, 30초 승부</p>
          <h1>두더지잡기</h1>
        </div>
        <span>{room.gameNumber}번째 대결</span>
      </div>
      <div className={styles.scores}>
        <ScoreCard name={nickname(me.playerId)} score={me} mine />
        <span className={styles.versus} aria-hidden="true">
          VS
        </span>
        <ScoreCard name={nickname(opponent.playerId)} score={opponent} mine={false} />
      </div>
      <div className={`${styles.timer} ${remaining <= 5 && active ? styles.urgent : ''}`}>
        <div>
          <span>남은 시간</span>
          <strong role="timer" aria-label="남은 시간">
            {Math.ceil(remaining)}
            <small>초</small>
          </strong>
        </div>
        <progress value={remaining} max={30} aria-label="남은 시간 비율" />
      </div>
      <p className={styles.message} role="status">
        {message}
      </p>
      {hit.error && !closed && (
        <p className={styles.error} role="alert">
          {hit.error.message}
        </p>
      )}
      <div className={styles.field}>
        <div className={styles.board} role="group" aria-label="4×4 두더지 구멍">
          {game.holes.map((target, hole) => (
            <MoleHole
              key={hole}
              hole={hole}
              target={target}
              playerId={session.playerId}
              now={serverNow}
              paused={!!game.pausedAt}
              finished={finished}
              canPlay={canPlay}
              missed={miss?.hole === hole && now - miss.at < 250}
              nickname={nickname}
              onWhack={(index, clickedAt) => void whack(index, clickedAt)}
            />
          ))}
        </div>
        {countdown > 0 && !closed && !finished && (
          <div className={styles.overlay}>
            <p>{bothConnected && connected ? '준비!' : '친구와 연결 중'}</p>
            <strong key={countdown}>{bothConnected && connected ? countdown : '…'}</strong>
            <span>같은 두더지를 먼저 잡아보세요</span>
          </div>
        )}
      </div>
      {finished && (
        <section className={styles.result} aria-label="게임 결과">
          <p>수고했어요, 두더지 사냥꾼!</p>
          <h2>{result}</h2>
          <div className={styles.stats}>
            <span>
              잡은 두더지 <strong>{me.hits}마리</strong>
            </span>
            <span>
              최고 콤보 <strong>{me.bestCombo}회</strong>
            </span>
          </div>
          <RematchPanel
            room={room}
            session={session}
            connected={connected}
            closed={closed}
            leaving={leaving}
            onLobby={onLeave}
          />
        </section>
      )}
      <details className={styles.rules}>
        <summary>어떻게 하나요?</summary>
        <p>두더지를 누르면 100점! 같은 두더지는 먼저 잡은 한 사람만 점수를 받아요.</p>
        <p>연속 3회마다 보너스가 25점씩 늘어나요. 한 마리당 최대 200점까지 받을 수 있어요.</p>
        <p>
          빈 구멍을 누르면 콤보가 끊겨요. 친구가 먼저 잡았거나 이미 숨은 두더지를 늦게 눌러도 손해는
          없어요.
        </p>
        <p>
          뒤로 갈수록 두더지가 빨라져요. 연결이 끊기면 시간을 멈추고, 두 사람이 돌아오면 이어서
          해요.
        </p>
      </details>
      {!finished && (
        <button type="button" className={styles.leave} disabled={leaving} onClick={onLeave}>
          {leaving ? '나가는 중…' : '방 나가기'}
        </button>
      )}
    </main>
  )
}
