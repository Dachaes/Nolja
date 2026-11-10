import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInitialGame } from '../src/features/othello/rules.ts'
import { keepNewestRoom } from '../src/features/room/model/roomCache.ts'
import { decodeRoomMessage, roomSocketUrl } from '../src/features/room/realtime/protocol.ts'

const room = {
  code: 'ABCDEF', status: 'playing', revision: 1, expiresAt: '2026-12-01T00:00:00Z', gameNumber: 1, rematchReadyPlayerIds: [],
  presence: [{ playerId: 'one', connected: true, reconnectDeadline: null }], closeReason: null, serverTime: '2026-11-10T00:00:00Z',
  players: [{ playerId: 'one', nickname: '민서', color: 'black', userId: null }], game: createInitialGame(),
}

// 실제 전송 순서가 뒤집히거나 중복되어도 보드가 이전 버전으로 돌아가지 않아야 합니다.
test('HTTP and socket snapshots share monotonic revision handling', () => {
  const latest = { ...room, revision: 4 }
  assert.equal(keepNewestRoom(latest, room), latest)
  assert.equal(keepNewestRoom(latest, { ...latest }), latest)
  assert.equal(keepNewestRoom(room, latest), latest)
  assert.equal(keepNewestRoom(undefined, room), room)
  // 새 판도 방의 revision은 계속 증가합니다. 지난 판의 결과가 새 보드를 덮어쓰지 않아야 합니다.
  const nextGame = { ...room, gameNumber: 2, revision: 65 }
  assert.equal(keepNewestRoom(nextGame, { ...room, status: 'finished', revision: 63 }), nextGame)
})

test('socket protocol accepts snapshots, errors and heartbeat responses', () => {
  assert.deepEqual(decodeRoomMessage(JSON.stringify({ type: 'room', room })), { type: 'room', room })
  assert.deepEqual(decodeRoomMessage('{"type":"pong"}'), { type: 'pong' })
  const error = { type: 'error', error: { code: 'INVALID_SESSION', message: '인증 실패' }, status: 401 }
  assert.deepEqual(decodeRoomMessage(JSON.stringify(error)), error)
})

test('malformed frames cannot become the rendered board', () => {
  for (const raw of ['broken', 'null', '{}', '{"type":"unknown"}', JSON.stringify({ type: 'room', room: { ...room, revision: -1 } }),
    JSON.stringify({ type: 'room', room: { ...room, game: { ...room.game, board: [] } } }),
    JSON.stringify({ type: 'room', room: { ...room, gameNumber: 0 } }),
    JSON.stringify({ type: 'room', room: { ...room, rematchReadyPlayerIds: ['outsider'] } }),
    JSON.stringify({ type: 'room', room: { ...room, rematchReadyPlayerIds: ['one', 'one'] } })]) {
    assert.equal(decodeRoomMessage(raw), null)
  }
})

test('socket URLs follow page encryption and contain no participant token', () => {
  assert.equal(roomSocketUrl('http://192.168.0.10:5173', 'ABCDEF'), 'ws://192.168.0.10:5173/ws/rooms/ABCDEF')
  assert.equal(roomSocketUrl('https://nollja.example', 'ABCDEF'), 'wss://nollja.example/ws/rooms/ABCDEF')
})
