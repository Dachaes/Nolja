import styles from './GameActions.module.scss'

// 힌트 상태와 퇴장 처리는 부모가 관리합니다. 여기서는 사용자 조작을 콜백으로 알립니다.
interface GameActionsProps {
  showHints: boolean
  onToggleHints: () => void
  onLeave: () => void
  leaving: boolean
}

// 퇴장 요청 중에는 버튼을 막고, 체크박스는 전달받은 showHints를 그대로 표시하는 제어 입력입니다.
export function GameActions({ showHints, onToggleHints, onLeave, leaving }: GameActionsProps) {
  return (
    <div className={styles.actions}>
      <label className={styles.hints}>
        <input type="checkbox" checked={showHints} onChange={onToggleHints} />
        놓을 수 있는 곳 표시
      </label>
      <button type="button" className={styles.leave} disabled={leaving} onClick={onLeave}>
        {leaving ? '나가는 중…' : '방 나가기'}
      </button>
    </div>
  )
}
