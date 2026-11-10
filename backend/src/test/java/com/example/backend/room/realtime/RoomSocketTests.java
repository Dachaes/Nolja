package com.example.backend.room.realtime;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.ArrayList;
import java.util.Random;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.example.backend.othello.GameState.Position;
import com.example.backend.othello.OthelloRules;
import com.example.backend.room.RoomDtos.*;
import com.example.backend.room.RoomService;

// 실제 WebSocket 프레임으로 서버의 인증/구독/전파를 검사합니다. REST만 검사해서는 놓칠 수 있는 경로입니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RoomSocketTests {
    @LocalServerPort int port;
    @Autowired RoomService rooms;
    @Autowired JsonMapper json;
    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void joinMoveAndLeaveArePushedOnlyToTheAuthenticatedRoom() throws Exception {
        Admission host = rooms.create("host");
        Admission stranger = rooms.create("other");
        try (Peer black = connect(host.room().code()); Peer unrelated = connect(stranger.room().code())) {
            // 인증 전에는 최초 보드조차 보내지 않아야 합니다.
            assertNull(black.messages.poll(150, TimeUnit.MILLISECONDS));
            black.authenticate(host.token());
            assertEquals("waiting", black.next().path("room").path("status").asString());
            unrelated.authenticate(stranger.token());
            unrelated.next();
            Admission guest = rooms.join(host.room().code(), "guest");
            assertEquals("playing", black.next().path("room").path("status").asString());
            try (Peer white = connect(host.room().code())) {
                white.authenticate(guest.token());
                white.next();
                black.next(); // 상대의 소켓 인증 완료도 접속 상태 변경으로 전달됩니다.
                int revision = rooms.state(host.room().code(), host.token()).revision();
                RoomView moved = rooms.move(host.room().code(), host.token(), new MoveRequest(2, 3, revision));
                assertSnapshot(moved, black.next());
                assertSnapshot(moved, white.next());
                // 다른 방에는 입장/착수 알림이 전혀 전달되지 않습니다.
                assertNull(unrelated.messages.poll(150, TimeUnit.MILLISECONDS));
                white.send("{\"type\":\"ping\"}");
                assertEquals("pong", white.next().path("type").asString());
                rooms.leave(host.room().code(), guest.token());
                assertEquals("closed", black.next().path("room").path("status").asString());
                assertEquals("closed", white.next().path("room").path("status").asString());
                assertEquals(1000, black.closed.get(3, TimeUnit.SECONDS));
            }
        }
    }

    @Test
    void invalidTokensOtherRoomTokensAndMalformedMessagesCannotSubscribe() throws Exception {
        Admission host = rooms.create("host");
        Admission other = rooms.create("other");
        for (String token : new String[] { "wrong", host.playerId(), other.token() }) {
            try (Peer peer = connect(host.room().code())) {
                peer.authenticate(token);
                var error = peer.next();
                assertEquals("error", error.path("type").asString());
                assertEquals(401, error.path("status").asInt());
                assertTrue(error.path("room").isNull());
            }
        }
        try (Peer peer = connect(host.room().code())) {
            peer.send("not-json");
            assertEquals("INVALID_MESSAGE", peer.next().path("error").path("code").asString());
        }
        try (Peer peer = connect(host.room().code())) {
            peer.send("{\"type\":\"ping\"}");
            assertEquals(401, peer.next().path("status").asInt());
        }
    }

    @Test
    void foreignOriginsAreRejectedDuringTheHandshake() {
        Admission host = rooms.create("host");
        assertThrows(Exception.class, () -> http.newWebSocketBuilder()
                .header("Origin", "https://unrelated.example")
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/rooms/" + host.room().code()), new Peer()).get(3, TimeUnit.SECONDS));
    }

    @Test
    void authenticationTimeoutIsRetryableAndDoesNotRevokeTheParticipant() throws Exception {
        Admission host = rooms.create("host");
        try (Peer stalled = connect(host.room().code())) {
            JsonNode timeout = stalled.next(8);
            assertEquals("AUTH_TIMEOUT", timeout.path("error").path("code").asString());
            assertEquals(408, timeout.path("status").asInt());
        }
        try (Peer retried = connect(host.room().code())) {
            retried.authenticate(host.token());
            assertEquals("waiting", retried.next().path("room").path("status").asString());
        }
    }

    @Test
    void reconnectReceivesLatestSnapshotAndFullGameEndsWithMatchingBoards() throws Exception {
        Admission host = rooms.create("host");
        Admission guest = rooms.join(host.room().code(), "guest");
        // 이전 연결에서 둔 수가 연결 교체 뒤에도 보존되어야 합니다.
        Runnable hostConnection = rooms.subscribe(host.room().code(), host.token(), ignored -> {});
        Runnable guestConnection = rooms.subscribe(host.room().code(), guest.token(), ignored -> {});
        RoomView current = rooms.move(host.room().code(), host.token(), new MoveRequest(2, 3, rooms.state(host.room().code(), host.token()).revision()));
        hostConnection.run();
        guestConnection.run();
        try (Peer black = connect(host.room().code()); Peer white = connect(host.room().code())) {
            black.authenticate(host.token());
            assertEquals(1, black.next().path("room").path("game").path("moveCount").asInt());
            white.authenticate(guest.token());
            JsonNode whiteInitial = white.next();
            current = rooms.state(host.room().code(), host.token());
            assertSnapshot(current, black.next());
            assertSnapshot(current, whiteInitial);
            Random random = new Random(42);
            while ("playing".equals(current.status())) {
                var moves = new ArrayList<Position>();
                String color = current.game().currentTurn();
                for (int row = 0; row < 8; row++) for (int col = 0; col < 8; col++) {
                    if (!OthelloRules.flips(current.game().board(), color, row, col).isEmpty()) moves.add(new Position(row, col));
                }
                assertFalse(moves.isEmpty());
                Position move = moves.get(random.nextInt(moves.size()));
                current = rooms.move(host.room().code(), "black".equals(color) ? host.token() : guest.token(),
                        new MoveRequest(move.row(), move.col(), current.revision()));
                // 보드뿐 아니라 자동 패스, 현재 차례, 종료 상태도 두 기기에 동일하게 전달되는지 확인합니다.
                assertSnapshot(current, black.next());
                assertSnapshot(current, white.next());
            }
            assertEquals("finished", current.game().status());
            assertNull(current.game().currentTurn());
            // 대국 종료 후에도 같은 소켓에서 동의·취소·다음 보드를 받아야 합니다.
            RoomView requested = rooms.rematch(host.room().code(), host.token(), new RematchRequest(1, true));
            assertSnapshot(requested, black.next());
            assertSnapshot(requested, white.next());
            try (Peer reconnected = connect(host.room().code())) {
                reconnected.authenticate(host.token());
                assertSnapshot(requested, reconnected.next());
            }
            RoomView cancelled = rooms.rematch(host.room().code(), host.token(), new RematchRequest(1, false));
            assertSnapshot(cancelled, black.next());
            assertSnapshot(cancelled, white.next());
            requested = rooms.rematch(host.room().code(), host.token(), new RematchRequest(1, true));
            assertSnapshot(requested, black.next());
            assertSnapshot(requested, white.next());
            RoomView restarted = rooms.rematch(host.room().code(), guest.token(), new RematchRequest(1, true));
            assertEquals(2, restarted.gameNumber());
            assertSnapshot(restarted, black.next());
            assertSnapshot(restarted, white.next());
        }
    }

    private void assertSnapshot(RoomView expected, JsonNode message) {
        assertEquals("room", message.path("type").asString());
        var expectedJson = json.readTree(json.writeValueAsString(expected));
        // 조회 시각만 달라질 수 있고 실제 방 상태는 모든 필드가 같아야 합니다.
        for (String field : List.of("code", "status", "players", "game", "revision", "expiresAt", "gameNumber", "rematchReadyPlayerIds", "presence", "closeReason")) {
            assertEquals(expectedJson.path(field), message.path("room").path(field), field);
        }
        assertFalse(message.toString().contains("token"));
    }

    private Peer connect(String code) throws Exception {
        Peer peer = new Peer();
        peer.socket = http.newWebSocketBuilder()
                .header("Origin", "http://localhost:" + port)
                .buildAsync(URI.create("ws://localhost:" + port + "/ws/rooms/" + code), peer).get(3, TimeUnit.SECONDS);
        return peer;
    }

    // 한 JSON이 여러 프레임으로 나뉘어도 마지막 조각까지 합친 뒤 테스트에 전달합니다.
    private class Peer implements WebSocket.Listener, AutoCloseable {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder fragments = new StringBuilder();
        WebSocket socket;
        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) { messages.add(fragments.toString()); fragments.setLength(0); }
            webSocket.request(1);
            return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket webSocket, int status, String reason) { closed.complete(status); return null; }
        void authenticate(String token) { send("{\"type\":\"authenticate\",\"token\":\"" + token + "\"}"); }
        void send(String message) { socket.sendText(message, true).join(); }
        JsonNode next() throws Exception { return next(3); }
        JsonNode next(long seconds) throws Exception {
            String message = messages.poll(seconds, TimeUnit.SECONDS);
            assertNotNull(message, "실시간 알림이 도착하지 않았습니다.");
            return json.readTree(message);
        }
        @Override public void close() { if (socket != null) socket.abort(); }
    }
}
