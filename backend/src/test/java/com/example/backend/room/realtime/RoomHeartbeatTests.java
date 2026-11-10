package com.example.backend.room.realtime;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.example.backend.room.RoomService;

// 실제 서버 타이머도 검증하되 테스트에서는 복구 시간을 줄여 2분을 기다리지 않습니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "room.recovery.heartbeat-timeout-ms=1500", "room.recovery.grace-period-ms=2000", "room.recovery.check-interval-ms=50"
})
class RoomHeartbeatTests {
    @LocalServerPort int port;
    @Autowired RoomService rooms;
    @Autowired JsonMapper json;
    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    @Timeout(15)
    void silentSocketIsDetectedAndTheDeadlineIsPushedWithoutClientPolling() throws Exception {
        var host = rooms.create("host");
        var guest = rooms.join(host.room().code(), "guest");
        try (Peer black = connect(host.room().code()); Peer silent = connect(host.room().code());
             var heartbeat = Executors.newSingleThreadScheduledExecutor()) {
            black.send("{\"type\":\"authenticate\",\"token\":\"" + host.token() + "\"}");
            black.awaitRoom(room -> room.path("presence").get(0).path("connected").asBoolean());
            // 방장은 정상 heartbeat를 보내지만 상대 소켓은 닫지도 않고 아무 메시지도 보내지 않습니다.
            heartbeat.scheduleAtFixedRate(() -> black.send("{\"type\":\"ping\"}"), 0, 200, TimeUnit.MILLISECONDS);
            silent.send("{\"type\":\"authenticate\",\"token\":\"" + guest.token() + "\"}");
            black.awaitRoom(room -> room.path("presence").get(1).path("connected").asBoolean());
            var disconnected = black.awaitRoom(room -> !room.path("presence").get(1).path("connected").asBoolean());
            assertEquals("playing", disconnected.path("status").asString());
            assertFalse(disconnected.path("presence").get(1).path("reconnectDeadline").isNull());
            var closed = black.awaitRoom(room -> "closed".equals(room.path("status").asString()));
            assertEquals("reconnect_timeout", closed.path("closeReason").asString());
            assertEquals(0, closed.path("game").path("moveCount").asInt());
            heartbeat.shutdownNow();
            // 늦게 돌아온 참가자에게도 새 방 대신 같은 마지막 상태와 종료 사유를 전달합니다.
            try (Peer late = connect(host.room().code())) {
                late.send("{\"type\":\"authenticate\",\"token\":\"" + guest.token() + "\"}");
                var restored = late.awaitRoom(room -> true);
                assertEquals(closed.path("game"), restored.path("game"));
                assertEquals(closed.path("revision"), restored.path("revision"));
                assertEquals("closed", restored.path("status").asString());
            }
        }
    }

    private Peer connect(String code) throws Exception {
        Peer peer = new Peer();
        peer.socket = http.newWebSocketBuilder().header("Origin", "http://localhost:" + port)
            .buildAsync(URI.create("ws://localhost:" + port + "/ws/rooms/" + code), peer).get(3, TimeUnit.SECONDS);
        return peer;
    }

    // ping 응답과 중간 상태를 건너뛰고 관심 있는 실제 room 메시지가 도착할 때까지 기다립니다.
    private class Peer implements WebSocket.Listener, AutoCloseable {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final StringBuilder fragments = new StringBuilder();
        WebSocket socket;
        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) { messages.add(fragments.toString()); fragments.setLength(0); }
            webSocket.request(1);
            return null;
        }
        void send(String message) { socket.sendText(message, true).join(); }
        JsonNode awaitRoom(Predicate<JsonNode> condition) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
            while (System.nanoTime() < deadline) {
                String text = messages.poll(100, TimeUnit.MILLISECONDS);
                if (text == null) continue;
                var message = json.readTree(text);
                if ("room".equals(message.path("type").asString()) && condition.test(message.path("room"))) return message.path("room");
            }
            throw new AssertionError("기대한 연결 복구 상태가 도착하지 않았습니다.");
        }
        @Override public void close() { if (socket != null) socket.abort(); }
    }
}
