import { expect, test } from '@playwright/test'
import { enterGame, sessionOf } from './helpers/game'
import { controlRoomConnection } from './helpers/connection'

test('refresh during a socket outage shows the saved board and restores the same participant', async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const connection = await controlRoomConnection(host)
  try {
    await enterGame(host, guest)
    const code = new URL(host.url()).pathname.split('/').at(-1)!
    const identity = await sessionOf(host, code)
    await host.getByRole('button', { name: 'D3, 놓을 수 있음', exact: true }).click()
    await expect(guest.getByText('내 차례', { exact: true })).toBeVisible()
    await connection.block()
    await expect(guest.getByText('민서님의 연결을 기다리고 있어요.', { exact: true })).toBeVisible()
    await expect(guest.getByText(/복귀 대기 \d+분 \d+초/)).toBeVisible()
    // 저장소의 버전 값이 손상돼도 재인증 후에는 서버 보드가 최종 기준이 되어야 합니다.
    await host.evaluate(roomCode => {
      const key = `nolja:recovery:othello:${roomCode}`
      const saved = JSON.parse(sessionStorage.getItem(key)!)
      saved.room.revision = 999999
      sessionStorage.setItem(key, JSON.stringify(saved))
    }, code)
    await host.reload()
    await expect(
      host.getByRole('button', { name: 'D3, 흑 돌, 마지막 수', exact: true }),
    ).toBeVisible()
    await expect(
      host.getByText('마지막으로 확인한 보드를 보여드리고 있어요.', { exact: true }),
    ).toBeVisible()
    await expect(host.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    await expect(guest.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    expect(await sessionOf(host, code)).toEqual(identity)
    await host.screenshot({ path: 'test-results/recovery-desktop.png', fullPage: true })
    await guest.screenshot({ path: 'test-results/recovery-mobile.png', fullPage: true })
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    )

    connection.allow()
    await host.getByRole('button', { name: '다시 연결', exact: true }).click()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await expect(guest.getByRole('region', { name: '상대 연결 안내' })).toHaveCount(0)
    await guest.getByRole('button', { name: 'C3, 놓을 수 있음', exact: true }).click()
    await expect(
      host.getByRole('button', { name: 'C3, 백 돌, 마지막 수', exact: true }),
    ).toBeVisible()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})

test('network return reconnects automatically and lobby navigation can resume the same game', async ({
  browser,
}) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  try {
    await enterGame(host, guest)
    const invite = host.url()
    const code = new URL(invite).pathname.split('/').at(-1)!
    const hostSession = await sessionOf(host, code)
    await guestContext.setOffline(true)
    await expect(guest.getByText('인터넷 연결을 기다리고 있어요.', { exact: true })).toBeVisible()
    await expect(host.getByText('지훈님의 연결을 기다리고 있어요.', { exact: true })).toBeVisible()
    await expect(host.getByText('게임 일시정지', { exact: true })).toBeVisible()
    // 브라우저 버튼만 막은 것이 아니라 서버도 오프라인 중의 착수를 거절하는지 확인합니다.
    const origin = new URL(invite).origin
    const headers = { Authorization: `Bearer ${hostSession.token}` }
    const state = await (
      await host.request.get(`${origin}/api/rooms/${code}/state`, { headers })
    ).json()
    const rejected = await host.request.post(`${origin}/api/rooms/${code}/moves`, {
      headers,
      data: { row: 2, col: 3, revision: state.revision },
    })
    expect(rejected.status()).toBe(409)
    expect((await rejected.json()).code).toBe('PLAYER_DISCONNECTED')

    await guestContext.setOffline(false)
    await expect(guest.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await host.getByRole('button', { name: 'D3, 놓을 수 있음', exact: true }).click()
    await guest.getByRole('button', { name: 'C3, 놓을 수 있음', exact: true }).click()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
    // 주소 이동은 명시적 퇴장이 아닙니다. 같은 탭의 저장된 참가 정보로 2분 안에 돌아올 수 있습니다.
    await host.goto('/')
    await expect(
      host.getByRole('button', { name: '이전 방으로 돌아가기', exact: true }),
    ).toBeVisible()
    await host.getByRole('button', { name: '이전 방으로 돌아가기', exact: true }).click()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    expect(host.url()).toBe(invite)
    expect(await sessionOf(host, code)).toEqual(hostSession)
    await expect(
      host.getByRole('button', { name: 'C3, 백 돌, 마지막 수', exact: true }),
    ).toBeVisible()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})

test('a saved board cannot grant access with an invalid participant token', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  try {
    await enterGame(host, guest)
    const code = new URL(host.url()).pathname.split('/').at(-1)!
    await host.evaluate(roomCode => {
      const key = `nolja:room:othello:${roomCode}`
      const session = JSON.parse(sessionStorage.getItem(key)!)
      sessionStorage.setItem(key, JSON.stringify({ ...session, token: 'invalid-token' }))
    }, code)
    await host.reload()
    await expect(host.getByRole('heading', { name: '이 방에 참여할 수 없어요' })).toBeVisible()
    await expect(host.getByRole('grid')).toHaveCount(0)
    expect(
      await host.evaluate(
        roomCode => sessionStorage.getItem(`nolja:room:othello:${roomCode}`),
        code,
      ),
    ).toBeNull()
    expect(
      await host.evaluate(
        roomCode => sessionStorage.getItem(`nolja:recovery:othello:${roomCode}`),
        code,
      ),
    ).toBeNull()
    await host.getByRole('button', { name: '로비로 돌아가기', exact: true }).click()
    await expect(
      host.getByRole('button', { name: '이전 방으로 돌아가기', exact: true }),
    ).toHaveCount(0)
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})
