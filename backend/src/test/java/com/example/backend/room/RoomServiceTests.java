package com.example.backend.room;

import static org.junit.jupiter.api.Assertions.*;

import com.example.backend.room.RoomDtos.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

// HTTP 계층 없이 서비스의 방 규칙과 인증을 직접 테스트합니다.
// JUnit의 기본 테스트 인스턴스 생명주기 덕분에 테스트 메서드마다 새 서비스/저장소로 시작합니다.
class RoomServiceTests {

    private final RoomService rooms = new RoomService();

    @Test
    // 방장은 흑, 두 번째 참가자는 백이어야 하며 ID와 비밀 토큰은 참가자마다 달라야 합니다.
    void createAndJoinAssignSeparateIdentitiesAndColors() {
        Admission host = rooms.create(" 민서 ");
        assertEquals("waiting", host.room().status());
        assertEquals("민서", host.room().players().getFirst().nickname());
        assertEquals("black", host.room().players().getFirst().color());
        assertNull(host.room().players().getFirst().userId());
        assertEquals(1, rooms.preview(host.room().code()).playerCount());
        Admission guest = rooms.join(host.room().code(), "지훈");
        assertEquals("playing", guest.room().status());
        assertEquals("white", guest.room().players().get(1).color());
        assertNotEquals(host.playerId(), guest.playerId());
        assertNotEquals(host.token(), guest.token());
        assertNotEquals(host.playerId(), host.token());
        assertEquals(2, rooms.state(host.room().code(), host.token()).players().size());
    }

    @Test
    // 서버의 입력 검증과 방 안에서만 적용되는 닉네임 중복 정책을 확인합니다.
    void nicknameValidationAndDuplicateChecksAreRoomScoped() {
        for (String nickname : new String[] {
            "",
            " ",
            "a",
            "abcdefghijklmn",
            "two names",
            "<script>",
            "😀😀",
        }) {
            assertEquals(
                "INVALID_NICKNAME",
                assertThrows(RoomException.class, () -> rooms.create(nickname)).code()
            );
        }
        assertThrows(RoomException.class, () -> rooms.create(null));
        Admission host = rooms.create("Player");
        assertEquals(
            "NICKNAME_TAKEN",
            assertThrows(RoomException.class, () -> rooms.join(host.room().code(), "player")).code()
        );
        assertDoesNotThrow(() -> rooms.create("Player"));
        assertDoesNotThrow(() -> rooms.join(host.room().code(), "다른이름"));
    }

