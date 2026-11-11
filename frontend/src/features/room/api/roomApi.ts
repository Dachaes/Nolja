import type { Position } from '../../othello/types'
import { backendOrigin } from '../../../config/backend'
import type { Admission, GameType, Room, RoomPreview, RoomSession } from '../types'

// 서버의 오류 코드와 HTTP 상태를 함께 보관해 화면이 오류 종류별로 대응하게 합니다.
// status=0은 HTTP 응답 자체를 받지 못한 네트워크 오류를 뜻합니다.
export class RoomApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status = 0) {
    super(message)
    this.name = 'RoomApiError'
    this.code = code
    this.status = status
  }
}

// 인증 실패(401), 없는 방(404), 종료/만료된 방(410)은 단순 재조회로 복구되지 않습니다.
export const isTerminalError = (error: unknown) =>
  error instanceof RoomApiError && [401, 404, 410].includes(error.status)

// 모든 방 API의 공통 통신 처리입니다. T는 호출자가 기대하는 응답 타입이며,
// TypeScript 타입 지정 자체가 서버 JSON을 런타임에 검증해 주는 것은 아닙니다.
async function request<T>(path: string, options: RequestInit = {}, session?: RoomSession): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${backendOrigin}/api/rooms${path}`, {
      ...options,
      // 최신 보드를 받고, 외부 취소 신호 또는 8초 제한 중 먼저 오는 것을 적용합니다.
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
      // 공개 조회에는 토큰이 필요 없고, 참가 후 요청에만 Authorization을 붙입니다.
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
    })
  } catch (error) {
    // React Query가 의도적으로 취소한 요청은 네트워크 장애로 바꾸지 않습니다.
    if (options.signal?.aborted) throw error
    throw new RoomApiError('서버에 연결할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.', 'NETWORK_ERROR')
  }
  // fetch는 400/500 응답만으로 예외를 던지지 않으므로 직접 성공 여부를 검사합니다.
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new RoomApiError(body?.message ?? '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', body?.code ?? 'SERVER_ERROR', response.status)
  }
  // 퇴장 성공은 본문 없는 204 응답입니다. JSON 파싱을 시도하면 오히려 오류가 납니다.
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

// URL과 요청 데이터 구성을 모아 둡니다. 화면은 fetch의 세부 사항을 몰라도 됩니다.
// create/join은 참가 토큰 발급, preview는 공개 조회, 나머지는 참가자 전용입니다.
export const roomApi = {
  create: (nickname: string, gameType: GameType = 'othello') => request<Admission>('', { method: 'POST', body: JSON.stringify({ nickname, gameType }) }),
  hit: (code: string, session: RoomSession, hole: number, moleId: number | null, gameNumber: number) =>
    request<Room>(`/${code}/hits`, { method: 'POST', body: JSON.stringify({ hole, moleId, gameNumber }) }, session),
  preview: (code: string, signal?: AbortSignal) => request<RoomPreview>(`/${encodeURIComponent(code)}`, { signal }),
  join: (code: string, nickname: string) => request<Admission>(`/${encodeURIComponent(code)}/players`, { method: 'POST', body: JSON.stringify({ nickname }) }),
  state: (code: string, session: RoomSession, signal?: AbortSignal) => request<Room>(`/${code}/state`, { signal }, session),
  move: (code: string, session: RoomSession, position: Position, revision: number) =>
    request<Room>(`/${code}/moves`, { method: 'POST', body: JSON.stringify({ ...position, revision }) }, session),
  leave: (code: string, session: RoomSession) => request<void>(`/${code}/players/me`, { method: 'DELETE' }, session),
  rematch: (code: string, session: RoomSession, gameNumber: number, ready: boolean) =>
    request<Room>(`/${code}/rematch`, { method: 'PUT', body: JSON.stringify({ gameNumber, ready }) }, session),
}
