# Vercel 프런트엔드 배포

## Git 저장소 연결

1. 변경한 소스를 Git 저장소에 커밋하고 푸시합니다.
2. Vercel에서 **Add New → Project**로 저장소를 가져옵니다.
3. **Root Directory를 `frontend`로 지정합니다.** 루트의 backend 폴더는 배포 대상이 아닙니다.
4. Framework Preset은 **Vite**, Node.js Version은 **24.x**로 선택합니다.
5. Deploy를 누릅니다.

`frontend/vercel.json`에 설치 `npm ci`, 빌드 `npm run build`, 결과 폴더 `dist`를 지정했습니다. Vercel 대시보드에 다른 값을 설정했다면 위 값과 맞추세요. 이후 연결한 브랜치에 푸시하면 자동으로 다시 배포됩니다.

## 주소와 새로고침

`/`는 기본 index.html을 엽니다. `/games/othello`, `/room/ABCDEF`처럼 React가 처리하는 주소도 index.html로 연결하므로 직접 접속과 새로고침이 가능합니다. `/api`와 `/ws`는 HTML로 바꾸지 않습니다.

## 현재 배포 범위

지금은 공개 백엔드 주소가 없어 화면 배포만 준비되어 있습니다. 게임 선택과 닉네임 입력 화면은 볼 수 있지만, 방 생성·입장과 실시간 대전은 백엔드 연결 후 사용할 수 있습니다.

Vite의 `server.proxy`와 `NOLJA_API_TARGET`은 로컬 개발 서버용입니다. Vercel의 정적 배포에는 적용되지 않습니다. Vercel 환경 변수에 localhost 주소를 입력해도 개발 PC의 백엔드로 연결되지 않습니다.

백엔드를 배포하면 다음 설정을 이어서 적용합니다.

- Vercel의 `/api/*` 요청을 배포한 Spring 백엔드로 전달하도록 외부 rewrite 설정.
- WebSocket의 배포 주소와 Spring의 허용 Origin 설정. 현재 `/ws`는 같은 출처의 로컬 프록시를 사용합니다.

실제 백엔드 주소가 정해지면 방 생성·초대 링크 입장·WebSocket 연결까지 배포 환경에서 확인해야 합니다. DB와 외부 로그인 설정은 필요하지 않습니다.

## 로컬 빌드 확인

```bash
cd frontend
npm ci
npm run build
```

Vercel CLI를 사용하면 생성되는 `.vercel/` 폴더는 Git에서 제외됩니다. `vercel.json`, `package-lock.json`, 소스와 공개 정적 파일은 커밋합니다.

공식 참고: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Rewrites](https://vercel.com/docs/routing/rewrites).
