import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMoleState, moleClock } from '../src/features/mole/model.ts'
import { isRoomSnapshot } from '../src/features/room/model/roomSnapshot.ts'

const start = Date.parse('2026-11-11T00:00:03Z')
const ids = new Set(['one', 'two'])
const game = {
  startsAt: new Date(start).toISOString(), endsAt: new Date(start + 30000).toISOString(), pausedAt: null, finished: false,
  holes: Array(16).fill(null), scores: [...ids].map(playerId => ({ playerId, score: 0, hits: 0, misses: 0, combo: 0, bestCombo: 0 })),
}

test('server clock drives countdown, duration, pause and deadline input lock', () => {
  assert.deepEqual(moleClock(game, start - 2001), { countdown: 3, remaining: 30, active: false })
  assert.deepEqual(moleClock(game, start), { countdown: 0, remaining: 30, active: true })
  assert.deepEqual(moleClock(game, start + 30000), { countdown: 0, remaining: 0, active: false })
  assert.deepEqual(moleClock({ ...game, pausedAt: new Date(start + 10000).toISOString() }, start + 60000),
    { countdown: 0, remaining: 20, active: false })
  assert.equal(moleClock({ ...game, finished: true }, start).remaining, 0)
  assert.equal(moleClock({ ...game, startsAt: null, endsAt: null }, start).active, false)
})

test('mole frames validate targets, players, dates and combo bounds', () => {
  assert.equal(isMoleState(game, ids), true)
  const target = { id: 1, hole: 0, appearedAt: game.startsAt, expiresAt: game.endsAt, claimedBy: null, points: 0 }
  assert.equal(isMoleState({ ...game, holes: [target, ...game.holes.slice(1)] }, ids), true)
  for (const invalid of [null, {}, { ...game, holes: [] }, { ...game, startsAt: 'invalid' },
    { ...game, endsAt: new Date(start + 60000).toISOString() }, { ...game, scores: [game.scores[0], game.scores[0]] },
    { ...game, holes: [{ ...target, claimedBy: 'outsider' }, ...game.holes.slice(1)] },
    { ...game, holes: [{ ...target, hole: 4 }, ...game.holes.slice(1)] },
    { ...game, scores: [{ ...game.scores[0], combo: 3 }, game.scores[1]] }]) assert.equal(isMoleState(invalid, ids), false)
})

test('room protocol accepts waiting and active mole rooms without an othello board', () => {
  const room = {
    code: 'ABCDEF', gameType: 'whack-a-mole', status: 'playing', revision: 1, gameNumber: 1, rematchReadyPlayerIds: [],
    players: [...ids].map((playerId, i) => ({ playerId, nickname: playerId, color: i ? 'white' : 'black' })),
    presence: [...ids].map(playerId => ({ playerId, connected: true, reconnectDeadline: null })),
    expiresAt: game.endsAt, serverTime: game.startsAt, closeReason: null, mole: game,
  }
  assert.equal(isRoomSnapshot(room), true)
  assert.equal(isRoomSnapshot({ ...room, mole: null }), false)
  assert.equal(isRoomSnapshot({ ...room, status: 'waiting', mole: null, players: room.players.slice(0, 1), presence: room.presence.slice(0, 1) }), true)
  assert.equal(isRoomSnapshot({ ...room, status: 'finished' }), false)
  assert.equal(isRoomSnapshot({ ...room, mole: { ...game, finished: true } }), false)
  assert.equal(isRoomSnapshot({ ...room, gameType: 'unknown' }), false)
})
