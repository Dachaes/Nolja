# Doran(도란) 방 서버

Java 21, Spring Boot, Maven을 사용합니다. 데이터베이스 없이 방과 게임을 단일 서버 메모리에 저장합니다.

## 실행

Git Bash에서 프로젝트 루트 기준:

```bash
cd backend
export JAVA_HOME=../.tools/jdk-21.0.13.0.2+1
export PATH="$JAVA_HOME/bin:$PATH"
./mvnw spring-boot:run
```

위 `JAVA_HOME`은 현재 프로젝트의 로컬 Java 21 경로입니다. 해당 폴더는 Git에서 제외됩니다. 시스템에 Java 21이 설정되어 있다면 `cd backend` 후 `./mvnw spring-boot:run`만 실행하면 됩니다. 종료는 실행 중인 Git Bash에서 `Ctrl+C`입니다.

PowerShell에서는 다음 명령을 사용합니다.

```powershell
cd backend
$env:JAVA_HOME = (Get-ChildItem ..\.tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\mvnw.cmd spring-boot:run
```

기본 포트는 8080입니다. 프런트엔드 Vite 서버가 `/api` HTTP 요청과 `/ws` WebSocket 연결을 이 서버로 전달합니다. 연결 복구 상태 필드가 추가되었으므로 변경 후 백엔드와 프런트엔드를 함께 재시작해야 합니다.

## API

| 메서드 | 경로 | 내용 |
| --- | --- | --- |
| POST | `/api/rooms` | `{ nickname }`으로 방 생성, 흑 참가자와 토큰 발급 |
| GET | `/api/rooms/{code}` | 공개 초대 정보, 입장 가능 여부 |
| POST | `/api/rooms/{code}/players` | `{ nickname }`으로 백 참가자와 토큰 발급 |
| GET | `/api/rooms/{code}/state` | 인증한 참가자의 최신 방·보드 조회 |
| POST | `/api/rooms/{code}/moves` | `{ row, col, revision }` 착수, 좌표는 0부터 |
| PUT | `/api/rooms/{code}/rematch` | `{ gameNumber, ready }` 본인의 재대결 동의 설정/취소 |
| DELETE | `/api/rooms/{code}/players/me` | 참가자가 방 나가기, 방 종료 |

참가 후 요청에는 `Authorization: Bearer <token>`이 필요합니다. 토큰은 입장 응답에만 포함되며 초대 URL, 공개 방 정보, 일반 상태 응답에 포함하지 않습니다.

`playerId`는 참가자를 식별하고 `nickname`은 표시용입니다. 계정은 사용하지 않으며 호환용 `userId`는 `null`입니다. 방 정원은 2명이며 같은 방 안에서 닉네임 중복을 검사합니다.

## 실시간 통신

`/ws/rooms/{code}`는 같은 출처에서 연결하는 WebSocket 주소입니다. 토큰을 URL에 넣지 않고 연결 후 첫 JSON 메시지로 전달합니다.

```json
{ "type": "authenticate", "token": "입장 시 발급받은 참가 토큰" }
```

5초 안에 인증하지 않거나 다른 방의 토큰을 보내면 오류 메시지 후 연결을 닫습니다. 인증 전에는 방 정보를 전송하지 않습니다. 토큰이 유효하면 현재 상태를 보내고 이후 같은 방의 입장·착수·재대결 동의·취소·시작·퇴장을 전송합니다.

| 방향 | 메시지 | 용도 |
| --- | --- | --- |
| 서버 → 브라우저 | `{ "type": "room", "room": RoomView }` | 최초 상태 및 변경된 전체 상태. `revision` 포함 |
| 브라우저 → 서버 | `{ "type": "ping" }` | 연결 및 방·참가 토큰의 유효성 확인 |
| 서버 → 브라우저 | `{ "type": "pong" }` | 연결 확인 응답 |
| 서버 → 브라우저 | `{ "type": "error", "error": { "code": "…", "message": "…" }, "status": 401 }` | 인증 실패·만료 등의 안내 후 종료 |

위 표는 메시지별 주요 필드이며 사용하지 않는 필드는 `null`입니다. `room`에는 참가 토큰을 포함하지 않습니다. 착수 명령은 기존 `POST /moves`로 받고, 서버가 검증을 마친 상태만 소켓으로 보냅니다. `/state`는 필요할 때 한 번 확인하는 용도로 남겨 두며 정상 게임 중에는 주기적으로 조회하지 않습니다.

구독 등록과 최초 상태 전달을 방 서비스의 같은 잠금 안에서 처리해 연결 순간의 변경을 놓치지 않습니다. 네트워크 전송은 기기별 큐와 가상 스레드로 분리하므로 느린 기기가 방 서비스를 붙잡지 않습니다. 큐가 가득 차면 중간 상태를 생략하고 최신 전체 상태를 보냅니다. 프런트엔드도 `revision`을 비교해 늦은 HTTP 응답이 최신 보드를 덮어쓰지 않도록 합니다.

