// 문자열을 두 값으로 제한해 돌 색상 오타를 컴파일 단계에서 발견합니다.
export type DiscColor = 'black' | 'white'
// null은 빈칸입니다. 보드는 [행][열]로 접근하며 각 좌표는 0~7입니다.
export type Cell = DiscColor | null
// 읽기 전용 타입으로 기존 보드에 직접 쓰는 실수를 줄입니다. 실제 수정은 복사본에 합니다.
export type Board = ReadonlyArray<ReadonlyArray<Cell>>
export interface Position { row: number; col: number }

// 참가자 ID, 표시 이름, 로그인 계정 ID를 분리해 비회원 대전에도 같은 모델을 사용합니다.
export interface Player {
  // 서버가 방 참가 시 발급합니다. 닉네임 대신 비교 및 React key에 사용합니다.
  playerId: string
  nickname: string
  // 아직 로그인하지 않은 참가자는 없거나 null입니다.
  userId?: string | null
  color: DiscColor
}

// 오셀로 규칙에 관한 상태입니다. 상대 입장 대기 여부는 별도의 Room.status가 관리합니다.
export interface GameState {
  board: Board
  // 종료되면 다음 차례가 없으므로 null입니다.
  currentTurn: DiscColor | null
  status: 'playing' | 'finished'
  // 시작 직후에는 마지막 수가 없습니다. 착수 후에는 돌 중앙 표시의 기준이 됩니다.
  lastMove: Position | null
  // 직전 착수 때문에 자동 패스한 색상이며, 패스가 없으면 null입니다.
  passedPlayer: DiscColor | null
  // 초기 배치된 4개 돌을 제외하고 실제로 둔 횟수입니다.
  moveCount: number
}
