import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 브라우저 테스트는 별도 서버 포트로 실행할 수 있습니다. 일반 개발은 기존 8080을 사용합니다.
const backendTarget = process.env.NOLJA_API_TARGET ?? 'http://127.0.0.1:8080'

// 개발 서버와 프로덕션 번들에 공통으로 적용되는 Vite 설정입니다.
export default defineConfig({
  // React JSX 변환과 개발 중 빠른 화면 갱신을 지원합니다.
  plugins: [react()],
  server: {
    // 같은 Wi-Fi의 휴대폰 등 외부 기기가 PC의 개발 서버에 접속할 수 있도록 합니다.
    host: '0.0.0.0',
    // 브라우저는 프런트엔드 주소의 /api만 요청하고, Vite가 백엔드 8080으로 전달합니다.
    // 개발용 프록시이므로 실제 배포 환경에서는 웹 서버에 대응하는 프록시를 설정해야 합니다.
    proxy: {
      // WebSocket Upgrade를 전달합니다. Host를 유지해야 서버의 동일 출처 검사와 일치합니다.
      '/ws': { target: backendTarget, ws: true, changeOrigin: false },
      '/api': { target: backendTarget, changeOrigin: true },
    },
  },
})
