import { useState } from 'react'
import { readActiveRoom } from '../model/session'
import { navigate } from '../model/navigation'
import styles from './ResumeRoom.module.scss'

// 같은 탭에서 실수로 로비로 이동했을 때도 기존 참가 토큰으로 복귀할 수 있는 진입점입니다.
export function ResumeRoom() {
  const [code] = useState(readActiveRoom)
  if (!code) return null
  return <section className={styles.resume} aria-label="이전 방 복귀">
    <p>참가 중이던 방이 있어요. <strong>{code}</strong></p>
    <button type="button" onClick={() => navigate(`/room/${code}`)}>이전 방으로 돌아가기</button>
  </section>
}
