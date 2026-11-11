import { expect, test } from '@playwright/test'
import type { Room } from '../../src/features/room/types'
import { sessionOf } from './helpers/game'
import { controlRoomConnection } from './helpers/connection'

test('two devices race for shared moles, recover, finish and rematch', async ({ browser }) => {
  test.setTimeout(65000)
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const errors: string[] = []
  host.on('pageerror', error => errors.push(error.message))
  guest.on('pageerror', error => errors.push(error.message))
  const connection = await controlRoomConnection(guest)
  try {
    await host.goto('/')
    await host.getByRole('button', { name: /두더지잡기/ }).click()
    await expect(host.getByText('두더지잡기 로비', { exact: true })).toBeVisible()
    await host.getByLabel('닉네임', { exact: true }).fill('민서')
    await host.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(host.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    const invite = host.url()
    const code = new URL(invite).pathname.split('/').at(-1)!
    await guest.goto(invite)
    await expect(guest.getByText('둘이서, 두더지잡기', { exact: true })).toBeVisible()
    await guest.getByLabel('닉네임', { exact: true }).fill('지훈')
    await guest.getByRole('button', { name: '방 입장하기' }).click()
    await expect(guest.getByRole('group', { name: '4×4 두더지 구멍' })).toBeVisible()
    await expect(host.getByRole('group', { name: '4×4 두더지 구멍' }).getByRole('button')).toHaveCount(16)
    await expect(host.getByRole('timer')).toHaveText('30초')
    await expect(host.getByRole('button', { name: /두더지 등장/ }).first()).toBeEnabled({ timeout: 6000 })

    const hostSession = await sessionOf(host, code)
    const guestSession = await sessionOf(guest, code)
    const state = async (): Promise<Room> => {
      const response = await host.request.get(`/api/rooms/${code}/state`, { headers: { Authorization: `Bearer ${hostSession.token}` } })
      expect(response.ok()).toBe(true)
      return response.json()
    }
    // Both requests refer to the same server target, without serializing them in the test.
    const initial = await state()
    const target = initial.mole!.holes.find(mole => mole && !mole.claimedBy)!
    const responses = await Promise.all([hostSession, guestSession].map(session => host.request.post(`/api/rooms/${code}/hits`, {
      headers: { Authorization: `Bearer ${session.token}` }, data: { hole: target.hole, moleId: target.id, gameNumber: 1 },
    })))
    expect(responses.every(response => response.ok())).toBe(true)
    const raced = await state()
    expect(raced.mole!.scores.reduce((sum, score) => sum + score.score, 0)).toBe(100)
    expect(raced.mole!.scores.reduce((sum, score) => sum + score.misses, 0)).toBe(0)
    await expect(host.locator(`[data-mole-id="${target.id}"]`)).toHaveCount(0)
    await expect(guest.locator(`[data-mole-id="${target.id}"]`)).toHaveCount(0)

    // Real pointer and touch input must both score, and both devices receive each update.
    const hostBefore = raced.mole!.scores.find(score => score.playerId === hostSession.playerId)!.score
    const guestBefore = raced.mole!.scores.find(score => score.playerId === guestSession.playerId)!.score
    await host.getByRole('button', { name: /두더지 등장/ }).first().click()
    await expect.poll(async () => (await state()).mole!.scores.find(score => score.playerId === hostSession.playerId)!.score).toBeGreaterThan(hostBefore)
    await guest.getByRole('button', { name: /두더지 등장/ }).first().tap()
    await expect.poll(async () => (await state()).mole!.scores.find(score => score.playerId === guestSession.playerId)!.score).toBeGreaterThan(guestBefore)
    const guestScore = (await state()).mole!.scores.find(score => score.playerId === guestSession.playerId)!.score
    await expect(host.getByRole('region', { name: '지훈 점수' }).locator('strong').first()).toHaveText(`${guestScore}점`)
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await host.screenshot({ path: 'test-results/mole-desktop.png', fullPage: true })
    await guest.screenshot({ path: 'test-results/mole-mobile.png', fullPage: true })

    await connection.block()
    await expect(host.getByText('지훈님의 연결을 기다리고 있어요.', { exact: true })).toBeVisible()
    const paused = await state()
    expect(paused.mole!.pausedAt).not.toBeNull()
    await expect(host.getByRole('group', { name: '4×4 두더지 구멍' }).getByRole('button').first()).toBeDisabled()
    connection.allow()
    await guest.getByRole('button', { name: '다시 연결', exact: true }).click()
    await expect(guest.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await expect.poll(async () => (await state()).mole!.pausedAt).toBeNull()
    await guest.reload()
    await expect(guest.getByRole('heading', { name: '두더지잡기', exact: true })).toBeVisible()
    await expect(guest.getByText('실시간 연결됨', { exact: true })).toBeVisible()

    await expect(host.getByRole('region', { name: '게임 결과' })).toBeVisible({ timeout: 35000 })
    await expect(guest.getByRole('region', { name: '게임 결과' })).toBeVisible()
    await expect(host.getByRole('timer')).toHaveText('0초')
    const final = await state()
    expect(final.mole!.finished).toBe(true)
    await host.getByRole('button', { name: '재대결 요청', exact: true }).click()
    await guest.getByRole('button', { name: '재대결 수락', exact: true }).click()
    await expect(host.getByText('2번째 대결', { exact: true })).toBeVisible()
    expect((await state()).mole!.scores.every(score => score.score === 0 && score.combo === 0)).toBe(true)
    await expect(host.getByRole('region', { name: '민서 점수' })).toContainText('0점')
    await expect(guest.getByRole('region', { name: '게임 결과' })).toHaveCount(0)
    guest.once('dialog', dialog => dialog.accept())
    await guest.getByRole('button', { name: '방 나가기', exact: true }).click()
    await expect(guest.getByRole('heading', { name: '오늘은 무엇을 할까요?' })).toBeVisible()
    await expect(host.getByRole('alert')).toContainText('종료된 방')
    expect(errors).toEqual([])
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})
