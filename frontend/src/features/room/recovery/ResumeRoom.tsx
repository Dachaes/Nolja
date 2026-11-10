import { useState } from 'react'
import { dismissRoomRecovery, readActiveRoom } from '../model/session'
import { navigate } from '../model/navigation'
import styles from './ResumeRoom.module.scss'

// 같은 탭에서 실수로 로비로 이동했을 때도 기존 참가 토큰으로 복귀할 수 있는 진입점입니다.
export function ResumeRoom() {
  const [code, setCode] = useState(readActiveRoom)
  // 저장된 복귀 안내와 화면 상태를 함께 정리합니다.
  function dismiss() {
    if (!code) return
    dismissRoomRecovery(code)
    setCode(null)
  }

  if (!code) return null
  return <section className={styles.resume} aria-label="이전 방 복귀">
    <button type="button" className={styles.close} aria-label="이전 방 복귀 안내 닫기" onClick={dismiss}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>
    <p>참가 중이던 방이 있어요. <strong>{code}</strong></p>
    <button type="button" className={styles.returnButton} onClick={() => navigate(`/room/${code}`)}>이전 방으로 돌아가기</button>
  </section>
}