연결이 끊기면 클라이언트가 다시 인증하고 현재 전체 상태를 받습니다. 소켓 종료 즉시 퇴장시키지 않고 아래의 복귀 유예를 적용합니다.

## 연결 상태와 복구 기한

`RoomView`에는 참가자별 `presence: [{ playerId, connected, reconnectDeadline }]`, 종료 사유 `closeReason`, 시계 보정용 `serverTime`이 포함됩니다.

- 입장 HTTP 응답 후 첫 소켓 인증까지 자리를 예약합니다. 두 사람이 모두 연결되어야 착수할 수 있습니다.
- 한 참가자에게 소켓 ID 여러 개를 기록합니다. 새로고침으로 새 연결이 먼저 열려도 이전 연결 종료가 새 연결을 지우지 않습니다.
- 마지막 소켓 종료 시 복귀 기한을 설정합니다. close 이벤트 없는 단절은 클라이언트 heartbeat의 무수신 시간으로 감지합니다.
- 기한 내 복귀하면 같은 참가 ID·토큰·돌 색상·보드·차례·재대결 동의를 유지합니다. 접속 상태 변경도 `revision`을 올려 양쪽에 전파합니다.
- 한 사람이라도 연결이 없으면 착수를 `PLAYER_DISCONNECTED`로 거절합니다. 새 재대결 동의도 막되 본인의 기존 동의 취소는 허용합니다.
- 기한이 지나면 `status=closed`, `closeReason=reconnect_timeout`으로 전환하고 마지막 보드를 보존합니다. 단절을 임의의 기권승/패로 처리하지 않습니다. 두 사람 모두 끊겼어도 서버 타이머가 종료합니다.
- 기한 확인과 재접속 등록을 같은 서비스 잠금 안에서 처리하므로 경계 시각의 늦은 재접속으로 방이 다시 열리지 않습니다.
- 명시적 퇴장은 `closeReason=left`, 전체 방 만료는 `expired`입니다. 닫힌 방의 조회와 소켓 인증은 기존 참가 토큰으로만 허용하며 최종 상태 한 번을 전달한 뒤 소켓을 닫습니다. 입장·착수·재대결은 410입니다.

기본 설정은 `src/main/resources/application.properties`에서 조절합니다.

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| `room.recovery.grace-period-ms` | 120000 | 단절 확인 후 복귀 유예 2분 |
| `room.recovery.heartbeat-timeout-ms` | 45000 | 클라이언트 heartbeat 무수신 제한 45초 |
| `room.recovery.check-interval-ms` | 1000 | 서버의 기한 점검 주기 1초 |

소켓 잠금 밖에서 서비스 구독을 해제해 상태 전송과 종료가 동시에 일어나도 서로의 잠금을 기다리지 않게 합니다. 서버 메모리는 재시작 시 없어지며 이 기능은 서버 재시작 후의 영구 복구를 제공하지 않습니다.

## 재대결과 로비 복귀

종료된 게임에서 `PUT /api/rooms/{code}/rematch`를 호출합니다. 입력 예:

```json
{ "gameNumber": 1, "ready": true }
```

- `ready=true`는 동의, `ready=false`는 본인 동의 취소입니다. 토큰으로 참가자를 결정하며 다른 사람의 동의는 바꿀 수 없습니다.
- 응답과 소켓 상태에 `gameNumber`, `rematchReadyPlayerIds`가 포함됩니다. 한 사람만 동의하면 최종 보드를 유지합니다.
- 같은 입력을 반복해도 한 번만 반영합니다. 두 사람이 동의하면 같은 잠금 안에서 흑백 교대·초기 보드 설정·게임 번호 증가·동의 목록 비우기를 수행합니다.
- 참가 ID·닉네임·인증 토큰·방 주소는 유지합니다. 점수·차례·마지막 수·패스는 초기 보드 상태로 돌아갑니다.
- `revision`은 새 판에서도 초기화하지 않습니다. 지난 판의 착수는 `STALE_ROOM`, 지난 판의 재대결 요청은 `STALE_GAME`으로 거절합니다.
- 재대결 요청에 `revision` 대신 `gameNumber`를 사용하는 이유는 첫 동의로 방 버전이 바뀌어도 동시에 보낸 상대의 정상 동의를 받아야 하기 때문입니다.
- 로비 복귀는 기존 퇴장 API를 사용해 방을 닫고 동의 목록을 비웁니다. 마지막 보드는 종료 메시지에 남기므로 상대 화면에서 결과를 계속 볼 수 있습니다. 기존 참가자는 같은 토큰으로 `/state` 또는 소켓에서 최종 상태를 복구할 수 있습니다.

재대결은 기존 방의 6시간 만료 시간을 연장하지 않습니다. 현재 방의 결과만 표시하며 전적을 영구 저장하지 않습니다.

