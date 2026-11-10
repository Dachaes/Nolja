import { defineConfig } from '@playwright/test'

// 필요하면 테스트 전용 포트를 지정해 개발자가 실행 중인 서버와 분리합니다.
const baseURL = process.env.NOLLJA_E2E_BASE_URL ?? 'http://127.0.0.1:5173'
const port = new URL(baseURL).port || '5173'

// 실제 브라우저로 사용자 흐름을 검증하는 E2E 테스트 설정입니다.
// 백엔드는 별도로 실행해야 하며, 아래 webServer는 프런트엔드만 준비합니다.
export default defineConfig({
  testDir: './tests/e2e',
  // 서버를 공유하는 시나리오를 순서대로 실행해 동시에 발생하는 테스트 간 영향을 줄입니다.
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    // 테스트의 page.goto('/') 같은 상대 경로가 기준으로 사용하는 주소입니다.
    baseURL,
    browserName: 'chromium',
    // Windows에서는 설치된 Edge를, 다른 환경에서는 Playwright의 Chromium을 사용합니다.
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    // 실패 시 원인을 확인할 수 있도록 스크린샷과 실행 추적 자료를 남깁니다.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // 5173에서 이미 실행 중이면 재사용하고, 없으면 새 개발 서버를 시작합니다.
    // strictPort는 포트 충돌 시 다른 번호로 넘어가 테스트 주소가 어긋나는 일을 막습니다.
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
  },
})
