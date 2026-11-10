package com.example.backend.room.rematch;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import com.example.backend.othello.OthelloRules;
import com.example.backend.room.RoomDtos.*;
import com.example.backend.room.RoomException;
import com.example.backend.room.RoomService;

// 두 사람의 동의, 요청 중복, 지난 판 요청, 동시 퇴장처럼 화면만으로 검사하기 어려운 경계를 검증합니다.
class RoomRematchTests {
    private final RoomService rooms = new RoomService();
    private final Admission host = rooms.create("host");
    private final String code = host.room().code();

    @Test
    void onlyAuthenticatedPlayersCanVoteAfterTheGameEnds() {
        assertError("INVALID_SESSION", () -> rooms.rematch(code, host.playerId(), new RematchRequest(1, true)));
        assertError("INVALID_SESSION", () -> rooms.rematch(code, rooms.create("other").token(), new RematchRequest(1, true)));
        assertError("GAME_NOT_FINISHED", () -> rooms.rematch(code, host.token(), new RematchRequest(1, true)));
        for (RematchRequest input : new RematchRequest[] { null, new RematchRequest(null, true), new RematchRequest(1, null), new RematchRequest(0, true) }) {
            assertError("INVALID_REMATCH", () -> rooms.rematch(code, host.token(), input));
        }
        rooms.join(code, "guest");
        assertError("GAME_NOT_FINISHED", () -> rooms.rematch(code, host.token(), new RematchRequest(1, false)));
    }

    @Test
    void oneVoteCanBeCancelledAndTwoVotesRestartWithSwappedColors() {
        Admission guest = rooms.join(code, "guest");
        RoomView finished = finishGame(guest);
        RoomView waiting = rooms.rematch(code, host.token(), new RematchRequest(1, true));
        assertEquals("finished", waiting.status());
        assertEquals(List.of(host.playerId()), waiting.rematchReadyPlayerIds());
        assertEquals(finished.revision() + 1, waiting.revision());
        assertTrue(java.util.Arrays.deepEquals(finished.game().board(), waiting.game().board()));
        // 같은 동의의 재전송은 별도 투표나 버전 증가로 취급하지 않습니다.
        assertEquals(waiting.revision(), rooms.rematch(code, host.token(), new RematchRequest(1, true)).revision());
        RoomView cancelled = rooms.rematch(code, host.token(), new RematchRequest(1, false));
        assertTrue(cancelled.rematchReadyPlayerIds().isEmpty());
        assertEquals(cancelled.revision(), rooms.rematch(code, host.token(), new RematchRequest(1, false)).revision());
        rooms.rematch(code, guest.token(), new RematchRequest(1, true));
        RoomView restarted = rooms.rematch(code, host.token(), new RematchRequest(1, true));
        assertNewGame(restarted, 2);
        assertEquals("white", restarted.players().getFirst().color());
        assertEquals("black", restarted.players().get(1).color());
        assertEquals(host.playerId(), restarted.players().getFirst().playerId());
        assertEquals("host", restarted.players().getFirst().nickname());
        assertNull(restarted.players().getFirst().userId());
        assertEquals(guest.playerId(), restarted.players().get(1).playerId());
        assertEquals(restarted.revision(), rooms.state(code, guest.token()).revision());
        assertError("NOT_YOUR_TURN", () -> rooms.move(code, host.token(), new MoveRequest(2, 3, restarted.revision())));
        assertDoesNotThrow(() -> rooms.move(code, guest.token(), new MoveRequest(2, 3, restarted.revision())));
    }

