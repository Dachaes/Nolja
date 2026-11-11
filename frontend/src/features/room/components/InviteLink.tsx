import { useState } from 'react'
import styles from './InviteLink.module.scss'
import type { GameType } from '../types'
import { roomPath } from '../model/gameType'

// 현재 접속한 서버 주소와 방 코드를 조합해 공유용 링크를 만듭니다.
export function InviteLink({ code, gameType }: { code: string; gameType: GameType }) {
  // origin에는 프로토콜·호스트·포트가 포함됩니다. 참가 토큰은 링크에 넣지 않습니다.
  const link = new URL(roomPath(gameType, code), window.location.origin).href
  const [feedback, setFeedback] = useState('')
  const [showLink, setShowLink] = useState(false)

  // 자동 복사는 HTTPS/권한 등에 영향을 받습니다. 실패해도 직접 선택할 수 있는 링크를 제공합니다.
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setFeedback('초대 링크를 복사했어요.')
    } catch {
      setShowLink(true)
      setFeedback('아래 링크를 길게 누르거나 선택해서 복사해 주세요.')
    }
  }

  return (
    <div className={styles.invite}>
      <button className={styles.copy} type="button" onClick={copy}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" />
        </svg>
        초대 링크 복사
      </button>
      <p className={styles.feedback} role="status">{feedback || '친구에게 링크를 보내 함께 시작하세요.'}</p>
      {/* 수동 복사용 필드는 포커스를 받으면 링크 전체를 선택합니다. */}
      {showLink && <input className={styles.link} aria-label="초대 링크" readOnly value={link} onFocus={event => event.currentTarget.select()} />}
    </div>
  )
}
