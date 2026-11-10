import { expect, test } from '@playwright/test'
import { getScore, getWinner } from '../../src/features/othello/rules'
import { enterGame, finishGame } from './helpers/game'

test('both devices see results, cancel and accept rematches, then return to the lobby', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const errors: string[] = []
  host.on('pageerror', error => errors.push(error.message))
  guest.on('pageerror', error => errors.push(error.message))
  try {
    await enterGame(host, guest)
    const invite = host.url()
    const code = new URL(invite).pathname.split('/').at(-1)!
    const finished = await finishGame(host, guest)
    const score = getScore(finished.game.board)
    const winner = getWinner(finished.game.board)
    const hostResult = host.getByRole('region', { name: '대국 결과' })
    const guestResult = guest.getByRole('region', { name: '대국 결과' })
    const title = (color: string) => winner === 'draw' ? '무승부예요' : winner === color ? '승리했어요!' : '아쉽게 패배했어요'
    await expect(hostResult.getByRole('heading')).toHaveText(title('black'))
    await expect(guestResult.getByRole('heading')).toHaveText(title('white'))
    await expect(hostResult.getByLabel(`흑 최종 ${score.black}점`, { exact: true })).toBeVisible()
    await expect(guestResult.getByLabel(`백 최종 ${score.white}점`, { exact: true })).toBeVisible()
    await expect(host.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    await host.screenshot({ path: 'test-results/result-desktop.png', fullPage: true })
    await guest.screenshot({ path: 'test-results/result-mobile.png', fullPage: true })
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    // 한 사람의 동의만으로 판이 초기화되지 않고, 취소도 상대 화면에 전파되어야 합니다.
    await host.getByRole('button', { name: '재대결 요청', exact: true }).click()
    await expect(host.getByText('상대방의 응답을 기다리고 있어요.', { exact: true })).toBeVisible()
    await expect(guest.getByText('민서님이 재대결을 요청했어요.', { exact: true })).toBeVisible()
    await host.getByRole('button', { name: '요청 취소', exact: true }).click()
    await expect(guest.getByRole('button', { name: '재대결 요청', exact: true })).toBeVisible()
    await expect(hostResult).toBeVisible()
    await host.getByRole('button', { name: '재대결 요청', exact: true }).click()
    await guest.reload()
    await expect(guest.getByRole('button', { name: '재대결 수락', exact: true })).toBeVisible()
    await guest.getByRole('button', { name: '재대결 수락', exact: true }).click()

    // 같은 초대 주소/참가 ID를 유지하고 흑백만 교대합니다. 새 흑인 게스트가 먼저 둡니다.
    await expect(hostResult).toHaveCount(0)
    await expect(guestResult).toHaveCount(0)
    expect(host.url()).toBe(invite)
    expect(guest.url()).toBe(invite)
    await expect(guest.getByText('내 차례', { exact: true })).toBeVisible()
    await expect(host.getByRole('button', { name: 'D3, 놓을 수 없음', exact: true })).toBeDisabled()
    await guest.getByRole('button', { name: 'D3, 놓을 수 있음', exact: true }).click()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
    await finishGame(host, guest)
    await expect(hostResult.getByText('2번째 대국 결과', { exact: true })).toBeVisible()

    // 로비 복귀 요청이 실패하면 결과를 남겨 재시도할 수 있게 합니다.
    await host.route('**/api/rooms/*/players/me', route => route.fulfill({ status: 503,
      contentType: 'application/json', body: JSON.stringify({ code: 'TEMPORARY', message: '잠시 후 다시 시도해 주세요.' }) }), { times: 1 })
    await host.getByRole('button', { name: '로비로 돌아가기', exact: true }).click()
    await expect(host.getByRole('alert')).toContainText('잠시 후 다시 시도')
    await expect(hostResult).toBeVisible()
    await host.getByRole('button', { name: '로비로 돌아가기', exact: true }).click()
    await expect(host.getByText('오셀로 로비', { exact: true })).toBeVisible()
    await expect(host.getByLabel('닉네임', { exact: true })).toHaveValue('민서')
    expect(await host.evaluate(roomCode => sessionStorage.getItem(`nollja:room:${roomCode}`), code)).toBeNull()

    // 먼저 나간 사람 때문에 상대의 결과가 사라지지 않으며 닫힌 방에서 재대결할 수는 없습니다.
    await expect(guestResult).toBeVisible()
    await expect(guest.getByText('상대가 로비로 돌아갔어요. 새 방에서 다시 만나요.', { exact: true })).toBeVisible()
    await expect(guest.getByRole('button', { name: /재대결 요청|재대결 수락/ })).toHaveCount(0)
    // 방이 닫힌 뒤 새로고침해도 기존 참가자는 서버에서 같은 결과를 다시 받을 수 있습니다.
    await guest.reload()
    await expect(guest.getByText('연결 종료', { exact: true })).toBeVisible()
    await expect(guestResult.getByText('2번째 대국 결과', { exact: true })).toBeVisible()
    await guest.getByRole('button', { name: '로비로 돌아가기', exact: true }).click()
    await expect(guest.getByText('오셀로 로비', { exact: true })).toBeVisible()
    expect(await guest.evaluate(roomCode => sessionStorage.getItem(`nollja:room:${roomCode}`), code)).toBeNull()
    await host.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(host.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
    expect(host.url()).not.toBe(invite)
    expect(errors).toEqual([])
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})
