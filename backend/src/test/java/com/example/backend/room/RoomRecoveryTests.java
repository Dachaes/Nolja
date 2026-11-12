package com.example.backend.room;

import static org.junit.jupiter.api.Assertions.*;

import com.example.backend.room.RoomDtos.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

// 가짜 시계로 2분을 즉시 이동시켜 복귀 기한의 직전/경계와 오래된 연결 종료를 검증합니다.
class RoomRecoveryTests {

    private final MutableClock clock = new MutableClock();
    private final RoomService rooms = new RoomService(clock);
    private final Admission host = rooms.create("host");
    private final Admission guest = rooms.join(host.room().code(), "guest");
    private final String code = host.room().code();

    @Test
    void reconnectRestoresIdentityBoardTurnAndPausesBothPlayersUntilThen() {
        rooms.subscribe(code, host.token(), ignored -> {});
        Runnable guestSocket = rooms.subscribe(code, guest.token(), ignored -> {});
        RoomView started = rooms.state(code, host.token());
        RoomView moved = rooms.move(code, host.token(), new MoveRequest(2, 3, started.revision()));
        guestSocket.run();
        RoomView paused = rooms.state(code, host.token());
        assertEquals(
            clock.instant().plusSeconds(120),
            paused.presence().get(1).reconnectDeadline()
        );
        assertFalse(paused.presence().get(1).connected());
        assertEquals(
            "PLAYER_DISCONNECTED",
            assertThrows(RoomException.class, () ->
                rooms.move(code, guest.token(), new MoveRequest(2, 2, paused.revision()))
            ).code()
        );
        clock.now = clock.now.plusSeconds(119);
        List<RoomView> restored = new ArrayList<>();
        rooms.subscribe(code, guest.token(), restored::add);
        RoomView latest = restored.getLast();
        assertEquals(moved.players(), latest.players());
        assertTrue(java.util.Arrays.deepEquals(moved.game().board(), latest.game().board()));
        assertEquals("white", latest.game().currentTurn());
        assertEquals(moved.game().lastMove(), latest.game().lastMove());
        assertEquals(moved.gameNumber(), latest.gameNumber());
        assertTrue(
            latest
                .presence()
                .stream()
                .allMatch(player -> player.connected())
        );
        assertNull(latest.presence().get(1).reconnectDeadline());
        assertDoesNotThrow(() ->
            rooms.move(code, guest.token(), new MoveRequest(2, 2, latest.revision()))
        );
    }

    @Test
    void closingAnOldSocketCannotDisconnectARefreshedTab() {
        Runnable oldHost = rooms.subscribe(code, host.token(), ignored -> {});
        rooms.subscribe(code, guest.token(), ignored -> {});
        int revision = rooms.state(code, host.token()).revision();
        Runnable newHost = rooms.subscribe(code, host.token(), ignored -> {});
        oldHost.run();
        oldHost.run(); // 중복 close 이벤트도 무해해야 합니다.
        assertEquals(revision, rooms.state(code, host.token()).revision());
        assertTrue(rooms.state(code, host.token()).presence().getFirst().connected());
        newHost.run();
        assertFalse(rooms.state(code, guest.token()).presence().getFirst().connected());
        assertEquals(revision + 1, rooms.state(code, guest.token()).revision());
    }

    @Test
    void deadlineClosesTheRoomAndALateReconnectCannotReviveIt() {
        List<RoomView> hostMessages = new ArrayList<>();
        rooms.subscribe(code, host.token(), hostMessages::add);
        Runnable guestSocket = rooms.subscribe(code, guest.token(), ignored -> {});
        guestSocket.run();
        clock.now = clock.now.plusSeconds(120);
        rooms.expireDisconnectedRooms();
        RoomView closed = hostMessages.getLast();
        assertEquals("closed", closed.status());
        assertEquals("reconnect_timeout", closed.closeReason());
        assertEquals("playing", closed.game().status()); // 단절을 임의의 승패로 바꾸지 않습니다.
        List<RoomView> restored = new ArrayList<>();
        rooms.subscribe(code, guest.token(), restored::add);
        assertEquals("closed", restored.getLast().status());
        assertEquals(closed.revision(), restored.getLast().revision());
        assertEquals(
            "ROOM_CLOSED",
            assertThrows(RoomException.class, () ->
                rooms.rematch(code, guest.token(), new RematchRequest(1, true))
            ).code()
        );
        assertEquals(
            "INVALID_SESSION",
            assertThrows(RoomException.class, () -> rooms.state(code, "wrong")).code()
        );
    }

    @Test
    void deadlineIsCheckedEvenBeforeTheNextScheduledSweep() {
        rooms.subscribe(code, host.token(), ignored -> {});
        // 상대는 입장 응답을 받았지만 소켓을 끝내 열지 않은 경우입니다.
        clock.now = clock.now.plusSeconds(120);
        List<RoomView> restored = new ArrayList<>();
        rooms.subscribe(code, guest.token(), restored::add);
        assertEquals("reconnect_timeout", restored.getLast().closeReason());
    }

    @Test
    void simultaneousAbsenceAlsoExpiresAndClosedSnapshotsRemainReadOnly() {
        Runnable black = rooms.subscribe(code, host.token(), ignored -> {});
        Runnable white = rooms.subscribe(code, guest.token(), ignored -> {});
        black.run();
        white.run();
        clock.now = clock.now.plusSeconds(120);
        rooms.expireDisconnectedRooms();
        assertEquals("reconnect_timeout", rooms.state(code, host.token()).closeReason());
        assertEquals(
            "ROOM_CLOSED",
            assertThrows(RoomException.class, () ->
                rooms.move(code, host.token(), new MoveRequest(2, 3, 0))
            ).code()
        );
        assertEquals(
            "ROOM_CLOSED",
            assertThrows(RoomException.class, () -> rooms.join(code, "third")).code()
        );
    }

    private static final class MutableClock extends Clock {

        Instant now = Instant.parse("2026-11-10T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
