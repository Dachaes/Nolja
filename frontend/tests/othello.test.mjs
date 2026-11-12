import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createInitialGame,
  getFlips,
  getLegalMoves,
  getScore,
  getWinner,
  playMove,
} from '../src/features/othello/rules.ts'

// 이 테스트는 UI/서버 없이 규칙 함수만 실행합니다. 각 테스트는 준비 → 실행 → 결과 확인 순서입니다.
// 검증할 상황만 직접 만들 수 있도록 빈 보드와 특정 보드의 게임 상태를 생성하는 도우미를 둡니다.
const emptyBoard = () => Array.from({ length: 8 }, () => Array(8).fill(null))
const gameWith = (board, currentTurn = 'black') => ({ ...createInitialGame(), board, currentTurn })

// 시작 배치와 흑의 첫 후보 D3/C4/F5/E6가 정확한지 확인합니다.
test('initial board has the official four discs, black starts, and four legal moves', () => {
  const game = createInitialGame()
  assert.deepEqual(getScore(game.board), { black: 2, white: 2 })
  assert.equal(game.currentTurn, 'black')
  assert.equal(game.board[3][3], 'white')
  assert.equal(game.board[3][4], 'black')
  assert.equal(game.board[4][3], 'black')
  assert.equal(game.board[4][4], 'white')
  assert.deepEqual(getLegalMoves(game.board, 'black'), [
    { row: 2, col: 3 },
    { row: 3, col: 2 },
    { row: 4, col: 5 },
    { row: 5, col: 4 },
  ])
})

// 첫 수 이후 점수와 차례뿐 아니라 입력 객체가 그대로인지도 확인해 원본 변경을 잡습니다.
test('D3 flips D4, updates score, switches turn, and preserves the input board', () => {
  const game = createInitialGame()
  const before = structuredClone(game)
  const next = playMove(game, { row: 2, col: 3 })
  assert.deepEqual(game, before)
  assert.equal(next.board[3][3], 'black')
  assert.deepEqual(getScore(next.board), { black: 4, white: 1 })
  assert.equal(next.currentTurn, 'white')
  assert.equal(next.moveCount, 1)
  assert.deepEqual(next.lastMove, { row: 2, col: 3 })
  assert.equal(next.passedPlayer, null)
})

// 이미 돌이 있는 칸, 뒤집을 수 없는 칸, 범위 밖/소수 좌표를 입력해도 상태가 바뀌면 안 됩니다.
test('occupied, non-capturing, out-of-bounds, and fractional moves are rejected', () => {
  const game = createInitialGame()
  for (const position of [
    { row: 3, col: 3 },
    { row: 0, col: 0 },
    { row: -1, col: 3 },
    { row: 8, col: 2 },
    { row: 2, col: 8 },
    { row: 2.5, col: 3 },
  ])
    assert.equal(playMove(game, position), game)
})

// 중심 주변에 상대 돌, 그 바깥에 내 돌을 배치해 8방향을 한 번에 뒤집는 상황을 만듭니다.
test('a single move captures all eight directions', () => {
  const board = emptyBoard()
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    board[3 + dr][3 + dc] = 'white'
    board[3 + 2 * dr][3 + 2 * dc] = 'black'
  }
  assert.equal(getFlips(board, 'black', { row: 3, col: 3 }).length, 8)
  assert.deepEqual(getScore(playMove(gameWith(board), { row: 3, col: 3 }).board), {
    black: 17,
    white: 0,
  })
})

// 모서리에서 긴 줄을 끝까지 뒤집을 때 경계 처리가 올바른지 확인합니다.
test('corner move captures a whole bounded line', () => {
  const board = emptyBoard()
  for (let col = 1; col < 7; col++) board[0][col] = 'white'
  board[0][7] = 'black'
  assert.equal(getFlips(board, 'black', { row: 0, col: 0 }).length, 6)
})

// 상대 돌 뒤에 빈칸이 있거나 내 돌로 닫히지 않은 줄은 뒤집기 대상이 아닙니다.
test('an empty gap or an unbounded line cannot be captured', () => {
  const board = emptyBoard()
  board[0][1] = 'white'
  board[0][3] = 'black'
  assert.deepEqual(getFlips(board, 'black', { row: 0, col: 0 }), [])
  board[0][3] = null
  for (let col = 1; col < 8; col++) board[0][col] = 'white'
  assert.deepEqual(getFlips(board, 'black', { row: 0, col: 0 }), [])
})

