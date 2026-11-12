import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'
import { createInitialGame } from '../src/features/othello/rules.ts'
import {
  readRoomSnapshot,
  saveRoomSnapshot,
} from '../src/features/room/recovery/recoveryStorage.ts'
import {
  allPlayersConnected,
  remainingSeconds,
} from '../src/features/room/recovery/recoveryState.ts'
import {
  saveSession,
  readSession,
  readActiveRoom,
  clearSession,
} from '../src/features/room/model/session.ts'
import { QueryClient } from '@tanstack/react-query'
import { receiveRoom } from '../src/features/room/model/roomCache.ts'

// 브라우저 저장소의 정상/손상/차단 상황을 Node에서도 재현합니다. 각 테스트마다 독립 저장소를 씁니다.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
beforeEach(() => {
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
  })
})
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else delete globalThis.sessionStorage
})

const session = { gameType: 'othello', playerId: 'host-id', token: 'secret-token' }
function snapshot() {
  return {
    gameType: 'othello',
    code: 'ABCDEF',
    status: 'playing',
    revision: 7,
    gameNumber: 1,
    rematchReadyPlayerIds: [],
    closeReason: null,
    serverTime: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    game: createInitialGame(),
    players: [{ playerId: session.playerId, nickname: '민서', color: 'black', userId: null }],
    presence: [{ playerId: session.playerId, connected: true, reconnectDeadline: null }],
  }
}

test('saved boards retain identity and are cleared when returning to the lobby', () => {
  const room = snapshot()
  saveSession(room.code, session)
  saveRoomSnapshot(room, session)
  assert.deepEqual(readRoomSnapshot(room.code, session), room)
  assert.deepEqual(readSession(room.code, 'othello'), session)
  assert.equal(readActiveRoom('othello'), room.code)
  assert.equal(
    sessionStorage.getItem('nolja:recovery:othello:ABCDEF').includes(session.token),
    false,
  )
  assert.equal(readRoomSnapshot(room.code, { ...session, playerId: 'other' }), undefined)
  clearSession(room.code, 'othello')
  assert.equal(readActiveRoom('othello'), null)
  assert.equal(readSession(room.code, 'othello'), null)
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
  } finally {
    client.clear()
  }
})

test('broken or expired storage never becomes a playable room', t => {
  const now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const room = snapshot()
  saveRoomSnapshot(room, session)
  t.mock.method(Date, 'now', () => now + 60001)
  assert.equal(readRoomSnapshot(room.code, session), undefined)
  sessionStorage.setItem('nolja:recovery:othello:ABCDEF', '{broken')
  assert.equal(readRoomSnapshot(room.code, session), undefined)
  sessionStorage.setItem(
    'nolja:room:othello:ABCDEF',
    JSON.stringify({ playerId: 'host-id', token: '' }),
  )
  assert.equal(readSession(room.code, 'othello'), null)
  sessionStorage.setItem(
    'nolja:recovery:othello:ABCDEF',
    JSON.stringify({
      playerId: session.playerId,
      room: { ...room, game: { board: [] } },
      savedAt: now,
    }),
  )
  assert.equal(readRoomSnapshot(room.code, session), undefined)
})

test('blocked storage does not crash connection or lobby cleanup', () => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('Storage blocked')
    },
  })
  assert.doesNotThrow(() => saveSession('ABCDEF', session))
  assert.doesNotThrow(() => saveRoomSnapshot(snapshot(), session))
  assert.equal(readSession('ABCDEF', 'othello'), null)
  assert.equal(readRoomSnapshot('ABCDEF', session), undefined)
  assert.doesNotThrow(() => clearSession('ABCDEF', 'othello'))
})

test('pause eligibility and countdown use server time without inventing a winner', () => {
  const room = snapshot()
  assert.equal(allPlayersConnected(room), true)
  assert.equal(
    allPlayersConnected({ ...room, presence: [{ ...room.presence[0], connected: false }] }),
    false,
  )
  const deviceTime = Date.parse('2026-11-10T00:00:00Z')
  assert.equal(remainingSeconds('2026-11-10T00:07:00Z', 5 * 60000, deviceTime), 120)
  assert.equal(remainingSeconds('2026-11-10T00:07:00Z', 5 * 60000, deviceTime + 121000), 0)
})

test('same room code cannot mix the two games, caches or active recovery slots', () => {
  const othello = snapshot()
  const moleSession = { ...session, gameType: 'whack-a-mole', token: 'mole-token' }
  const mole = {
    ...othello,
    gameType: 'whack-a-mole',
    status: 'waiting',
    game: null,
    mole: null,
    revision: 1,
  }
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })
  try {
    saveSession(othello.code, session)
    saveSession(mole.code, moleSession)
    receiveRoom(client, session, othello)
    receiveRoom(client, moleSession, mole)
    assert.deepEqual(readSession(othello.code, 'othello'), session)
    assert.deepEqual(readSession(mole.code, 'whack-a-mole'), moleSession)
    assert.equal(readActiveRoom('othello'), othello.code)
    assert.equal(readActiveRoom('whack-a-mole'), mole.code)
    assert.deepEqual(readRoomSnapshot(othello.code, session), othello)
    assert.deepEqual(readRoomSnapshot(mole.code, moleSession), mole)
    assert.throws(() => receiveRoom(client, moleSession, othello), /다른 게임/)
    saveRoomSnapshot(othello, moleSession)
    assert.deepEqual(readRoomSnapshot(mole.code, moleSession), mole)
    clearSession(mole.code, 'whack-a-mole')
    assert.equal(readActiveRoom('whack-a-mole'), null)
    assert.equal(readActiveRoom('othello'), othello.code)
    assert.deepEqual(readRoomSnapshot(othello.code, session), othello)
  } finally {
    client.clear()
  }
})

test('legacy sessions migrate only into the game stored with their snapshot', () => {
  const oldSession = { playerId: session.playerId, token: session.token }
  const room = {
    ...snapshot(),
    gameType: 'whack-a-mole',
    status: 'waiting',
    game: null,
    mole: null,
  }
  sessionStorage.setItem('nolja:room:ABCDEF', JSON.stringify(oldSession))
  sessionStorage.setItem('nolja:active-room', 'ABCDEF')
  sessionStorage.setItem(
    'nolja:recovery:ABCDEF',
    JSON.stringify({ playerId: session.playerId, room, savedAt: Date.now() }),
  )
  assert.equal(readSession(room.code, 'othello'), null)
  assert.equal(readActiveRoom('othello'), null)
  assert.deepEqual(readSession(room.code, 'whack-a-mole'), {
    ...oldSession,
    gameType: 'whack-a-mole',
  })
  assert.equal(readActiveRoom('whack-a-mole'), room.code)
  assert.equal(sessionStorage.getItem('nolja:room:ABCDEF'), null)
})
