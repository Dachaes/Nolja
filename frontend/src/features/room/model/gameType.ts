import type { Admission, GameType, RoomSession } from '../types.ts'

// 외부 응답의 게임 종류를 검사합니다. 검사 후 TypeScript에서도 GameType으로 다룰 수 있습니다.
export const isGameType = (value: unknown): value is GameType =>
  value === 'othello' || value === 'whack-a-mole'
// 서버 식별자와 화면 표시 이름을 분리해 URL에는 일정한 식별자를 사용합니다.
export const gameName = (gameType: GameType) =>
  gameType === 'whack-a-mole' ? '두더지잡기' : '오셀로'
export const roomPath = (gameType: GameType, code: string) => `/games/${gameType}/room/${code}`
// 방 전체 응답 중 이후 인증에 필요한 참가 정보만 꺼냅니다.
export const admissionSession = (admission: Admission): RoomSession => ({
  gameType: admission.room.gameType,
  playerId: admission.playerId,
  token: admission.token,
})
