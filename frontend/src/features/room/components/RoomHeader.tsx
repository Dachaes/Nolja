import styles from './RoomHeader.module.scss'
import { navigate } from '../model/navigation'
import type { MouseEvent } from 'react'

// 생성 화면과 방 화면의 공통 상단입니다. 방이 정해진 경우에만 공유용 코드를 표시합니다.
export function RoomHeader({ code, label }: { code?: string; label?: string }) {
  // 일반 클릭은 앱 내에서 이동하고, 새 탭 열기 등의 브라우저 기본 동작은 유지합니다.
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate('/')
  }

  return <header className={styles.header}>
    <h1 className={styles.brand}><a href="/" onClick={goHome}>Doran <span>/ 도란</span></a></h1>
    <div className={styles.room}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </svg>
      <span>{code ? '비공개 방' : label ?? '오셀로'}</span>
      {code && <><span className={styles.divider} /><span className={styles.roomCode}>방 코드 {code}</span></>}
    </div>
  </header>
}
