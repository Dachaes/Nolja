import { RoomHeader } from '../room/components/RoomHeader'
import { ResumeRoom } from '../room/recovery/ResumeRoom'
import { GameCards } from './components/GameCards'
import styles from './HomePage.module.scss'

// 계정 조회 없이 게임을 선택합니다. 같은 탭에 남은 참가 정보로 방에 복귀할 수 있습니다.
export function HomePage() {
  return (
    <div>
      <RoomHeader label="게임 둘러보기" />
      <main className={styles.home}>
        <p className={styles.eyebrow}>도란도란, 소중한 사람과 함께</p>
        <h1>오늘은 무엇을 할까요?</h1>
        <div className={styles.recovery}>
          <ResumeRoom gameType="othello" />
          <ResumeRoom gameType="whack-a-mole" />
        </div>
        <GameCards />
      </main>
    </div>
  )
}