## 상태와 범위

- `waiting` → 상대 입장 → `playing` → 양쪽 모두 착수 불가 → `finished`.
- `finished` → 두 참가자 재대결 동의 → 흑백 교대 후 `playing`.
- 어느 참가자든 명시적으로 나가면 방을 닫고 상대에게 종료를 알립니다.
- 방 유효 시간은 생성 후 6시간입니다. 동시 입장은 원자적으로 처리합니다.
- 서버가 차례와 규칙을 검증합니다. `revision`으로 중복·오래된 착수를 거절합니다.
- 방은 최대 1,000개이며 만료 방은 주기 점검과 새 방 생성 시 정리합니다.
- 서버 재시작 시 방·게임이 사라집니다. 현재는 단일 서버 메모리로 운영합니다.
- 탭을 닫는 것은 명시적인 방 나가기와 다릅니다. 참가 정보를 유지한 재접속은 유예 기한 안에 가능하며, 돌아오지 않으면 승패 판정 없이 방을 종료합니다.

## 폴더

- `room/`: 방 컨트롤러, 서비스, API DTO, 오류 응답.
- `room/recovery/RoomPresence`: 참가자별 소켓 수명과 복귀 기한.
- `room/recovery/RecoveryPolicy`, `RecoveryConfig`, `RoomRecoveryMonitor`: 복구 설정과 서버의 주기적인 기한 확인.
- `room/rematch/RematchVotes`: 참가 ID별 재대결 동의·취소·전원 동의 확인. 방 전환과 잠금은 `RoomService`가 담당합니다.
- `room/realtime/RoomUpdates`: 방별 구독 등록·해제와 상태 알림.
- `room/realtime/RoomSocketHandler`: 최초 인증, 메시지 분기, 연결 정리.
- `room/realtime/RoomSocketConnection`: 기기별 전송 큐와 순차 전송.
- `room/realtime/RoomSocketConfig`, `RoomSocketMessage`: 접속 경로와 전송 형식.
- `othello/`: 서버의 게임 상태와 순수 규칙 엔진.
- `src/test/.../room/`: 방 서비스, 동시 입장, 두 HTTP 클라이언트 통합 테스트.
- `src/test/.../room/RoomRecoveryTests`: 조작 가능한 시계로 복귀 직전/경계, 중복 소켓 종료, 양쪽 단절과 종료 후 조회 검증.
- `src/test/.../room/realtime/RoomHeartbeatTests`: 실제 소켓의 무응답 감지, 복귀 기한 자동 종료와 최종 상태 재전송 검증.
- `src/test/.../room/realtime/`: 실제 WebSocket 인증·출처 검사, 방 격리, 입장·착수·퇴장 전송, 재접속, 한 판 전체의 양쪽 보드 일치 검사.
- `src/test/.../room/rematch/`: 인증·종료 상태 검사, 중복/취소 요청, 동시 동의, 흑백 교대, 지난 판 요청 거절, 수락과 퇴장 경합 검사.
- `src/test/.../othello/`: 규칙 및 100판 시뮬레이션 테스트.

## 테스트

Java 21의 `JAVA_HOME`을 설정한 뒤 `./mvnw -B -ntp test`를 실행합니다. 프로젝트 로컬 JDK를 사용하는 PowerShell 예:

```powershell
$env:JAVA_HOME = (Get-ChildItem ../.tools -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
.\mvnw.cmd -B -ntp test
```

배포할 때는 프런트엔드와 같은 도메인의 `/api`, `/ws`를 이 서버로 프록시하고, 프런트엔드 `/room/*` 요청을 SPA의 `index.html`로 연결해야 합니다. `/ws`에는 WebSocket의 `Upgrade`·`Connection` 헤더와 원래 `Host`를 전달해야 합니다. HTTPS 페이지는 자동으로 `wss:`를 사용합니다. 프록시가 TLS를 종료하는 경우 Spring이 원래 HTTPS 출처를 알 수 있도록, 신뢰하는 프록시에서만 전달 헤더를 설정·처리하세요.

위 설명은 동일 출처 프록시 배포 방식입니다. Vercel에 프런트엔드를 별도로 배포할 때는 프런트엔드의 `VITE_BACKEND_ORIGIN`에 백엔드 HTTPS 출처를 지정하고, 백엔드의 `FRONTEND_ALLOWED_ORIGINS`에 프런트엔드 출처를 지정합니다. 예: `https://doran.vercel.app`. 여러 출처는 쉼표로 구분하며 경로나 마지막 `/`는 붙이지 않습니다. 변경 후 백엔드를 재시작합니다. HTTP CORS와 WebSocket에 같은 허용 목록이 적용됩니다. 비어 있으면 기존 동일 출처 방식으로 동작합니다. 자세한 절차는 [Vercel 배포 안내](../frontend/VERCEL.md)를 참고하세요.
