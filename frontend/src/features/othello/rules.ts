import type { Board, Cell, DiscColor, GameState, Position } from './types.ts'

// 화면의 착수 힌트·점수 계산과 규칙 테스트에 쓰는 순수 함수 모음입니다.
// 온라인 대국의 최종 착수 검증은 백엔드 OthelloRules가 수행합니다.
export const BOARD_SIZE = 8
export const COLOR_LABEL: Record<DiscColor, string> = { black: '흑', white: '백' }
// [행 변화량, 열 변화량]: 현재 칸에서 가로·세로·대각선의 8방향을 탐색합니다.
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
] as const

// 현재 색상의 반대편을 구합니다.
export const opponentOf = (color: DiscColor): DiscColor => color === 'black' ? 'white' : 'black'
// 배열 밖 좌표뿐 아니라 2.5 같은 소수도 착수 좌표로 허용하지 않습니다.
const isOnBoard = (row: number, col: number) =>
  Number.isInteger(row) && Number.isInteger(col) &&
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE

// 중앙의 흑·백 두 개씩을 배치하고 흑 차례로 시작합니다.
export function createInitialGame(): GameState {
  // 행마다 새 배열을 만들어 한 행 수정이 다른 행에 함께 반영되는 참조 공유를 피합니다.
  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null))
  board[3][3] = 'white'
  board[3][4] = 'black'
  board[4][3] = 'black'
  board[4][4] = 'white'
  return { board, currentTurn: 'black', status: 'playing', lastMove: null, passedPlayer: null, moveCount: 0 }
}

// 주어진 빈칸에 두었을 때 뒤집힐 상대 돌 좌표를 반환합니다. 보드 자체는 바꾸지 않습니다.
export function getFlips(board: Board, color: DiscColor, { row, col }: Position): Position[] {
  if (!isOnBoard(row, col) || board[row][col] !== null) return []
  const flips: Position[] = []
  for (const [dr, dc] of DIRECTIONS) {
    const line: Position[] = []
    let r = row + dr
    let c = col + dc
    // 한 방향으로 연속된 상대 돌만 후보로 모읍니다. 빈칸이나 자신의 돌을 만나면 멈춥니다.
    while (isOnBoard(r, c) && board[r][c] === opponentOf(color)) {
      line.push({ row: r, col: c })
      r += dr
      c += dc
    }
    // 끝이 내 돌로 막혀 있어야 상대 돌을 끼운 것입니다. 보드 끝/빈칸에서 끝나면 무효입니다.
    if (line.length > 0 && isOnBoard(r, c) && board[r][c] === color) flips.push(...line)
  }
  return flips
}

// 64칸 중 최소 한 개의 상대 돌을 뒤집을 수 있는 칸만 추립니다.
export function getLegalMoves(board: Board, color: DiscColor): Position[] {
  const moves: Position[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (getFlips(board, color, { row, col }).length > 0) moves.push({ row, col })
    }
  }
  return moves
}

// 돌 수는 따로 저장하지 않고 보드에서 계산해 화면 점수와 실제 보드의 불일치를 막습니다.
export function getScore(board: Board) {
  const score = { black: 0, white: 0 }
  for (const row of board) for (const cell of row) if (cell) score[cell]++
  return score
}

// 돌 수만 비교합니다. 대국 종료 여부는 호출하는 쪽에서 확인해야 합니다.
export function getWinner(board: Board): DiscColor | 'draw' {
  const score = getScore(board)
  return score.black === score.white ? 'draw' : score.black > score.white ? 'black' : 'white'
}

// 테스트 등에서 한 수 이후의 상태를 계산하는 순수 함수입니다.
// 잘못된 수나 종료 후 착수는 기존 객체를 그대로 반환합니다. 온라인 화면은 서버 응답을 사용합니다.
export function playMove(game: GameState, position: Position): GameState {
  if (game.status !== 'playing' || !game.currentTurn) return game
  const color = game.currentTurn
  const flips = getFlips(game.board, color, position)
  if (flips.length === 0) return game

  // 행까지 복사한 후 변경하여 입력 상태를 보존합니다. 이전 상태와 비교하는 테스트에도 유리합니다.
  const board = game.board.map(row => [...row])
  board[position.row][position.col] = color
  for (const { row, col } of flips) board[row][col] = color

  const opponent = opponentOf(color)
  // 상대가 둘 수 있으면 교대, 상대만 못 두면 자동 패스, 둘 다 못 두면 대국 종료입니다.
  // 보드에 빈칸이 남아 있어도 양쪽 모두 둘 수 없다면 종료됩니다.
  const opponentCanPlay = getLegalMoves(board, opponent).length > 0
  const canContinue = opponentCanPlay || getLegalMoves(board, color).length > 0
  return {
    board,
    currentTurn: canContinue ? (opponentCanPlay ? opponent : color) : null,
    status: canContinue ? 'playing' : 'finished',
    lastMove: { ...position },
    passedPlayer: canContinue && !opponentCanPlay ? opponent : null,
    moveCount: game.moveCount + 1,
  }
}
