import type { ConnectionStatus as Status } from '../realtime/protocol'
import styles from './ConnectionStatus.module.scss'

// 연결 상태를 색상과 문구로 함께 알려줍니다. 연결이 끊긴 동안의 착수 제한은 RoomPage가 담당합니다.
export function ConnectionStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const label = { connecting: '대국에 연결하는 중…', connected: '실시간 연결됨', reconnecting: '연결이 끊겨 다시 연결하고 있어요.', offline: '인터넷 연결을 기다리고 있어요.', closed: '연결 종료' }[status]
  return <div className={`${styles.connection} ${status === 'connected' ? styles.connected : ''}`}>
    <p role="status"><span className={styles.dot} aria-hidden="true" />{label}</p>
    {status === 'reconnecting' && <button type="button" onClick={onRetry}>다시 연결</button>}
  </div>
}
