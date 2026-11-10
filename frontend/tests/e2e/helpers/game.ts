import { expect, type Page } from '@playwright/test'
import { getLegalMoves } from '../../../src/features/othello/rules'
import type { Room, RoomSession } from '../../../src/features/room/types'

// 실제 폼으로 두 기기를 입장시킵니다. 테스트별로 독립된 브라우저 context를 만들어 호출합니다.
export async function enterGame(host: Page, guest: Page) {
  await host.goto('/')
  await host.getByLabel('닉네임', { exact: true }).fill('민서')
  await host.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
  await guest.goto(host.url())
  await guest.getByLabel('닉네임', { exact: true }).fill('지훈')
  await guest.getByRole('button', { name: '방 입장하기' }).click()
  await expect(guest.getByRole('grid')).toBeVisible()
  await expect(guest.getByText('실시간 연결됨', { exact: true })).toBeVisible()
}

// 참가 토큰은 테스트 로그에 출력하지 않고 해당 기기의 정상 요청에만 사용합니다.
export async function sessionOf(page: Page, code: string): Promise<RoomSession> {
  return page.evaluate(roomCode => JSON.parse(sessionStorage.getItem(`nollja:room:${roomCode}`)!), code)
}

// 종료 준비에 수십 번의 클릭을 반복하지 않도록 실제 착수 API를 사용합니다.
// 보드를 강제로 바꾸는 테스트 전용 서버 기능은 만들지 않으며, 모든 수는 서버 규칙 검증을 받습니다.
export async function finishGame(host: Page, guest: Page, seed = 42): Promise<Room> {
  const code = new URL(host.url()).pathname.split('/').at(-1)!
  const origin = new URL(host.url()).origin
  const hostSession = await sessionOf(host, code)
  const guestSession = await sessionOf(guest, code)
  const sessions = [hostSession, guestSession]
  const initial = await host.request.get(`${origin}/api/rooms/${code}/state`, { headers: { Authorization: `Bearer ${hostSession.token}` } })
  expect(initial.ok()).toBe(true)
  let room: Room = await initial.json()
  let steps = 0
  while (room.status === 'playing') {
    expect(++steps).toBeLessThanOrEqual(60)
    const active = room.players.find(player => player.color === room.game.currentTurn)!
    const session = sessions.find(value => value.playerId === active.playerId)!
    const moves = getLegalMoves(room.game.board, active.color)
    // 고정된 난수 수순으로 같은 실패를 재현할 수 있게 합니다.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const move = moves[seed % moves.length]
    const response = await host.request.post(`${origin}/api/rooms/${code}/moves`, {
      headers: { Authorization: `Bearer ${session.token}` }, data: { ...move, revision: room.revision },
    })
    expect(response.ok()).toBe(true)
    room = await response.json()
  }
  await expect(host.getByRole('region', { name: '대국 결과' })).toBeVisible()
  await expect(guest.getByRole('region', { name: '대국 결과' })).toBeVisible()
  return room
}
