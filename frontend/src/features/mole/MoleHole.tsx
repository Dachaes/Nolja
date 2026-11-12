import type { MoleTarget } from './types'
import { MoleIcon } from './MoleIcon'
import styles from './MoleGame.module.scss'

interface MoleHoleProps {
  hole: number
  target: MoleTarget | null
  playerId: string
  now: number
  paused: boolean
  finished: boolean
  canPlay: boolean
  missed: boolean
  nickname: (playerId: string) => string
  onWhack: (hole: number, clickedAt: number) => void
}

// 구멍 하나의 표시와 입력만 담당합니다. 득점 여부는 서버 응답으로 결정합니다.
export function MoleHole({
  hole,
  target,
  playerId,
  now,
  paused,
  finished,
  canPlay,
  missed,
  nickname,
  onWhack,
}: MoleHoleProps) {
  const claimedBy = target?.claimedBy
  const mine = claimedBy === playerId
  const expired = target !== null && Date.parse(target.expiresAt) <= now && !paused
  const show = target !== null && !claimedBy && !expired && !finished
  let caughtClass = ''
  if (claimedBy) {
    caughtClass = mine ? styles.caughtMine : styles.caughtTheirs
  }

  let label = '빈 구멍'
  if (claimedBy) {
    label = `${nickname(claimedBy)}님이 잡음`
  } else if (show) {
    label = '두더지 등장'
  }

  return (
    <button
      type="button"
      className={`${styles.hole} ${caughtClass} ${missed ? styles.missed : ''}`}
      aria-label={`${hole + 1}번 구멍, ${label}`}
      disabled={!canPlay || !!claimedBy}
      data-mole-id={show ? target.id : undefined}
      onPointerDown={event => {
        // 마우스 왼쪽 버튼과 터치는 누르는 순간 처리해 반응 지연을 줄입니다.
        if (event.button === 0) {
          event.preventDefault()
          onWhack(hole, Date.now())
        }
      }}
      onClick={event => {
        // 키보드로 누른 클릭만 처리해 pointerdown과 중복 요청이 발생하지 않게 합니다.
        if (event.detail === 0) {
          onWhack(hole, Date.now())
        }
      }}
    >
      <span className={styles.burrow} aria-hidden="true" />
      <span className={styles.spriteWindow} aria-hidden="true">
        {show && (
          <span key={target.id} className={styles.sprite}>
            <MoleIcon />
          </span>
        )}
      </span>
      {claimedBy && target && (
        <span key={target.id} className={styles.catch} aria-hidden="true">
          <strong>{mine ? `+${target.points}` : '친구가 쏙!'}</strong>
          <small>{nickname(claimedBy)}</small>
        </span>
      )}
      {missed && (
        <span className={styles.missLabel} aria-hidden="true">
          앗!
        </span>
      )}
    </button>
  )
}
