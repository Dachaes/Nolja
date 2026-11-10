# NOLLJA 오셀로 기본 색상

첨부 UI를 기준으로 따뜻한 밝은 배경, 세이지 그린 보드, 차분한 블루를 사용합니다.
실제 색상 토큰은 `frontend/src/styles/global.module.scss`의 `:root`에서 관리합니다.
각 컴포넌트의 `*.module.scss`에서는 `var(--color-...)`로 참조합니다.

| CSS 변수 | HEX | 용도 |
| --- | --- | --- |
| `--color-background` | `#F3F0ED` | 페이지 배경 |
| `--color-surface` | `#F7F4F1` | 밝은 배경, 결과·패스 안내 |
| `--color-text` | `#414440` | 로고, 닉네임, 점수 |
| `--color-muted` | `#747670` | 보조 설명, 방 나가기 |
| `--color-border` | `#D5D0CA` | 헤더 구분선, 패널 테두리 |
| `--color-board` | `#A2B39A` | 보드 기본 세이지 그린 |
| `--color-board-light` | `#ADBEA5` | 보드 그라데이션 밝은 면 |
| `--color-board-dark` | `#96A88E` | 보드 그라데이션 어두운 면 |
| `--color-grid` | `#5B6C54` | 보드 격자와 외곽선 |
| `--color-black` | `#282E28` | 흑돌 |
| `--color-black-highlight` | `#3C4339` | 흑돌의 밝은 면 |
| `--color-white` | `#F9F8F2` | 백돌 |
| `--color-white-shadow` | `#E3E3D9` | 백돌의 어두운 면 |
| `--color-primary` | `#678BA1` | 차례 배지, 초대 버튼, 마지막 수 표시 |
| `--color-primary-hover` | `#53778D` | 키보드 포커스 |
| `--color-on-primary` | `#FFFFFF` | 파란 배경 위 글자·아이콘 |
| `--color-hint` | `#536A4B` | 착수 가능 위치 표시 |
| `--color-shadow` | `#242B23` | 돌 그림자 |
| `--color-error` | `#A14F44` | 닉네임 입력 오류 |

## 적용 원칙

- 방 만들기·입장·초대 링크 복사 버튼은 기본 파란색을 사용하며, 활성 버튼에 마우스를 올리면 강조 파란색으로 바뀝니다.
- 착수 가능 표시는 힌트 색상에 불투명도 45%를 적용합니다.
- 돌 그림자·보드 강조는 위 색상의 투명도 변형을 사용합니다.
- 현재 차례는 색상 외에 `내 차례` / `상대 차례` 문구로 구분합니다.
- 시스템 다크 모드와 무관하게 첨부 이미지의 밝은 테마를 유지합니다.
- favicon과 HTML의 `theme-color`는 CSS 변수를 사용할 수 없어 같은 HEX 값을 직접 사용합니다.
