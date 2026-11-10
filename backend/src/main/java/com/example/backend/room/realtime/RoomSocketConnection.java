package com.example.backend.room.realtime;

import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;
import com.example.backend.room.RoomDtos.RoomView;

/** 한 기기의 전송 대기열과 구독 수명을 담당합니다. 모든 전송은 하나의 작업에서 순서대로 실행합니다. */
final class RoomSocketConnection {
    private final WebSocketSession socket;
    private final JsonMapper json;
    private final ArrayBlockingQueue<RoomSocketMessage> outgoing = new ArrayBlockingQueue<>(32);
    private Runnable unsubscribe = () -> {};
    private Future<?> writer;
    private boolean stopped;
    private boolean ending;
    private String token;
    private long lastReceivedNanos = System.nanoTime();

    RoomSocketConnection(WebSocketSession socket, JsonMapper json) { this.socket = socket; this.json = json; }

    synchronized void start(ExecutorService executor) { writer = executor.submit(this::writeMessages); }
    synchronized String token() { return token; }

    // 한 연결은 최초 인증한 참가자에 고정됩니다. 인증 전에는 방의 어떤 정보도 보내지 않습니다.
    void authenticated(String token, Runnable unsubscribe) {
        boolean alreadyStopped;
        synchronized (this) {
            alreadyStopped = stopped;
            if (!stopped) { this.token = token; this.unsubscribe = unsubscribe; heardFromClient(); }
        }
        // 구독 해제는 RoomService의 잠금을 사용하므로 소켓 잠금 밖에서 실행해야 교착 상태를 피합니다.
        if (alreadyStopped) unsubscribe.run();
    }

    synchronized void heardFromClient() { lastReceivedNanos = System.nanoTime(); }
    synchronized boolean heartbeatExpired(long nowNanos, long timeoutNanos) {
        return token != null && !stopped && nowNanos - lastReceivedNanos >= timeoutNanos;
    }

    // 네트워크가 닫힘 이벤트를 주지 않는 경우에도 서버가 소켓을 정리할 수 있습니다.
    void closeSocket() {
        try { socket.close(CloseStatus.GOING_AWAY); } catch (IOException ignored) { }
    }

    void state(RoomView room) { enqueue(RoomSocketMessage.state(room), "closed".equals(room.status())); }
    void pong() { enqueue(RoomSocketMessage.pong(), false); }
    void fail(String code, String message, int status) { enqueue(RoomSocketMessage.failure(code, message, status), true); }

    // 서비스의 잠금 안에서는 큐에만 넣습니다. 네트워크 쓰기는 별도 가상 스레드가 수행합니다.
    // 매우 느린 기기는 중간 상태를 생략하고 최신 완성 보드를 받게 해 메모리를 제한합니다.
    private synchronized void enqueue(RoomSocketMessage message, boolean terminal) {
        if (stopped || ending) return;
        if (!outgoing.offer(message)) {
            // 연결 확인 응답 때문에 아직 전달하지 못한 실제 보드를 버리지 않습니다.
            if ("pong".equals(message.type())) return;
            outgoing.clear();
            outgoing.offer(message);
        }
        if (terminal) ending = true;
    }

    private void writeMessages() {
        try {
            while (socket.isOpen()) {
                RoomSocketMessage message = outgoing.take();
                socket.sendMessage(new TextMessage(json.writeValueAsString(message)));
                if ("error".equals(message.type()) || (message.room() != null && "closed".equals(message.room().status()))) {
                    socket.close(CloseStatus.NORMAL);
                    break;
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            // 소켓 쓰기 실패는 게임 상태를 롤백하지 않습니다. 재접속하면 서버의 최신 상태를 받습니다.
            try { socket.close(CloseStatus.SERVER_ERROR); } catch (IOException ignored) { }
        } finally { dispose(); }
    }

    // 여러 종료 경로에서 호출되어도 한 번만 구독과 대기 작업을 정리합니다.
    void dispose() {
        Runnable cleanup;
        Future<?> pendingWriter;
        synchronized (this) {
            if (stopped) return;
            stopped = true;
            cleanup = unsubscribe;
            pendingWriter = writer;
            outgoing.clear();
        }
        // 서비스 → 소켓 알림과 소켓 → 서비스 해제가 서로의 잠금을 잡고 기다리지 않게 합니다.
        cleanup.run();
        if (pendingWriter != null) pendingWriter.cancel(true);
    }
}
