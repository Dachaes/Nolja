import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RoomEntry } from './components/RoomEntry'
import { navigate, usePathname } from './model/navigation'
import { saveSession } from './model/session'
import { RoomPage } from './RoomPage'
import type { Admission } from './types'
import styles from './RoomPage.module.scss'
import { HomePage } from '../home/HomePage'
import { roomApi } from './api/roomApi'
import { admissionSession, roomPath } from './model/gameType'

// 별도 라우팅 라이브러리 없이 홈(/)과 초대 주소(/room/:code)를 구분합니다.
export function RoomRouter() {
  const pathname = usePathname()
  // 브라우저가 sessionStorage를 차단해도 현재 화면에서는 입장을 이어가도록 메모리에도 보관합니다.
  const [created, setCreated] = useState<Admission | null>(null)
  // 서버가 생성하는 6자리 코드만 허용합니다. I/O/0/1처럼 헷갈리는 문자는 제외합니다.
  const match = /^\/games\/(othello|whack-a-mole)\/room\/([A-HJ-NP-Z2-9]{6})\/?$/i.exec(pathname)
  const legacy = /^\/room\/([A-HJ-NP-Z2-9]{6})\/?$/i.exec(pathname)

  // 이전 방 생성 응답을 비우고 닉네임 입력 화면으로 돌아갑니다.
  function home() {
    setCreated(null)
    navigate('/')
  }

  // 생성 성공 응답의 비밀 토큰은 저장소에 보관하고, URL에는 방 코드만 넣습니다.
  function admitted(admission: Admission) {
    saveSession(admission.room.code, admissionSession(admission))
    setCreated(admission)
    navigate(roomPath(admission.room.gameType, admission.room.code))
  }

  // RoomPage의 key가 달라지면 이전 방의 React 상태를 버리고 새 방 상태로 시작합니다.
  if (pathname === '/') return <HomePage />
  if (pathname === '/games/othello') return <RoomEntry key="othello" gameType="othello" onAdmitted={admitted} />
  if (pathname === '/games/whack-a-mole') return <RoomEntry key="whack-a-mole" gameType="whack-a-mole" onAdmitted={admitted} />
  if (match) {
    const gameType = match[1].toLowerCase() as 'othello' | 'whack-a-mole'
    const code = match[2].toUpperCase()
    return <RoomPage key={`${gameType}:${code}`} code={code} gameType={gameType}
      initialSession={created?.room.code === code && created.room.gameType === gameType ? admissionSession(created) : undefined} onHome={home} />
  }
  if (legacy) return <LegacyRoom code={legacy[1].toUpperCase()} onHome={home} />
  return <main className={styles.state}>
    <h2>올바른 초대 링크가 아니에요</h2>
    <p>친구에게 링크를 다시 받거나 새 방을 만들어 주세요.</p>
    <button type="button" onClick={home}>새 방 만들기</button>
  </main>
}

// 과거 초대 링크는 서버가 확인한 게임 종류의 주소로만 연결합니다.
function LegacyRoom({ code, onHome }: { code: string; onHome: () => void }) {
  const preview = useQuery({ queryKey: ['legacy-room-preview', code], queryFn: ({ signal }) => roomApi.legacyPreview(code, signal), retry: false })
  useEffect(() => {
    if (preview.data) navigate(roomPath(preview.data.gameType, code), true)
  }, [preview.data, code])
  return <main className={styles.state}>
    {preview.error ? <><h2>방을 확인할 수 없어요</h2><p role="alert">{preview.error.message}</p><button type="button" onClick={onHome}>로비로 돌아가기</button></>
      : <p role="status">초대받은 게임을 확인하는 중…</p>}
  </main>
}
