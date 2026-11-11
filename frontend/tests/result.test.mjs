import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getGameResult } from '../src/features/othello/result/result.ts'

// 보드가 다 차지 않고 끝난 게임도 실제 돌 수만 점수로 계산해야 합니다.
test('the same final board gives opposite outcomes to the two players', () => {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null))
  board[0] = ['black', 'black', 'black', 'white', null, null, null, null]
  assert.equal(getGameResult(board, 'black').outcome, 'win')
  assert.equal(getGameResult(board, 'white').outcome, 'lose')
  assert.deepEqual(getGameResult(board, 'black').score, { black: 3, white: 1 })
})

// 승자가 없는 경우에는 어느 색상에서도 패배로 표시되지 않아야 합니다.
test('equal final scores show a draw for both colors', () => {
  const board = Array.from({ length: 8 }, (_, row) => Array(8).fill(row < 4 ? 'black' : 'white'))
  for (const color of ['black', 'white']) {
    const result = getGameResult(board, color)
    assert.equal(result.outcome, 'draw')
    assert.equal(result.title, '무승부예요')
    assert.deepEqual(result.score, { black: 32, white: 32 })
  }
})
