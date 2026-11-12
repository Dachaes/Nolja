import type { GameState, Player } from '../othello/types'
import type { PlayerPresence, CloseReason } from './recovery/types'
import type { MoleState } from '../mole/types'

export type GameType = 'othello' | 'whack-a-mole'

// 참가 대기 → 게임 진행 → 정상 종료, 또는 참가자 퇴장에 의한 방 폐쇄를 구분합니다.
export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'closed'

// 초대받은 사람이 참가하기 전에도 볼 수 있는 최소 정보입니다. 토큰/보드는 포함하지 않습니다.
export interface RoomPreview {
  gameType: GameType
  code: string
  status: RoomStatus
  hostNickname: string
  playerCount: number
  expiresAt: string
}

// 인증된 참가자가 받는 방 전체 상태입니다. 보드는 서버 응답을 기준으로 표시합니다.
export interface Room {
  gameType: GameType
  mole?: MoleState | null
  code: string
  status: RoomStatus
  players: Player[]
  game: GameState | null
  // 입장·착수 등 상태가 바뀔 때 증가합니다. 숫자가 클수록 최신 상태입니다.
  revision: number
  // 재대결이 시작될 때 증가합니다. 지난 판에서 보낸 요청을 새 판에 적용하지 않기 위한 번호입니다.
  gameNumber: number
  // 현재 종료된 판에서 재대결에 동의한 참가자들입니다. 다음 판 시작/퇴장 시 비웁니다.
  rematchReadyPlayerIds: string[]
  // 서버의 만료 시각을 표현한 ISO 8601 문자열입니다.
  expiresAt: string
  presence: PlayerPresence[]
  closeReason: CloseReason | null
  // 서버 시각과 기기 시각의 차이를 보정해 복구 카운트다운을 표시합니다.
  serverTime: string
}

// playerId는 참가자 식별자, token은 그 참가자로 요청할 수 있음을 증명하는 비밀값입니다.
export interface RoomSession {
  gameType: GameType
  playerId: string
  token: string
}

// 생성/입장 직후에만 방 상태와 본인의 참가 토큰을 한 번에 받습니다.
export interface Admission {
  room: Room
  playerId: string
  token: string
}
