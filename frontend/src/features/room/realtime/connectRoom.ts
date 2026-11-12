import { isTerminalError, RoomApiError } from '../api/roomApi'
import { backendOrigin } from '../../../config/backend'
import type { Room, RoomSession } from '../types'
import { decodeRoomMessage, roomSocketUrl, type ConnectionStatus } from './protocol'

interface RoomConnectionOptions {
  code: string
  session: RoomSession
  onRoom: (room: Room) => void
  onStatus: (status: ConnectionStatus) => void
  onError: (error: RoomApiError | null) => void
}

// React와 분리된 연결 수명 관리자입니다. 오프라인/절전/페이지 복귀에서도 같은 참가 토큰으로 재인증합니다.
export function connectRoom({ code, session, onRoom, onStatus, onError }: RoomConnectionOptions) {
  let socket: WebSocket | null = null
  // dispose는 화면을 떠난 상태, terminal은 복구 불가능한 종료, suspended는 페이지 일시 중단입니다.
  let disposed = false
  let terminal = false
  let suspended = false
  let attempts = 0
  // 연결마다 번호를 바꿉니다. 이전 소켓에서 늦게 도착한 이벤트가 새 연결을 변경하지 못하게 합니다.
  let generation = 0
  let lastReceived = 0
  let status: ConnectionStatus = 'connecting'
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let readyTimeout: ReturnType<typeof setTimeout> | undefined

  function setStatus(next: ConnectionStatus) {
    status = next
    onStatus(next)
  }
  function clearTimers() {
    clearTimeout(retryTimer)
    clearTimeout(readyTimeout)
    clearInterval(heartbeat)
  }

  // close 이벤트가 늦거나 끝내 오지 않더라도 이전 연결의 이벤트와 착수 권한을 즉시 무효화합니다.
  function stopSocket() {
    ++generation
    clearTimers()
    const previous = socket
    socket = null
    if (previous && previous.readyState < WebSocket.CLOSING) {
      previous.close()
    }
  }

  function reconnect(error?: RoomApiError) {
    if (disposed || terminal || suspended) {
      return
    }
    stopSocket()
    if (error) {
      onError(error)
    }
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    setStatus('reconnecting')
    // 재시도 간격을 1초부터 늘려 최대 10초로 제한합니다. 장애 중 서버에 요청이 몰리는 것을 줄입니다.
    const delay = Math.min(1000 * 2 ** attempts, 10000)
    attempts = Math.min(attempts + 1, 4)
    retryTimer = setTimeout(open, delay)
  }

  function open() {
    if (disposed || terminal || suspended) {
      return
    }
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }
    stopSocket()
    const currentGeneration = generation
    const current = new WebSocket(
      roomSocketUrl(backendOrigin || window.location.origin, code, session.gameType),
    )
    socket = current
    const active = () => !disposed && !suspended && currentGeneration === generation

    // 인증 후 최초 전체 상태까지 받아야 connected가 됩니다. 저장된 보드만으로는 입력을 열지 않습니다.
    readyTimeout = setTimeout(() => {
      if (active()) {
        reconnect()
      }
    }, 8000)
    current.onopen = () => {
      if (!active()) {
        return
      }
      current.send(JSON.stringify({ type: 'authenticate', token: session.token }))
      lastReceived = Date.now()
      let lastPing = Date.now()
      heartbeat = setInterval(() => {
        // 15초마다 ping을 보내고, 45초 동안 아무 응답도 없으면 연결이 끊긴 것으로 판단합니다.
        if (!active()) {
          return
        }
        const now = Date.now()
        if (now - lastReceived >= 45000) {
          reconnect()
          return
        }
        if (current.readyState === WebSocket.OPEN && now - lastPing >= 15000) {
          current.send(JSON.stringify({ type: 'ping' }))
          lastPing = now
        }
      }, 1000)
    }
    current.onmessage = event => {
      if (!active()) {
        return
      }
      const message = decodeRoomMessage(String(event.data))
      if (!message || (message.type === 'room' && message.room.code !== code)) {
        reconnect(
          new RoomApiError(
            '실시간 응답을 확인할 수 없습니다. 다시 연결해 주세요.',
            'INVALID_MESSAGE',
          ),
        )
        return
      }
      lastReceived = Date.now()
      if (message.type === 'room' && message.room.gameType !== session.gameType) {
        terminal = true
        stopSocket()
        onError(
          new RoomApiError(
            '선택한 게임과 다른 방에 연결할 수 없습니다.',
            'GAME_TYPE_MISMATCH',
            409,
          ),
        )
        setStatus('closed')
        return
      }
      if (message.type === 'pong') {
        return
      }
      if (message.type === 'error') {
        const error = new RoomApiError(message.error.message, message.error.code, message.status)
        // 인증/없는 방/만료 등은 재시도로 해결되지 않습니다. 일시적인 서버 오류는 재연결합니다.
        if (isTerminalError(error) || error.status === 400) {
          terminal = true
          stopSocket()
          onError(error)
          setStatus('closed')
        } else {
          reconnect(error)
        }
        return
      }
      if (!message.room.players.some(player => player.playerId === session.playerId)) {
        terminal = true
        stopSocket()
        onError(new RoomApiError('저장된 참가 정보를 확인할 수 없습니다.', 'INVALID_SESSION', 401))
        setStatus('closed')
        return
      }
      clearTimeout(readyTimeout)
      attempts = 0
      onError(null)
      onRoom(message.room)
      if (message.room.status === 'closed') {
        // 종료된 방도 마지막 보드를 전달한 뒤 닫습니다. 새로고침 후 결과/종료 사유를 복구할 수 있습니다.
        terminal = true
        stopSocket()
        setStatus('closed')
      } else {
        setStatus('connected')
      }
    }
    current.onerror = () => {
      if (active()) {
        reconnect(new RoomApiError('실시간 연결을 다시 시도하고 있어요.', 'CONNECTION_LOST'))
      }
    }
    current.onclose = () => {
      if (active() && !terminal) {
        reconnect()
      }
    }
  }

  function retry() {
    if (disposed || terminal || suspended) {
      return
    }
    attempts = 0
    onError(null)
    setStatus(navigator.onLine ? 'connecting' : 'offline')
    open()
  }

  function offline() {
    if (disposed || terminal) {
      return
    }
    stopSocket()
    setStatus('offline')
  }
  function online() {
    retry()
  }
  // 브라우저의 뒤로/앞으로 캐시에서는 React가 언마운트되지 않을 수 있어 페이지 수명을 따로 처리합니다.
  function pageHidden() {
    suspended = true
    stopSocket()
  }
  function pageShown() {
    if (suspended) {
      suspended = false
      retry()
    }
  }
  function visible() {
    if (
      document.visibilityState === 'visible' &&
      (status !== 'connected' || Date.now() - lastReceived >= 15000)
    ) {
      retry()
    }
  }

  window.addEventListener('offline', offline)
  window.addEventListener('online', online)
  window.addEventListener('pagehide', pageHidden)
  window.addEventListener('pageshow', pageShown)
  document.addEventListener('visibilitychange', visible)
  setStatus(navigator.onLine ? 'connecting' : 'offline')
  // StrictMode에서 같은 작업 안에 정리된 effect가 불필요한 소켓을 만들지 않도록 한 번 미룹니다.
  queueMicrotask(open)

  return {
    retry,
    dispose() {
      disposed = true
      stopSocket()
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
      window.removeEventListener('pagehide', pageHidden)
      window.removeEventListener('pageshow', pageShown)
      document.removeEventListener('visibilitychange', visible)
    },
  }
}
