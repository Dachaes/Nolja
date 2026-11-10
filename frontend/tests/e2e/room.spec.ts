import { expect, test } from '@playwright/test'

// 실제 브라우저와 실행 중인 백엔드를 연결해 사용자 흐름 전체를 확인하는 E2E 테스트입니다.
test('two devices create, copy an invite, join, play only their turns, reload and leave', async ({ browser }) => {
  // 브라우저 context를 나누면 쿠키와 저장소가 분리되어 서로 다른 기기의 참가자를 재현할 수 있습니다.
  // 화면 크기도 데스크톱/모바일로 나눠 같은 상태를 각자 제대로 표시하는지 확인합니다.
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const thirdContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const third = await thirdContext.newPage()
  // 겉으로 화면이 보여도 JavaScript 예외가 발생했을 수 있으므로 별도로 모아 마지막에 확인합니다.
  const errors: string[] = []
  // 정상 대국에서 /state 요청 없이 WebSocket만으로 보드가 동기화되는지 확인합니다.
  const stateRequests: string[] = []
  host.on('request', request => { if (request.url().endsWith('/state')) stateRequests.push(request.url()) })
  guest.on('request', request => { if (request.url().endsWith('/state')) stateRequests.push(request.url()) })
  host.on('pageerror', error => errors.push(error.message))
  guest.on('pageerror', error => errors.push(error.message))
  try {
    // 방 생성 후에는 대기실만 보여야 합니다. 초대 주소에는 방 코드만 포함되는지도 확인합니다.
    await host.goto('/')
    await expect(host.getByRole('heading', { name: '우리, 한 판 놀까요?' })).toBeVisible()
    await host.getByLabel('닉네임', { exact: true }).fill('민서')
    await host.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(host.getByRole('heading', { name: '친구를 기다리는 중' })).toBeVisible()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    const invite = host.url()
    expect(invite).toMatch(/\/room\/[A-HJ-NP-Z2-9]{6}$/)
    await expect(host.getByRole('grid')).toHaveCount(0)
    // 일반 HTTP 환경에서 Clipboard API가 없을 때를 재현해 수동 복사가 가능한지 확인합니다.
    await host.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }))
    await host.getByRole('button', { name: '초대 링크 복사' }).click()
    await expect(host.getByLabel('초대 링크', { exact: true })).toHaveValue(invite)
    await host.screenshot({ path: 'test-results/waiting-desktop.png', fullPage: true })

    // 상대는 같은 닉네임으로 입장할 수 없고, 이름을 바꾸면 백으로 참여할 수 있어야 합니다.
    await guest.goto(invite)
    await guest.getByLabel('닉네임', { exact: true }).fill('민서')
    await guest.getByRole('button', { name: '방 입장하기' }).click()
    await expect(guest.getByRole('alert')).toContainText('사용 중인 닉네임')
    await guest.getByLabel('닉네임', { exact: true }).fill('지훈')
    await guest.getByRole('button', { name: '방 입장하기' }).click()
    await expect(guest.getByRole('grid')).toBeVisible()
    await expect(guest.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await expect(host.getByRole('grid')).toBeVisible()
    await expect(host.getByText('민서 (나)', { exact: true })).toBeVisible()
    await expect(guest.getByText('지훈 (나)', { exact: true })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'D3, 놓을 수 없음', exact: true })).toBeDisabled()

    // 이미 두 명이 들어간 초대 링크에서는 세 번째 사람에게 입장 폼을 제공하지 않습니다.
    await third.goto(invite)
    await expect(third.getByRole('alert')).toContainText('이미 두 사람이')
    await expect(third.getByRole('button', { name: '방 입장하기' })).toHaveCount(0)

    // 흑 착수 → 상대 화면 반영 → 백 착수까지 확인합니다. 단순 API 응답뿐 아니라 실제 화면 동기화를 검증합니다.
    await host.getByRole('button', { name: 'D3, 놓을 수 있음', exact: true }).click()
    await expect(guest.getByText('내 차례', { exact: true })).toBeVisible()
    await expect(guest.getByRole('button', { name: 'D4, 흑 돌', exact: true })).toBeVisible()
    await guest.getByRole('button', { name: 'C3, 놓을 수 있음', exact: true }).click()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
    // 같은 탭 새로고침 후에도 참가 토큰으로 복귀하여 이미 진행한 보드가 보여야 합니다.
    await host.reload()
    await expect(host.getByRole('grid')).toBeVisible()
    await expect(host.getByRole('button', { name: 'C3, 백 돌, 마지막 수', exact: true })).toBeVisible()
    await expect(guest.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    // 모바일에서 가로 스크롤이 생기지 않는지 확인하고 점검용 스크린샷을 저장합니다.
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await host.screenshot({ path: 'test-results/game-desktop.png', fullPage: true })
    await guest.screenshot({ path: 'test-results/game-mobile.png', fullPage: true })
    // 퇴장 확인창을 수락하면 본인은 홈으로, 남은 상대는 종료 안내로 전환되어야 합니다.
    guest.once('dialog', dialog => dialog.accept())
    await guest.getByRole('button', { name: '방 나가기' }).click()
    await expect(guest.getByRole('heading', { name: '우리, 한 판 놀까요?' })).toBeVisible()
    await expect(host.getByRole('alert')).toContainText('종료된 방')
    expect(errors).toEqual([])
    expect(stateRequests).toEqual([])
  // 테스트가 실패해도 열린 브라우저 context를 닫아 다음 테스트에 영향을 주지 않게 합니다.
  } finally {
    await Promise.all([hostContext.close(), guestContext.close(), thirdContext.close()])
  }
})

