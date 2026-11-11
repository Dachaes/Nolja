import { Disc } from '../../othello/components/Disc'
import type { Player } from '../../othello/types'
import { InviteLink } from './InviteLink'
import styles from './WaitingRoom.module.scss'
import type { GameType } from '../types'

// 방장만 입장한 상태를 보여줍니다. 상대 입장 감지와 보드 전환은 상위 RoomPage가 담당합니다.
export function WaitingRoom({ code, host, onLeave, leaving, gameType }: {
  code: string; host: Player; onLeave: () => void; leaving: boolean; gameType: GameType
}) {
  return (
    <main className={styles.waiting}>
      <p className={styles.eyebrow}>방이 만들어졌어요</p>
      <h2>친구를 기다리는 중</h2>
      <p className={styles.description}>초대 링크로 친구가 입장하면<br />{gameType === 'whack-a-mole' ? '3초 카운트다운 뒤 두더지잡기가 시작돼요.' : '오셀로가 시작돼요.'}</p>
      {/* 실제 참가자와 비어 있는 백돌 자리를 구분합니다. 대기 문구는 가상의 참가자 데이터가 아닙니다. */}
      <div className={styles.players}>
        <div className={styles.player}>{gameType === 'othello' && <Disc color="black" small />}<span>{host.nickname}</span><small>나 · 방장</small></div>
        <div className={`${styles.player} ${styles.empty}`}>{gameType === 'othello' && <Disc color="white" small />}<span>친구 입장 대기 중</span></div>
      </div>
      <InviteLink code={code} gameType={gameType} />
      <button type="button" className={styles.leave} disabled={leaving} onClick={onLeave}>{leaving ? '나가는 중…' : '방 나가기'}</button>
    </main>
  )
}
