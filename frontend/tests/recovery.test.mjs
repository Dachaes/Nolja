import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'
import { createInitialGame } from '../src/features/othello/rules.ts'
import { readRoomSnapshot, saveRoomSnapshot } from '../src/features/room/recovery/recoveryStorage.ts'
import { allPlayersConnected, remainingSeconds } from '../src/features/room/recovery/recoveryState.ts'
import { saveSession, readSession, readActiveRoom, clearSession } from '../src/features/room/model/session.ts'
import { QueryClient } from '@tanstack/react-query'
import { receiveRoom } from '../src/features/room/model/roomCache.ts'

// 브라우저 저장소의 정상/손상/차단 상황을 Node에서도 재현합니다. 각 테스트마다 독립 저장소를 씁니다.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
beforeEach(() => {
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } })
})
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else delete globalThis.sessionStorage
})

const session = { playerId: 'host-id', token: 'secret-token' }
function snapshot() {
  return {
    code: 'ABCDEF', status: 'playing', revision: 7, gameNumber: 1, rematchReadyPlayerIds: [], closeReason: null,
    serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), game: createInitialGame(),
    players: [{ playerId: session.playerId, nickname: '민서', color: 'black', userId: null }],
    presence: [{ playerId: session.playerId, connected: true, reconnectDeadline: null }],
  }
}

test('saved boards retain identity and are cleared when returning to the lobby', () => {
  const room = snapshot()
  saveSession(room.code, session)
  saveRoomSnapshot(room, session)
  assert.deepEqual(readRoomSnapshot(room.code, session), room)
  assert.deepEqual(readSession(room.code), session)
  assert.equal(readActiveRoom(), room.code)
  assert.equal(sessionStorage.getItem('nollja:recovery:ABCDEF').includes(session.token), false)
  assert.equal(readRoomSnapshot(room.code, { ...session, playerId: 'other' }), undefined)
  clearSession(room.code)
  assert.equal(readActiveRoom(), null)
  assert.equal(readSession(room.code), null)
  assert.equal(readRoomSnapshot(room.code, session), undefined)
})

test('an inflated stored revision cannot override the authoritative server snapshot', () => {
  const room = snapshot()
  saveRoomSnapshot({ ...room, revision: 99999 }, session)
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  try {
    receiveRoom(client, session, room)
    receiveRoom(client, session, { ...room, revision: 6 })
    assert.deepEqual(readRoomSnapshot(room.code, session), room)
  } finally { client.clear() }
})

test('broken or expired storage never becomes a playable room', t => {
  const now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const room = snapshot()
  saveRoomSnapshot(room, session)
  t.mock.method(Date, 'now', () => now + 60001)
  assert.equal(readRoomSnapshot(room.code, session), undefined)
  sessionStorage.setItem('nollja:recovery:ABCDEF', '{broken')
  assert.equal(readRoomSnapshot(room.code, session), undefined)
  sessionStorage.setItem('nollja:room:ABCDEF', JSON.stringify({ playerId: 'host-id', token: '' }))
  assert.equal(readSession(room.code), null)
  sessionStorage.setItem('nollja:recovery:ABCDEF', JSON.stringify({ playerId: session.playerId, room: { ...room, game: { board: [] } }, savedAt: now }))
  assert.equal(readRoomSnapshot(room.code, session), undefined)
})

test('blocked storage does not crash connection or lobby cleanup', () => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
  assert.doesNotThrow(() => saveSession('ABCDEF', session))
  assert.doesNotThrow(() => saveRoomSnapshot(snapshot(), session))
  assert.equal(readSession('ABCDEF'), null)
  assert.equal(readRoomSnapshot('ABCDEF', session), undefined)
  assert.doesNotThrow(() => clearSession('ABCDEF'))
})

test('pause eligibility and countdown use server time without inventing a winner', () => {
  const room = snapshot()
  assert.equal(allPlayersConnected(room), true)
  assert.equal(allPlayersConnected({ ...room, presence: [{ ...room.presence[0], connected: false }] }), false)
  const deviceTime = Date.parse('2026-11-10T00:00:00Z')
  assert.equal(remainingSeconds('2026-11-10T00:07:00Z', 5 * 60000, deviceTime), 120)
  assert.equal(remainingSeconds('2026-11-10T00:07:00Z', 5 * 60000, deviceTime + 121000), 0)
})
