import styles from './RoomHeader.module.scss'

// 생성 화면과 방 화면의 공통 상단입니다. 방이 정해진 경우에만 공유용 코드를 표시합니다.
export function RoomHeader({ code }: { code?: string }) {
  return <header className={styles.header}>
    <h1 className={styles.brand}>NOLLJA <span>/ 놀자</span></h1>
    <div className={styles.room}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </svg>
      <span>{code ? '비공개 방' : '오셀로'}</span>
      {code && <><span className={styles.divider} /><span className={styles.roomCode}>방 코드 {code}</span></>}
    </div>
  </header>
}
