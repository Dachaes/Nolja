import { useState } from 'react'
import { RoomEntry } from './components/RoomEntry'
import { navigate, usePathname } from './model/navigation'
import { saveSession } from './model/session'
import { RoomPage } from './RoomPage'
import type { Admission } from './types'
import styles from './RoomPage.module.scss'
import { HomePage } from '../home/HomePage'

// 별도 라우팅 라이브러리 없이 홈(/)과 초대 주소(/room/:code)를 구분합니다.
export function RoomRouter() {
  const pathname = usePathname()
  // 브라우저가 sessionStorage를 차단해도 현재 화면에서는 입장을 이어가도록 메모리에도 보관합니다.
  const [created, setCreated] = useState<Admission | null>(null)
  // 서버가 생성하는 6자리 코드만 허용합니다. I/O/0/1처럼 헷갈리는 문자는 제외합니다.
  const match = /^\/room\/([A-HJ-NP-Z2-9]{6})\/?$/i.exec(pathname)

  // 이전 방 생성 응답을 비우고 닉네임 입력 화면으로 돌아갑니다.
  function home() {
    setCreated(null)
    navigate('/')
  }

  // 생성 성공 응답의 비밀 토큰은 저장소에 보관하고, URL에는 방 코드만 넣습니다.
  function admitted(admission: Admission) {
    saveSession(admission.room.code, { playerId: admission.playerId, token: admission.token })
    setCreated(admission)
    navigate(`/room/${admission.room.code}`)
  }

  // RoomPage의 key가 달라지면 이전 방의 React 상태를 버리고 새 방 상태로 시작합니다.
  if (pathname === '/') return <HomePage />
  if (pathname === '/games/othello') return <RoomEntry onAdmitted={admitted} />
  if (match) {
    const code = match[1].toUpperCase()
    return <RoomPage key={code} code={code} initialSession={created?.room.code === code ? created : undefined} onHome={home} />
  }
  return <main className={styles.state}>
    <h2>올바른 초대 링크가 아니에요</h2>
    <p>친구에게 링크를 다시 받거나 새 방을 만들어 주세요.</p>
    <button type="button" onClick={home}>새 방 만들기</button>
  </main>
}
