# 도란 프런트엔드

React + TypeScript + Vite로 구성되어 있습니다.

## 로컬 실행

Node.js 24 설치 후 `frontend`에서 실행합니다.

```bash
npm ci
npm run dev
```

백엔드는 별도 터미널에서 실행합니다. 개발 서버는 `/api`, `/ws`를 기본적으로 `http://127.0.0.1:8080`으로 전달합니다.

## 배포와 검사

Vercel 설정 및 환경 변수는 [배포 안내](./VERCEL.md)를 참고하세요.

```bash
npm run build
npm run lint
npm test
```