// 내 돌을 만나는 순간 탐색을 끝내야 합니다. 그 너머 상대 돌까지 건너뛰어 뒤집지 않습니다.
test('captures stop at the first own disc and cannot jump over it', () => {
  const board = emptyBoard()
  board[0] = [null, 'white', 'black', 'white', 'black', null, null, null]
  assert.deepEqual(getFlips(board, 'black', { row: 0, col: 0 }), [{ row: 0, col: 1 }])
})

// 이번에 뒤집힌 돌을 출발점 삼아 옆 방향의 돌을 연쇄적으로 뒤집는 잘못된 구현을 막습니다.
test('flipped discs do not trigger chain captures', () => {
  const board = emptyBoard()
  board[0][1] = 'white'
  board[0][2] = 'black'
  board[1][1] = 'white'
  board[2][1] = 'black'
  const next = playMove(gameWith(board), { row: 0, col: 0 })
  assert.equal(next.board[0][1], 'black')
  assert.equal(next.board[1][1], 'white')
})

// 상대만 둘 수 없는 보드를 준비해 자동 패스 후 같은 색이 다시 두고 종료되는 흐름을 확인합니다.
test('opponent automatically passes when only the moving player can continue', () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill('black'))
  board[0][1] = 'white'
  board[0][2] = null
  board[7][6] = 'white'
  board[7][7] = null
  const next = playMove(gameWith(board), { row: 0, col: 2 })
  assert.equal(next.status, 'playing')
  assert.equal(next.currentTurn, 'black')
  assert.equal(next.passedPlayer, 'white')
  assert.deepEqual(getLegalMoves(next.board, 'black'), [{ row: 7, col: 7 }])
  const finished = playMove(next, { row: 7, col: 7 })
  assert.equal(finished.status, 'finished')
  assert.equal(finished.passedPlayer, null)
  assert.deepEqual(getScore(finished.board), { black: 64, white: 0 })
})

// 빈칸이 남아도 두 색 모두 둘 수 없으면 종료되고 이후 착수는 거절되어야 합니다.
test('game ends even with empty squares if neither player can move', () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill('black'))
  board[0][0] = null
  board[0][1] = 'white'
  board[7][7] = null
  const next = playMove(gameWith(board), { row: 0, col: 0 })
  assert.equal(next.status, 'finished')
  assert.equal(next.currentTurn, null)
  assert.equal(next.board[7][7], null)
  assert.deepEqual(getScore(next.board), { black: 63, white: 0 })
  assert.equal(getWinner(next.board), 'black')
  assert.equal(playMove(next, { row: 7, col: 7 }), next)
})

// 마지막 백 착수 후 정확히 32:32가 되는 보드로 종료와 무승부 판정을 함께 확인합니다.
test('a final white move can produce a 32–32 draw', () => {
  const board = Array.from({ length: 8 }, (_, row) => Array(8).fill(row < 4 ? 'white' : 'black'))
  board[0][0] = null
  board[0][1] = 'black'
  const next = playMove(gameWith(board, 'white'), { row: 0, col: 0 })
  assert.equal(next.status, 'finished')
  assert.deepEqual(getScore(next.board), { black: 32, white: 32 })
  assert.equal(getWinner(next.board), 'draw')
})

// 백의 승리 판정과 초기 상태를 새로 생성할 때 배열이 공유되지 않는지 확인합니다.
test('winner calculation supports white winning and new games reset all state', () => {
  assert.equal(getWinner(Array.from({ length: 8 }, () => Array(8).fill('white'))), 'white')
  const original = createInitialGame()
  playMove(original, { row: 2, col: 3 })
  const fresh = createInitialGame()
  assert.deepEqual(fresh, original)
  assert.notEqual(fresh.board, original.board)
})

// 고정 seed로 재현 가능한 100판을 진행합니다. 매 수 돌이 하나 늘고 최대 60수 안에 종료되어야 합니다.
test('100 seeded full games preserve scores, turn legality, and terminate within 60 moves', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let random = seed
    let game = createInitialGame()
    while (game.status === 'playing') {
      assert.ok(game.moveCount < 60)
      const legalMoves = getLegalMoves(game.board, game.currentTurn)
      assert.ok(legalMoves.length > 0)
      // 같은 seed는 같은 수순을 만듭니다. 실패가 생겨도 같은 게임을 재현해 원인을 찾을 수 있습니다.
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      const next = playMove(game, legalMoves[random % legalMoves.length])
      const score = getScore(next.board)
      assert.equal(score.black + score.white, next.moveCount + 4)
      assert.equal(next.moveCount, game.moveCount + 1)
      game = next
    }
    assert.equal(game.currentTurn, null)
    assert.deepEqual(getLegalMoves(game.board, 'black'), [])
    assert.deepEqual(getLegalMoves(game.board, 'white'), [])
  }
})
