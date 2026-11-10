import { useQuery } from '@tanstack/react-query'
import { RoomHeader } from './RoomHeader'
import { Disc } from '../../othello/components/Disc'
import { isTerminalError, roomApi } from '../api/roomApi'
import { navigate } from '../model/navigation'
import type { Admission } from '../types'
import { NicknameForm } from './NicknameForm'
import styles from './RoomEntry.module.scss'
import { ResumeRoom } from '../recovery/ResumeRoom'

// code가 없으면 방 생성, 있으면 초대받은 방 입장 화면으로 동작합니다.
export function RoomEntry({ code, onAdmitted }: { code?: string; onAdmitted: (admission: Admission) => void }) {
  // 아직 토큰이 없으므로 공개 정보만 조회합니다. 대기 중 다른 사람이 먼저 입장할 수도 있어
  // 3초마다 갱신하며, code가 없는 생성 화면에서는 enabled=false로 조회를 생략합니다.
  const preview = useQuery({
    queryKey: ['room-preview', code],
    queryFn: ({ signal }) => roomApi.preview(code!, signal),
    enabled: !!code,
    retry: false,
    refetchInterval: query => isTerminalError(query.state.error) ? false : 3000,
  })
  // 조회가 끝나기 전이나 오류/정원 초과 상태에서는 입장 폼을 보여주지 않습니다.
  const full = preview.data && preview.data.status !== 'waiting'
  const ready = !code || (preview.data && !preview.isError && !full)

  // API의 성공 응답은 부모에게 넘깁니다. 예외는 NicknameForm이 받아 입력 오류로 표시합니다.
  async function enter(nickname: string) {
    onAdmitted(code ? await roomApi.join(code, nickname) : await roomApi.create(nickname))
  }

  return (
    <div className={styles.page}>
      <RoomHeader code={code} />
      <main className={styles.card}>
        <div className={styles.discs} aria-hidden="true"><Disc color="black" /><Disc color="white" /></div>
        <p className={styles.eyebrow}>{code ? '둘이서, 오셀로' : '오셀로 로비'}</p>
        <h2>{code ? '친구가 기다리고 있어요' : '우리, 한 판 놀까요?'}</h2>
        <p className={styles.description}>
          {code ? `${preview.data?.hostNickname ?? '친구'}님의 방에 입장해요.` : '닉네임을 정하고 친구를 초대해 보세요.'}
        </p>
        {code && <p className={styles.code}>방 코드 <strong>{code}</strong> · 나는 백돌</p>}
        {!code && <p className={styles.code}>방을 만든 사람은 흑돌 · 흑이 먼저 둡니다</p>}
        {/* 로딩, 통신 오류, 정원 초과를 구분해 사용자가 다음 행동을 판단할 수 있게 합니다. */}
        {code && preview.isPending && <p className={styles.message} role="status">방을 확인하는 중…</p>}
        {preview.isError && <div className={styles.message} role="alert">
          <p>{preview.error.message}</p>
          {!isTerminalError(preview.error) && <button type="button" onClick={() => void preview.refetch()}>다시 확인</button>}
        </div>}
        {full && !preview.isError && <p className={styles.message} role="alert">이미 두 사람이 참여한 방입니다.</p>}
        {!code && <ResumeRoom />}
        {ready && <NicknameForm submitLabel={code ? '방 입장하기' : '방 만들기'} onSubmit={enter} />}
        {code && <button type="button" className={styles.back} onClick={() => navigate('/')}>새 방 만들러 가기</button>}
        <p className={styles.footer}>로그인 없이, 각자의 기기에서 함께해요.</p>
      </main>
    </div>
  )
}
