package com.example.backend.room;

import static org.junit.jupiter.api.Assertions.*;
import com.example.backend.mole.MoleMatch;
import com.example.backend.room.RoomDtos.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class MoleRoomTests {
    private final MutableClock clock = new MutableClock();
    private final RoomService rooms = new RoomService(clock);
    private final Admission host = rooms.create("host", "whack-a-mole");
    private final Admission guest = rooms.join(host.room().code(), "guest");
    private final String code = host.room().code();

    private RoomView start() {
        rooms.subscribe(code, host.token(), ignored -> {});
        rooms.subscribe(code, guest.token(), ignored -> {});
        clock.advance(3000);
        rooms.tickMoleRooms();
        return rooms.state(code, host.token());
    }

    private List<MoleMatch.Target> active(RoomView room) {
        return room.mole().holes().stream().filter(target -> target != null && target.claimedBy() == null).toList();
    }

    @Test
    void sharedTargetCanOnlyBeScoredOnceUnderConcurrentRequests() throws Exception {
        RoomView started = start();
        assertEquals("whack-a-mole", rooms.preview(code).gameType());
        assertEquals(16, started.mole().holes().size());
        assertEquals(3, active(started).size());
        var target = active(started).getFirst();
        var request = new HitRequest(target.hole(), target.id(), 1);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> { go.await(); return rooms.hit(code, host.token(), request); });
            var two = executor.submit(() -> { go.await(); return rooms.hit(code, guest.token(), request); });
            go.countDown(); one.get(); two.get();
        }
        var result = rooms.state(code, host.token());
        assertEquals(100, result.mole().scores().stream().mapToInt(MoleMatch.Score::score).sum());
        assertEquals(1, result.mole().scores().stream().mapToInt(MoleMatch.Score::hits).sum());
        assertEquals(0, result.mole().scores().stream().mapToInt(MoleMatch.Score::misses).sum());
        assertEquals(started.revision() + 1, result.revision());
        assertThrows(UnsupportedOperationException.class, () -> result.mole().holes().set(0, null));
        assertNull(target.claimedBy()); // Earlier snapshots remain unchanged.
    }

    @Test
    void countdownWaitsForBothConnectionsAndRejectsPrematureScoring() {
        rooms.subscribe(code, host.token(), ignored -> {});
        clock.advance(10000);
        rooms.tickMoleRooms();
        assertNull(rooms.state(code, host.token()).mole().startsAt());
        rooms.subscribe(code, guest.token(), ignored -> {});
        RoomView countdown = rooms.state(code, host.token());
        assertEquals(clock.instant().plusSeconds(3), countdown.mole().startsAt());
        rooms.hit(code, host.token(), new HitRequest(0, null, 1));
        assertEquals(0, rooms.state(code, host.token()).mole().scores().getFirst().misses());
        assertTrue(countdown.mole().holes().stream().allMatch(java.util.Objects::isNull));
    }

    @Test
    void combosEarnBonusAndStaleOrClaimedTargetsDoNotBreakThem() {
        RoomView started = start();
        var targets = active(started);
        for (var target : targets) {
            rooms.hit(code, host.token(), new HitRequest(target.hole(), target.id(), 1));
        }
        RoomView scored = rooms.state(code, host.token());
        assertEquals(325, scored.mole().scores().getFirst().score());
        assertEquals(3, scored.mole().scores().getFirst().combo());
        var old = targets.getFirst();
        rooms.hit(code, host.token(), new HitRequest(old.hole(), old.id(), 1));
        assertEquals(3, rooms.state(code, host.token()).mole().scores().getFirst().combo());
        int empty = 0;
        while (scored.mole().holes().get(empty) != null) empty++;
        rooms.hit(code, host.token(), new HitRequest(empty, null, 1));
        var missed = rooms.state(code, host.token()).mole().scores().getFirst();
        assertEquals(0, missed.combo());
        assertEquals(3, missed.bestCombo());
        assertEquals(325, missed.score());
        assertEquals(1, missed.misses());
    }

    @Test
    void differentTargetsDoNotConflictOnRoomRevisionAndExpiredTargetsAreHarmless() {
        var targets = active(start());
        rooms.hit(code, host.token(), new HitRequest(targets.get(0).hole(), targets.get(0).id(), 1));
        rooms.hit(code, guest.token(), new HitRequest(targets.get(1).hole(), targets.get(1).id(), 1));
        clock.advance(2000);
        rooms.hit(code, host.token(), new HitRequest(targets.get(2).hole(), targets.get(2).id(), 1));
        var result = rooms.state(code, host.token());
        assertEquals(List.of(100, 100), result.mole().scores().stream().map(MoleMatch.Score::score).toList());
        assertEquals(1, result.mole().scores().getFirst().combo());
    }

    @Test
    void clockPausesOnDisconnectAndResumesWithScoresAndTargetsIntact() {
        rooms.subscribe(code, host.token(), ignored -> {});
        Runnable guestConnection = rooms.subscribe(code, guest.token(), ignored -> {});
        clock.advance(3000);
        rooms.tickMoleRooms();
        var before = rooms.state(code, host.token());
        var target = active(before).getFirst();
        rooms.hit(code, host.token(), new HitRequest(target.hole(), target.id(), 1));
        clock.advance(400);
        guestConnection.run();
        var paused = rooms.state(code, host.token());
        assertNotNull(paused.mole().pausedAt());
        assertEquals("PLAYER_DISCONNECTED", assertThrows(RoomException.class,
                () -> rooms.hit(code, host.token(), new HitRequest(0, null, 1))).code());
        clock.advance(40000);
        rooms.tickMoleRooms();
        assertEquals("playing", rooms.state(code, host.token()).status());
        rooms.subscribe(code, guest.token(), ignored -> {});
        var resumed = rooms.state(code, host.token());
        assertNull(resumed.mole().pausedAt());
        assertEquals(paused.mole().endsAt().plusSeconds(40), resumed.mole().endsAt());
        assertEquals(paused.mole().scores(), resumed.mole().scores());
        clock.now = resumed.mole().endsAt();
        rooms.tickMoleRooms();
        assertEquals("finished", rooms.state(code, host.token()).status());
    }

    @Test
    void serverEndsAtThirtySecondsAndRematchResetsScoresAndRejectsOldHits() {
        var started = start();
        var target = active(started).getFirst();
        clock.now = started.mole().endsAt();
        var ended = rooms.hit(code, host.token(), new HitRequest(target.hole(), target.id(), 1));
        assertEquals("finished", ended.status());
        assertTrue(ended.mole().finished());
        assertEquals(0, ended.mole().scores().getFirst().score());
        rooms.rematch(code, host.token(), new RematchRequest(1, true));
        var next = rooms.rematch(code, guest.token(), new RematchRequest(1, true));
        assertEquals(2, next.gameNumber());
        assertEquals("playing", next.status());
        assertEquals(clock.instant().plusSeconds(3), next.mole().startsAt());
        assertEquals(0, next.mole().scores().getFirst().bestCombo());
        assertEquals("STALE_GAME", assertThrows(RoomException.class,
                () -> rooms.hit(code, host.token(), new HitRequest(target.hole(), target.id(), 1))).code());
    }

    @Test
    void authenticationBoundsGameIsolationAndExplicitLeaveAreEnforced() {
        var state = start();
        assertEquals("INVALID_SESSION", assertThrows(RoomException.class,
                () -> rooms.hit(code, "wrong", new HitRequest(0, null, 1))).code());
        assertEquals("INVALID_HIT", assertThrows(RoomException.class,
                () -> rooms.hit(code, host.token(), new HitRequest(16, null, 1))).code());
        assertEquals("WRONG_GAME", assertThrows(RoomException.class,
                () -> rooms.move(code, host.token(), new MoveRequest(2, 3, state.revision()))).code());
        var othello = rooms.create("other");
        assertEquals("WRONG_GAME", assertThrows(RoomException.class,
                () -> rooms.hit(othello.room().code(), othello.token(), new HitRequest(0, null, 1))).code());
        assertEquals("INVALID_GAME", assertThrows(RoomException.class, () -> rooms.create("name", "unknown")).code());
        rooms.leave(code, guest.token());
        clock.advance(60000); rooms.tickMoleRooms();
        assertEquals("closed", rooms.state(code, host.token()).status());
        assertFalse(rooms.state(code, host.token()).mole().finished());
    }

    private static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-11T00:00:00Z");
        void advance(long millis) { now = now.plusMillis(millis); }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
