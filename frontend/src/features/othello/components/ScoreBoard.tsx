import { COLOR_LABEL } from '../rules'
import type { DiscColor } from '../types'
import { Disc } from './Disc'
import styles from './ScoreBoard.module.scss'

// 점수는 항상 흑-백 순서로, 차례 문구는 접속한 참가자 관점으로 표시합니다.
// 같은 서버 상태를 받아도 흑 화면의 '내 차례'가 백 화면에서는 '상대 차례'가 됩니다.
export function ScoreBoard({ score, currentTurn, myColor, activityLabel }: { score: Record<DiscColor, number>; currentTurn: DiscColor | null; myColor: DiscColor; activityLabel?: string }) {
  return <div className={styles.scoreboard}>
    <div className={styles.score} aria-label={`흑 ${score.black} 대 백 ${score.white}`}>
      <Disc color="black" small /><span>{score.black}</span><span className={styles.dash}>–</span><span>{score.white}</span><Disc color="white" small />
    </div>
    <span className={styles.divider} />
    <span className={styles.turn} aria-label={activityLabel ?? (currentTurn ? `${COLOR_LABEL[currentTurn]} 차례` : '대국 종료')}>
      {activityLabel ?? (currentTurn ? currentTurn === myColor ? '내 차례' : '상대 차례' : '대국 종료')}
    </span>
  </div>
}
