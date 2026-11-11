import type { Admission, GameType, RoomSession } from '../types.ts'

export const isGameType = (value: unknown): value is GameType => value === 'othello' || value === 'whack-a-mole'
export const gameName = (gameType: GameType) => gameType === 'whack-a-mole' ? '두더지잡기' : '오셀로'
export const roomPath = (gameType: GameType, code: string) => `/games/${gameType}/room/${code}`
export const admissionSession = (admission: Admission): RoomSession => ({
  gameType: admission.room.gameType, playerId: admission.playerId, token: admission.token,
})
