import type { DiscColor } from '../types'
import styles from './Disc.module.scss'

// 돌의 시각 표현만 담당합니다. small은 점수/참가자 패널용, lastMove는 마지막 수 표시용입니다.
// 색상과 좌표 설명은 부모가 제공하므로 돌 자체는 aria-hidden으로 중복 낭독을 피합니다.
export function Disc({
  color,
  small = false,
  lastMove = false,
}: {
  color: DiscColor
  small?: boolean
  lastMove?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.disc} ${styles[color]} ${small ? styles.small : ''}`}
    >
      {lastMove && <span className={styles.lastMove} />}
    </span>
  )
}
