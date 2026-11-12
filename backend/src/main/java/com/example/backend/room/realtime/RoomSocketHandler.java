package com.example.backend.room.realtime;

import com.example.backend.room.RoomException;
import com.example.backend.room.RoomService;
import com.example.backend.room.recovery.RecoveryPolicy;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * WebSocket 연결, 참가자 인증, 메시지 수신을 담당합니다.
 * TextWebSocketHandler를 상속해 연결됨·메시지 도착·연결 종료 시 호출되는 메서드를 구현합니다.
 * 착수 규칙은 RoomService가, 같은 방 참가자에게 상태를 알리는 일은 RoomUpdates가 담당합니다.
 */
@Component
public class RoomSocketHandler extends TextWebSocketHandler {

    private final RoomService rooms;
    private final JsonMapper json;
    private final RecoveryPolicy recovery;
    // 여러 기기의 요청이 동시에 와도 안전하게 조회/제거할 수 있는 연결 ID → 연결 객체 저장소입니다.
    private final ConcurrentHashMap<String, RoomSocketConnection> connections =
        new ConcurrentHashMap<>();
    // 전송 작업마다 가벼운 가상 스레드를 사용해 느린 기기가 다른 기기의 전송을 막지 않게 합니다.
    private final ExecutorService writers = Executors.newVirtualThreadPerTaskExecutor();
    // 인증 제한 시간은 별도 예약 작업으로 관리합니다.
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();

    public RoomSocketHandler(RoomService rooms, JsonMapper json, RecoveryPolicy recovery) {
        this.rooms = rooms;
        this.json = json;
        this.recovery = recovery;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession socket) {
        // 브라우저 WebSocket API는 Authorization 헤더를 지정할 수 없어 첫 메시지로 인증합니다.
        // 토큰을 URL에 넣지 않으며, 인증 없이 연결만 유지하는 경우 5초 뒤 종료합니다.
        socket.setTextMessageSizeLimit(2048);
        RoomSocketConnection connection = new RoomSocketConnection(socket, json);
        connections.put(socket.getId(), connection);
        connection.start(writers);
        deadlines.schedule(
            () -> {
                // 시간 초과는 잘못된 토큰(401)과 다릅니다. 408로 보내 클라이언트가 참가 정보를 버리지 않고 재시도하게 합니다.
                if (connection.token() == null) {
                    connection.fail(
                        "AUTH_TIMEOUT",
                        "참가 인증 시간이 초과되었습니다. 다시 연결합니다.",
                        408
                    );
                }
            },
            5,
            TimeUnit.SECONDS
        );
    }

    @Override
    protected void handleTextMessage(WebSocketSession socket, TextMessage message) {
        // 먼저 연결 객체를 찾고 URL 마지막 부분에서 방 코드를 읽습니다.
        RoomSocketConnection connection = connections.get(socket.getId());
        if (connection == null) {
            return;
        }
        String[] path = socket.getUri().getPath().split("/");
        String code = path[path.length - 1];
        try {
            if (path.length == 6 && "games".equals(path[2])) {
                rooms.requireGameType(code, path[3]);
            }
            var body = json.readTree(message.getPayload());
            String type = body.path("type").asString("");
            if (connection.token() == null) {
                if (!"authenticate".equals(type)) {
                    connection.fail("INVALID_SESSION", "먼저 참가 인증이 필요합니다.", 401);
                    return;
                }
                String token = body.path("token").asString("");
                // subscribe는 방이 바뀔 때 connection.state를 호출하도록 등록합니다.
                // 반환된 Runnable은 나중에 run()을 호출하면 등록을 취소하는 정리 함수입니다.
                Runnable unsubscribe = rooms.subscribe(code, token, connection::state);
                connection.authenticated(token, unsubscribe);
            } else if ("ping".equals(type)) {
                // 연결 확인 때도 만료/퇴장 여부를 검사합니다. 인증 토큰을 계속 재전송할 필요는 없습니다.
                rooms.state(code, connection.token());
                connection.heardFromClient();
                connection.pong();
            } else {
                connection.fail("INVALID_MESSAGE", "지원하지 않는 실시간 요청입니다.", 400);
            }
        } catch (RoomException exception) {
            connection.fail(exception.code(), exception.getMessage(), exception.status().value());
        } catch (RuntimeException exception) {
            connection.fail("INVALID_MESSAGE", "실시간 요청 형식을 확인해 주세요.", 400);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession socket, CloseStatus status) {
        RoomSocketConnection connection = connections.remove(socket.getId());
        if (connection != null) {
            connection.dispose();
        }
    }

    @Override
    public void handleTransportError(WebSocketSession socket, Throwable exception)
        throws Exception {
        afterConnectionClosed(socket, CloseStatus.SERVER_ERROR);
        socket.close(CloseStatus.SERVER_ERROR);
    }

    // 케이블 분리/절전처럼 close 이벤트가 오지 않는 단절도 클라이언트의 heartbeat가 멈추면 감지합니다.
    @Scheduled(fixedDelayString = "${room.recovery.check-interval-ms:1000}")
    public void expireSilentConnections() {
        long now = System.nanoTime();
        connections.forEach((id, connection) -> {
            if (
                connection.heartbeatExpired(now, recovery.heartbeatTimeout().toNanos()) &&
                connections.remove(id, connection)
            ) {
                connection.dispose();
                // 느린 소켓의 close 전송이 다른 방의 기한 점검을 지연시키지 않게 별도 작업으로 닫습니다.
                writers.execute(connection::closeSocket);
            }
        });
    }

    @PreDestroy
    public void shutdown() {
        // 서버 종료 직전에 실행됩니다. 연결 구독과 백그라운드 작업을 함께 종료합니다.
        connections.values().forEach(RoomSocketConnection::dispose);
        connections.clear();
        writers.shutdownNow();
        deadlines.shutdownNow();
    }
}