    @Test
    // 두 스레드에서 동시에 마지막 자리를 요청해 한 사람만 성공하고 총원이 2명인지 검사합니다.
    void simultaneousJoinsNeverAllowMoreThanTwoPlayers() throws Exception {
        Admission host = rooms.create("host");
        String code = host.room().code();
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Callable<Boolean>> requests = List.of(
                () -> tryJoin(code, "guest1"),
                () -> tryJoin(code, "guest2")
            );
            var results = executor.invokeAll(requests);
            int admitted = 0;
            for (var result : results) if (result.get()) admitted++;
            assertEquals(1, admitted);
        }
        assertEquals(2, rooms.state(code, host.token()).players().size());
        assertEquals(
            "ROOM_FULL",
            assertThrows(RoomException.class, () -> rooms.join(code, "third")).code()
        );
    }

    // 병렬 실행 결과를 성공/실패로 바꾸되, 실패 이유가 정원 초과인지도 확인하는 도우미입니다.
    private boolean tryJoin(String code, String nickname) {
        try {
            rooms.join(code, nickname);
            return true;
        } catch (RoomException exception) {
            assertEquals("ROOM_FULL", exception.code());
            return false;
        }
    }

    @Test
    // 누락 토큰, 공개 ID, 다른 방의 정상 토큰 모두 이 방의 권한으로 사용할 수 없어야 합니다.
    void tokensAreRequiredAndAreBoundToTheirRoom() {
        Admission first = rooms.create("first");
        Admission other = rooms.create("other");
        for (String token : new String[] { null, "", first.playerId(), other.token() }) {
            assertEquals(
                "INVALID_SESSION",
                assertThrows(RoomException.class, () ->
                    rooms.state(first.room().code(), token)
                ).code()
            );
        }
        assertThrows(RoomException.class, () -> rooms.leave(first.room().code(), other.token()));
        assertEquals("waiting", rooms.preview(first.room().code()).status());
    }

    @Test
    // 대기 중 착수·상대 차례·잘못된 좌표·중복 버전을 거절하고 정상 수순만 상태를 바꾸는지 봅니다.
    void serverEnforcesWaitingTurnRevisionAndLegalMoves() {
        Admission host = rooms.create("host");
        String code = host.room().code();
        assertEquals(
            "NOT_PLAYING",
            assertThrows(RoomException.class, () ->
                rooms.move(code, host.token(), new MoveRequest(2, 3, 0))
            ).code()
        );
        Admission guest = rooms.join(code, "guest");
        // 실제 연결이 있어야 게임할 수 있으므로 서비스 테스트에서도 두 구독을 먼저 등록합니다.
        rooms.subscribe(code, host.token(), ignored -> {});
        rooms.subscribe(code, guest.token(), ignored -> {});
        int revision = rooms.state(code, host.token()).revision();
        assertEquals(
            "NOT_YOUR_TURN",
            assertThrows(RoomException.class, () ->
                rooms.move(code, guest.token(), new MoveRequest(2, 3, revision))
            ).code()
        );
        assertEquals(
            "INVALID_MOVE",
            assertThrows(RoomException.class, () ->
                rooms.move(code, host.token(), new MoveRequest(0, 0, revision))
            ).code()
        );
        assertEquals(
            "INVALID_MOVE",
            assertThrows(RoomException.class, () ->
                rooms.move(code, host.token(), new MoveRequest(null, 3, revision))
            ).code()
        );
        RoomView moved = rooms.move(code, host.token(), new MoveRequest(2, 3, revision));
        assertEquals("white", moved.game().currentTurn());
        assertEquals("black", moved.game().board()[3][3]);
        assertEquals(revision + 1, moved.revision());
        assertEquals(
            "STALE_ROOM",
            assertThrows(RoomException.class, () ->
                rooms.move(code, host.token(), new MoveRequest(2, 3, revision))
            ).code()
        );
        RoomView response = rooms.move(
            code,
            guest.token(),
            new MoveRequest(2, 2, moved.revision())
        );
        assertEquals("black", response.game().currentTurn());
        assertEquals(2, rooms.state(code, host.token()).game().moveCount());
    }

    @Test
    // 응답으로 받은 배열을 일부러 수정해 서버 내부 배열과 참조가 분리되어 있는지 확인합니다.
    void returningSnapshotsCannotMutateTheServerBoard() {
        Admission host = rooms.create("host");
        host.room().game().board()[0][0] = "white";
        assertNull(rooms.state(host.room().code(), host.token()).game().board()[0][0]);
    }

    @Test
    // 퇴장한 방도 기존 참가자는 최종 상태를 읽을 수 있지만 새 입장/게임은 허용하지 않습니다.
    void leavingClosesBothParticipantsAndInvalidatesTheInvite() {
        Admission host = rooms.create("host");
        Admission guest = rooms.join(host.room().code(), "guest");
        rooms.leave(host.room().code(), guest.token());
        assertEquals("closed", rooms.state(host.room().code(), host.token()).status());
        assertEquals(
            "INVALID_SESSION",
            assertThrows(RoomException.class, () -> rooms.state(host.room().code(), "wrong")).code()
        );
        assertEquals(
            "ROOM_CLOSED",
            assertThrows(RoomException.class, () -> rooms.join(host.room().code(), "next")).code()
        );
    }

    @Test
    // 실제로 6시간을 기다리지 않고 시계를 이동해 유효 시간 경계에서 만료되는지 검사합니다.
    void missingAndExpiredRoomsReturnExplicitErrors() {
        assertEquals(
            "ROOM_NOT_FOUND",
            assertThrows(RoomException.class, () -> rooms.preview("INVALID")).code()
        );
        var clock = new MutableClock();
        RoomService expiring = new RoomService(clock);
        Admission host = expiring.create("host");
        clock.now = clock.now.plusSeconds(6 * 60 * 60);
        assertEquals(
            "ROOM_EXPIRED",
            assertThrows(RoomException.class, () ->
                expiring.state(host.room().code(), host.token())
            ).code()
        );
    }

    // 테스트에서만 사용하는 조작 가능한 시계입니다. now를 변경하면 서비스가 읽는 현재 시각도 바뀝니다.
    private static class MutableClock extends Clock {

        Instant now = Instant.parse("2026-01-01T00:00:00Z");

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
