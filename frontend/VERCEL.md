# Vercel 프런트엔드 배포

## 프로젝트 설정

1. 소스를 커밋·푸시한 뒤 Vercel에서 Add New → Project로 저장소를 가져옵니다.
2. **Root Directory: `frontend`**, **Framework Preset: Vite**, **Node.js Version: 24.x**를 지정합니다.
3. 백엔드가 배포되어 있다면 아래 환경 변수를 설정한 뒤 Deploy를 누릅니다.

`vercel.json`에 설치 `npm ci`, 빌드 `npm run build`, 출력 `dist`가 지정되어 있습니다. `/games/*`, `/room/*` 직접 접속과 새로고침을 지원합니다. 해시가 붙는 `/assets/*`는 장기 캐시합니다.

## 환경 변수

| 설정 위치 | 이름 | 예시 |
| --- | --- | --- |
| Vercel 프런트엔드 | `VITE_BACKEND_ORIGIN` | `https://api.example.com` |
| 별도 백엔드 서버 | `FRONTEND_ALLOWED_ORIGINS` | `https://doran.vercel.app` |

예시는 실제 배포 주소로 바꾸세요. 프런트 변수에는 `https://`를 포함한 백엔드 출처만 입력하고 `/api`, `/ws` 등의 경로는 붙이지 않습니다. HTTP 요청은 `/api/rooms`, 실시간 연결은 `wss://.../ws/rooms/...`으로 자동 구성됩니다.

백엔드 허용 출처에는 실제 프런트엔드 주소를 경로와 마지막 `/` 없이 입력합니다. 여러 주소는 쉼표로 구분합니다. 예: `https://doran.vercel.app,https://doran.example.com`. Preview 배포도 연결하려면 해당 출처를 명시적으로 추가하고 백엔드를 재시작합니다.

Vercel에서는 필요한 Production / Preview 환경에 변수를 각각 설정합니다. `VITE_` 변수는 빌드 시 공개 번들에 포함되므로 비밀키를 넣지 마세요. 값을 변경한 뒤에는 **Redeploy**해야 합니다.

로컬 환경 변수 예시는 `.env.example`입니다. 필요하면 `.env.local`로 복사합니다. 비워 두면 기존 Vite 프록시를 사용합니다. `NOLJA_API_TARGET`은 로컬 개발 프록시 대상이며 Vercel 정적 배포에는 적용되지 않습니다.

## 백엔드와 DB

Vercel에는 프런트엔드만 배포합니다. Spring Boot / Java 25 LTS 백엔드는 HTTPS와 WebSocket 연결을 지원하는 별도 서버에서 실행해야 합니다. 브라우저가 백엔드로 직접 연결합니다.

백엔드 주소가 없으면 화면 배포는 가능하지만 방 생성·입장·실시간 대전은 동작하지 않습니다. `localhost`를 배포 환경 변수로 입력해도 개발 PC의 서버에 연결되지 않습니다.

현재 DB는 사용하지 않습니다. 방과 게임 상태는 서버 메모리에 저장되므로 재시작하면 사라집니다. 백엔드는 단일 인스턴스로 운영해야 하며 여러 인스턴스 간 상태는 공유되지 않습니다.

## 배포 확인

1. `/`, `/games/othello`를 열고 새로고침합니다.
2. 방 생성 후 다른 브라우저에서 초대 링크로 입장합니다.
3. 양쪽 착수와 새로고침 후 재연결을 확인합니다.
4. 연결 실패 시 백엔드 주소, HTTPS 인증서, 허용 출처와 WebSocket 지원을 확인합니다.

로컬 검증: `npm ci`, `npm run build`, `npm run lint`, `npm test`.

공식 참고: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
