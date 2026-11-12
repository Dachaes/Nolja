import styles from './RulesHelp.module.scss'

// 브라우저 기본 details/summary로 접고 펼치는 규칙 안내를 구현해 별도 상태 관리가 필요 없습니다.
// board-instructions는 보드의 aria-describedby와 연결되는 키보드 사용 설명입니다.
export function RulesHelp() {
  return (
    <details className={styles.rules}>
      <summary>오셀로, 어떻게 두나요?</summary>
      <ul>
        <li>흑이 먼저 두고, 백과 번갈아 한 수씩 둡니다.</li>
        <li>
          상대 돌을 내 돌 사이에 가로·세로·대각선으로 끼우면 뒤집을 수 있어요. 한 개 이상 뒤집는
          곳에만 둘 수 있습니다.
        </li>
        <li>둘 곳이 없으면 자동으로 차례를 넘깁니다. 둘 수 있다면 패스할 수 없어요.</li>
        <li>두 사람 모두 둘 수 없으면 종료! 보드에 돌이 더 많은 쪽이 이깁니다.</li>
      </ul>
      <p id="board-instructions">
        보드에서 방향키로 이동하고 Enter 또는 Space로 돌을 놓을 수 있어요.
      </p>
    </details>
  )
}