    @Test
    void simultaneousVotesStartExactlyOneNewGameAndOldRequestsStayInvalid() throws Exception {
        Admission guest = rooms.join(code, "guest");
        RoomView finished = finishGame(guest);
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Callable<RoomView>> votes = List.of(
                () -> { barrier.await(); return rooms.rematch(code, host.token(), new RematchRequest(1, true)); },
                () -> { barrier.await(); return rooms.rematch(code, guest.token(), new RematchRequest(1, true)); });
            for (var vote : executor.invokeAll(votes)) assertNotNull(vote.get());
        }
        RoomView next = rooms.state(code, host.token());
        assertNewGame(next, 2);
        assertEquals(finished.revision() + 2, next.revision());
        assertError("STALE_GAME", () -> rooms.rematch(code, host.token(), new RematchRequest(1, true)));
        assertError("STALE_GAME", () -> rooms.rematch(code, guest.token(), new RematchRequest(1, false)));
        assertError("STALE_ROOM", () -> rooms.move(code, guest.token(), new MoveRequest(2, 3, finished.revision())));
        // 다음 판까지 끝나더라도 이전 판의 지연 요청이 새 재대결 동의로 재사용되면 안 됩니다.
        finishGame(guest);
        assertError("STALE_GAME", () -> rooms.rematch(code, host.token(), new RematchRequest(1, true)));
        rooms.rematch(code, host.token(), new RematchRequest(2, true));
        RoomView third = rooms.rematch(code, guest.token(), new RematchRequest(2, true));
        assertNewGame(third, 3);
        assertEquals("black", third.players().getFirst().color());
    }

    @Test
    void leavingDuringAcceptanceAlwaysClosesTheRoom() throws Exception {
        Admission guest = rooms.join(code, "guest");
        finishGame(guest);
        rooms.rematch(code, host.token(), new RematchRequest(1, true));
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var leave = executor.submit(() -> { barrier.await(); rooms.leave(code, host.token()); return true; });
            var accept = executor.submit(() -> {
                barrier.await();
                try { rooms.rematch(code, guest.token(), new RematchRequest(1, true)); }
                catch (RoomException exception) { assertEquals("ROOM_CLOSED", exception.code()); }
                return true;
            });
            assertTrue(leave.get());
            assertTrue(accept.get());
        }
        assertEquals("closed", rooms.state(code, guest.token()).status());
        assertError("ROOM_CLOSED", () -> rooms.rematch(code, guest.token(), new RematchRequest(1, true)));
    }

    // 테스트 전용 강제 종료 API 없이 실제 합법 수를 끝까지 두어 종료 상태를 준비합니다.
    private RoomView finishGame(Admission guest) {
        // 순수 서비스 테스트에서 연결 수명을 대신 등록합니다. 다음 판에는 기존 연결을 그대로 씁니다.
        if (rooms.state(code, host.token()).presence().stream().anyMatch(player -> !player.connected())) {
            rooms.subscribe(code, host.token(), ignored -> {});
            rooms.subscribe(code, guest.token(), ignored -> {});
        }
        RoomView current = rooms.state(code, host.token());
        while ("playing".equals(current.status())) {
            var game = current.game();
            Player active = current.players().stream().filter(player -> player.color().equals(game.currentTurn())).findFirst().orElseThrow();
            String token = active.playerId().equals(host.playerId()) ? host.token() : guest.token();
            boolean moved = false;
            for (int row = 0; row < 8 && !moved; row++) for (int col = 0; col < 8 && !moved; col++) {
                if (!OthelloRules.flips(game.board(), game.currentTurn(), row, col).isEmpty()) {
                    current = rooms.move(code, token, new MoveRequest(row, col, current.revision()));
                    moved = true;
                }
            }
            assertTrue(moved);
        }
        assertEquals("finished", current.status());
        return current;
    }

    private void assertNewGame(RoomView room, int gameNumber) {
        assertEquals(gameNumber, room.gameNumber());
        assertEquals("playing", room.status());
        assertEquals("black", room.game().currentTurn());
        assertEquals(0, room.game().moveCount());
        assertNull(room.game().lastMove());
        assertNull(room.game().passedPlayer());
        assertTrue(room.rematchReadyPlayerIds().isEmpty());
        assertTrue(java.util.Arrays.deepEquals(OthelloRules.initial().board(), room.game().board()));
    }

    private void assertError(String code, org.junit.jupiter.api.function.Executable action) {
        assertEquals(code, assertThrows(RoomException.class, action).code());
    }
}
