import { expect, test } from '@playwright/test'
import { createInitialGame } from '../../src/features/othello/rules'

test('one tab keeps separate game lobbies, invites, tokens and recovery', async ({ page }) => {
  await page.goto('/games/othello')
  await page.getByLabel('닉네임', { exact: true }).fill('민서')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
  await expect(page).toHaveURL(/\/games\/othello\/room\/[A-HJ-NP-Z2-9]{6}$/)
  const othelloUrl = page.url()
  const othelloCode = othelloUrl.split('/').at(-1)!

  await page.goto('/games/whack-a-mole')
  await expect(page.getByRole('button', { name: '이전 방으로 돌아가기', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
  await expect(page).toHaveURL(/\/games\/whack-a-mole\/room\/[A-HJ-NP-Z2-9]{6}$/)
  await expect(page.getByText('3초 카운트다운 뒤 두더지잡기가 시작돼요.', { exact: false })).toBeVisible()
  const moleUrl = page.url()
  const moleCode = moleUrl.split('/').at(-1)!
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }))
  await page.getByRole('button', { name: '초대 링크 복사', exact: true }).click()
  await expect(page.getByLabel('초대 링크', { exact: true })).toHaveValue(moleUrl)

  for (const [gameType, url, code, otherCode] of [
    ['othello', othelloUrl, othelloCode, moleCode], ['whack-a-mole', moleUrl, moleCode, othelloCode],
  ]) {
    await page.goto(`/games/${gameType}`)
    const recovery = page.getByRole('region', { name: '이전 방 복귀', exact: true })
    await expect(recovery).toContainText(code)
    await expect(recovery).not.toContainText(otherCode)
    await recovery.getByRole('button', { name: '이전 방으로 돌아가기', exact: true }).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
  }
  // An old unscoped invite is resolved by the server, without assuming Othello.
  await page.goto(`/room/${moleCode}`)
  await expect(page).toHaveURL(moleUrl)
  await expect(page.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
  await page.goto(`/games/whack-a-mole/room/${othelloCode}`)
  await expect(page.getByRole('alert')).toContainText('선택한 게임의 방이 아닙니다')
  await expect(page.getByRole('button', { name: '방 입장하기', exact: true })).toHaveCount(0)
  await expect(page.getByRole('grid')).toHaveCount(0)
})

for (const type of ['othello', undefined]) {
  test(`a mole lobby rejects a creation response with game type ${type ?? 'missing'}`, async ({ page }) => {
    await page.route('**/api/games/whack-a-mole/rooms', route => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      playerId: 'host-id', token: 'fake-token', room: {
        code: 'ABCDEF', gameType: type, status: 'waiting', revision: 0, gameNumber: 1,
        players: [{ playerId: 'host-id', nickname: '민서', color: 'black', userId: null }],
        presence: [{ playerId: 'host-id', connected: false, reconnectDeadline: new Date(Date.now() + 120000).toISOString() }],
        rematchReadyPlayerIds: [], closeReason: null, serverTime: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 360000).toISOString(), game: createInitialGame(), mole: null,
      },
    }) }))
    await page.goto('/games/whack-a-mole')
    await page.getByLabel('닉네임', { exact: true }).fill('민서')
    await page.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('선택한 게임과 서버의 방 정보가 다릅니다')
    await expect(page).toHaveURL(/\/games\/whack-a-mole$/)
    await expect(page.getByRole('grid')).toHaveCount(0)
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('nolja:room:')))).toEqual([])
  })
}
