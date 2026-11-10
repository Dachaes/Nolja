import type { Page } from '@playwright/test'

// HTML/JS는 정상 제공하고 대국 소켓만 막아, 새로고침 후 앱은 열리지만 서버 연결은 실패하는 상황을 만듭니다.
export async function controlRoomConnection(page: Page) {
  let blocked = false
  let disconnect = async () => { throw new Error('아직 연결된 소켓이 없습니다.') }
  await page.routeWebSocket('**/ws/rooms/*', async socket => {
    if (blocked) { await socket.close({ code: 4000 }); return }
    const server = socket.connectToServer()
    disconnect = async () => { await Promise.all([socket.close({ code: 4000 }), server.close()]) }
  })
  return {
    async block() { blocked = true; await disconnect() },
    allow() { blocked = false },
  }
}
