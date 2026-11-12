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

## 코드 정렬

들여쓰기는 프런트엔드 2칸, Java 4칸의 공백을 사용하며, 파일 인코딩은 UTF-8로 통일합니다.
`frontend`에서 아래 명령을 실행하면 프런트엔드 소스·설정·테스트와 백엔드 Java 소스·테스트를 함께 정렬하거나 검사합니다.

```bash
npm run format
npm run format:check
```

편집기의 기본 들여쓰기는 루트의 `.editorconfig`, 자동 정렬 규칙은 `.prettierrc.json`에 정의되어 있습니다.

