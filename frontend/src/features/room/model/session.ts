import type { GameType, RoomSession } from '../types'
import { isGameType } from './gameType.ts'
import { clearRoomSnapshot } from '../recovery/recoveryStorage.ts'

// 방마다 저장 키를 나눠 다른 방의 참가 정보가 섞이지 않게 합니다.
const key = (code: string, gameType: GameType) => `nolja:room:${gameType}:${code}`
const activeRoomKey = (gameType: GameType) => `nolja:active-room:${gameType}`

// 기존 링크의 참가자는 확인된 게임 종류로만 이전합니다. 다른 게임의 토큰을 가져오지 않습니다.
function migrateLegacySession(code: string, gameType: GameType) {
  const legacyKey = `nolja:room:${code}`
  const raw = sessionStorage.getItem(legacyKey)
  if (!raw) {
    return null
  }
  const saved = JSON.parse(sessionStorage.getItem(`nolja:recovery:${code}`) ?? 'null')
  const previousType = saved?.room?.gameType ?? 'othello'
  if (previousType !== gameType) {
    return null
  }
  const session = { ...JSON.parse(raw), gameType }
  sessionStorage.setItem(key(code, gameType), JSON.stringify(session))
  if (saved) {
    sessionStorage.setItem(
      `nolja:recovery:${gameType}:${code}`,
      JSON.stringify({ ...saved, room: { ...saved.room, gameType } }),
    )
  }
  if (sessionStorage.getItem('nolja:active-room') === code) {
    sessionStorage.setItem(activeRoomKey(gameType), code)
    sessionStorage.removeItem('nolja:active-room')
  }
  sessionStorage.removeItem(legacyKey)
  sessionStorage.removeItem(`nolja:recovery:${code}`)
  return session
}

// sessionStorage는 탭 단위이며 같은 탭의 새로고침 후에도 남아 있습니다.
// 탭 복제 시에는 브라우저가 값을 복사할 수 있으므로 두 기기 테스트는 별도 브라우저 세션을 씁니다.
// 저장소 값은 사용자가 수정할 수 있으므로 JSON 형태를 확인하고, 최종 인증은 서버에 맡깁니다.
export function readSession(code: string, gameType: GameType): RoomSession | null {
  try {
    const raw = sessionStorage.getItem(key(code, gameType))
    const value: unknown = raw ? JSON.parse(raw) : migrateLegacySession(code, gameType)
    if (
      value &&
      typeof value === 'object' &&
      'playerId' in value &&
      'token' in value &&
      typeof value.playerId === 'string' &&
      value.playerId.length > 0 &&
      value.playerId.length <= 64 &&
      typeof value.token === 'string' &&
      value.token.length > 0 &&
      value.token.length <= 128 &&
      'gameType' in value &&
      value.gameType === gameType
    ) {
      return value as RoomSession
    }
  } catch {
    /* 저장소 차단 또는 잘못된 JSON이면 저장된 참가 정보가 없는 것으로 처리합니다. */
  }
  return null
}

// 비밀 참가 토큰은 초대 주소에 넣지 않고 브라우저의 현재 탭에 보관합니다.
export function saveSession(code: string, session: RoomSession) {
  if (!isGameType(session.gameType)) {
    return
  }
  try {
    sessionStorage.setItem(key(code, session.gameType), JSON.stringify(session))
    sessionStorage.setItem(activeRoomKey(session.gameType), code)
  } catch {
    /* 현재 화면의 React 상태는 유지됩니다. */
  }
}

// 뒤로 가기 등으로 로비에 도착해도 기존 참가 정보가 있는 방으로 돌아갈 수 있습니다.
export function readActiveRoom(gameType: GameType): string | null {
  try {
    const code =
      sessionStorage.getItem(activeRoomKey(gameType)) ?? sessionStorage.getItem('nolja:active-room')
    return code && /^[A-HJ-NP-Z2-9]{6}$/.test(code) && readSession(code, gameType) ? code : null
  } catch {
    return null
  }
}

// 복귀 안내를 닫으면 같은 탭에서 새로고침해도 다시 표시하지 않습니다.
// 참가 토큰은 보관하므로 기존 초대 주소를 직접 열면 여전히 방으로 복귀할 수 있습니다.
export function dismissRoomRecovery(code: string, gameType: GameType) {
  try {
    if (sessionStorage.getItem(activeRoomKey(gameType)) === code) {
      sessionStorage.removeItem(activeRoomKey(gameType))
    }
  } catch {
    /* 저장소가 차단돼도 현재 화면에서는 안내를 닫을 수 있습니다. */
  }
}

// 퇴장할 때 해당 방 정보만 제거합니다. 다른 방과 기억해 둔 닉네임에는 영향을 주지 않습니다.
export function clearSession(code: string, gameType: GameType) {
  clearRoomSnapshot(code, gameType)
  try {
    sessionStorage.removeItem(key(code, gameType))
    if (sessionStorage.getItem(activeRoomKey(gameType)) === code) {
      sessionStorage.removeItem(activeRoomKey(gameType))
    }
  } catch {
    /* 저장소 접근이 차단돼도 화면 이동은 계속합니다. */
  }
}

// 닉네임은 편의를 위한 입력값일 뿐 인증 정보가 아니므로 localStorage에 별도로 기억합니다.
export function rememberedNickname() {
  try {
    return localStorage.getItem('nolja:nickname') ?? ''
  } catch {
    return ''
  }
}

// 입장에 성공한 이름만 다음 입력의 기본값으로 사용합니다.
export function rememberNickname(nickname: string) {
  try {
    localStorage.setItem('nolja:nickname', nickname)
  } catch {
    /* 선택적인 편의 기능이므로 저장 실패로 게임을 막지 않습니다. */
  }
}
