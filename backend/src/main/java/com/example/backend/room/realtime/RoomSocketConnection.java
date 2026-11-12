package com.example.backend.room.realtime;

import com.example.backend.room.RoomDtos.RoomView;
import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/**
 * 브라우저 한 곳과의 연결을 관리합니다. 보낼 메시지를 대기열에 넣고 하나의 전송 작업이 차례로 꺼냅니다.
 * 방 상태를 바꾸는 작업이 느린 네트워크 응답까지 기다리지 않도록 분리한 클래스입니다.
 * synchronized 메서드와 블록은 여러 스레드가 같은 연결 상태를 동시에 변경하지 못하게 합니다.
 */
final class RoomSocketConnection {

    private final WebSocketSession socket;
    private final JsonMapper json;
    // 메시지는 최대 32개만 보관합니다. 한도가 있어 느린 연결 때문에 메모리가 계속 늘지 않습니다.
    private final ArrayBlockingQueue<RoomSocketMessage> outgoing = new ArrayBlockingQueue<>(32);
    // 인증 전에는 취소할 구독이 없으므로 아무 일도 하지 않는 함수를 기본값으로 둡니다.
    private Runnable unsubscribe = () -> {};
    private Future<?> writer;
    private boolean stopped; // 이미 자원을 정리했는지 여부입니다.
    private boolean ending; // 마지막 메시지가 대기 중이면 새 메시지를 받지 않습니다.
    private String token;
    private long lastReceivedNanos = System.nanoTime();

    RoomSocketConnection(WebSocketSession socket, JsonMapper json) {
        this.socket = socket;
        this.json = json;
    }

    synchronized void start(ExecutorService executor) {
        // Future는 실행 중인 작업의 손잡이입니다. 연결 종료 시 cancel(true)로 대기를 중단합니다.
        writer = executor.submit(this::writeMessages);
    }

    synchronized String token() {
        return token;
    }

    // 한 연결은 최초 인증한 참가자에 고정됩니다. 인증 전에는 방의 어떤 정보도 보내지 않습니다.
    void authenticated(String token, Runnable unsubscribe) {
        boolean alreadyStopped;
        synchronized (this) {
            alreadyStopped = stopped;
            if (!stopped) {
                this.token = token;
                this.unsubscribe = unsubscribe;
                heardFromClient();
            }
        }
        // 구독 해제는 RoomService의 잠금을 사용하므로 소켓 잠금 밖에서 실행해야 교착 상태를 피합니다.
        if (alreadyStopped) {
            unsubscribe.run();
        }
    }

    synchronized void heardFromClient() {
        // nanoTime은 경과 시간 측정용입니다. 컴퓨터의 날짜 설정이 바뀌어도 제한 시간 계산에 적합합니다.
        lastReceivedNanos = System.nanoTime();
    }

    synchronized boolean heartbeatExpired(long nowNanos, long timeoutNanos) {
        // 인증 완료 후에만 메시지 무수신 시간을 검사합니다. 인증 전 제한은 handler가 별도로 관리합니다.
        return token != null && !stopped && nowNanos - lastReceivedNanos >= timeoutNanos;
    }

    // 네트워크가 닫힘 이벤트를 주지 않는 경우에도 서버가 소켓을 정리할 수 있습니다.
    void closeSocket() {
        try {
            socket.close(CloseStatus.GOING_AWAY);
        } catch (IOException ignored) {
            // 이미 끊어진 소켓은 종료 메시지를 보내지 못할 수 있습니다. 추가로 복구할 자원은 없습니다.
        }
    }

    void state(RoomView room) {
        // 방이 닫혔다면 최종 상태를 전송한 뒤 연결도 끝내도록 표시합니다.
        enqueue(RoomSocketMessage.state(room), "closed".equals(room.status()));
    }

    void pong() {
        // 클라이언트의 ping에 답해 양쪽이 아직 연결되어 있음을 확인합니다.
        enqueue(RoomSocketMessage.pong(), false);
    }

    void fail(String code, String message, int status) {
        // 오류 이유를 마지막으로 알려 준 뒤 연결을 닫습니다.
        enqueue(RoomSocketMessage.failure(code, message, status), true);
    }

    // 서비스의 잠금 안에서는 큐에만 넣습니다. 네트워크 쓰기는 별도 가상 스레드가 수행합니다.
    // 매우 느린 기기는 중간 상태를 생략하고 최신 완성 보드를 받게 해 메모리를 제한합니다.
    private synchronized void enqueue(RoomSocketMessage message, boolean terminal) {
        if (stopped || ending) {
            return;
        }
        if (!outgoing.offer(message)) {
            // 연결 확인 응답 때문에 아직 전달하지 못한 실제 보드를 버리지 않습니다.
            if ("pong".equals(message.type())) {
                return;
            }
            outgoing.clear();
            outgoing.offer(message);
        }
        if (terminal) {
            ending = true;
        }
    }

    private void writeMessages() {
        try {
            while (socket.isOpen()) {
                // take는 메시지가 없으면 기다립니다. 게임 계산을 담당하는 스레드는 기다리지 않습니다.
                RoomSocketMessage message = outgoing.take();
                socket.sendMessage(new TextMessage(json.writeValueAsString(message)));
                if (
                    "error".equals(message.type()) ||
                    (message.room() != null && "closed".equals(message.room().status()))
                ) {
                    socket.close(CloseStatus.NORMAL);
                    break;
                }
            }
        } catch (InterruptedException exception) {
            // 작업 취소로 깨어났다면 중단 표시를 복원해 상위 실행기도 종료 요청을 알 수 있게 합니다.
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            // 소켓 쓰기 실패는 게임 상태를 롤백하지 않습니다. 재접속하면 서버의 최신 상태를 받습니다.
            try {
                socket.close(CloseStatus.SERVER_ERROR);
            } catch (IOException ignored) {
                // 전송 실패 후 종료까지 실패해도 finally에서 내부 구독과 대기열은 정리합니다.
            }
        } finally {
            dispose();
        }
    }

    // 여러 종료 경로에서 호출되어도 한 번만 구독과 대기 작업을 정리합니다.
    void dispose() {
        Runnable cleanup;
        Future<?> pendingWriter;
        synchronized (this) {
            if (stopped) {
                return;
            }
            stopped = true;
            cleanup = unsubscribe;
            pendingWriter = writer;
            outgoing.clear();
        }
        // 서비스 → 소켓 알림과 소켓 → 서비스 해제가 서로의 잠금을 잡고 기다리지 않게 합니다.
        cleanup.run();
        if (pendingWriter != null) {
            pendingWriter.cancel(true);
        }
    }
}