// 소켓만 끊어 HTTP 요청 실패와 구분합니다. 재연결 전에는 입력을 막고 최신 보드로 복귀해야 합니다.
test('a disconnected player cannot move and reconnects to the latest board without polling', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  let blocked = false
  let disconnect = async () => { throw new Error('아직 연결된 소켓이 없습니다.') }
  const stateRequests: string[] = []
  host.on('request', request => { if (request.url().endsWith('/state')) stateRequests.push(request.url()) })

  // 평소에는 실제 서버로 그대로 전달하고, 장애 구간에만 연결을 종료합니다.
  await host.routeWebSocket('**/ws/rooms/*', async socket => {
    if (blocked) { await socket.close({ code: 4000 }); return }
    const server = socket.connectToServer()
    disconnect = async () => { await Promise.all([socket.close({ code: 4000 }), server.close()]) }
  })

  try {
    await host.goto('/')
    await host.getByLabel('닉네임', { exact: true }).fill('흑기사')
    await host.getByRole('button', { name: '방 만들기', exact: true }).click()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await guest.goto(host.url())
    await guest.getByLabel('닉네임', { exact: true }).fill('백기사')
    await guest.getByRole('button', { name: '방 입장하기' }).click()
    await expect(host.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(4)

    // 본인 차례여도 연결이 끊기면 착수할 수 없습니다. 연결이 돌아오면 자동 재시도합니다.
    blocked = true
    await disconnect()
    await expect(host.getByText('연결이 끊겨 다시 연결하고 있어요.', { exact: true })).toBeVisible()
    await expect(host.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    blocked = false
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await host.getByRole('button', { name: 'D3, 놓을 수 있음', exact: true }).click()
    await expect(guest.getByText('내 차례', { exact: true })).toBeVisible()

    // 상대도 연결이 끊긴 사람을 기다려야 합니다. 두 사람 모두 복귀한 뒤 같은 차례에서 재개합니다.
    blocked = true
    await disconnect()
    await expect(host.getByRole('button', { name: '다시 연결', exact: true })).toBeVisible()
    await expect(guest.getByText('흑기사님의 연결을 기다리고 있어요.', { exact: true })).toBeVisible()
    await expect(guest.getByRole('button', { name: /놓을 수 있음/ })).toHaveCount(0)
    await expect(host.getByRole('button', { name: 'D3, 흑 돌, 마지막 수', exact: true })).toBeVisible()
    blocked = false
    await host.getByRole('button', { name: '다시 연결', exact: true }).click()
    await expect(host.getByText('실시간 연결됨', { exact: true })).toBeVisible()
    await guest.getByRole('button', { name: 'C3, 놓을 수 있음', exact: true }).click()
    await expect(host.getByRole('button', { name: 'C3, 백 돌, 마지막 수', exact: true })).toBeVisible()
    await expect(host.getByText('내 차례', { exact: true })).toBeVisible()
    expect(stateRequests).toEqual([])
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()])
  }
})

// 아주 작은 화면에서도 잘못된 주소에서 돌아오고 입력 오류를 고칠 수 있는지 확인합니다.
test('invalid links and nickname validation stay recoverable on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/room/bad-link')
  await expect(page.getByRole('heading', { name: '올바른 초대 링크가 아니에요' })).toBeVisible()
  await page.getByRole('button', { name: '새 방 만들기' }).click()
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('닉네임을 입력')
  await page.getByLabel('닉네임', { exact: true }).fill('a')
  await page.getByRole('button', { name: '방 만들기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('2~12자')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
