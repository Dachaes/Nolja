package com.example.backend.room;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import com.example.backend.othello.GameState;
import com.example.backend.othello.OthelloRules;
import com.example.backend.room.RoomDtos.*;
import com.example.backend.room.realtime.RoomUpdates;
import com.example.backend.room.rematch.RematchVotes;
import com.example.backend.room.recovery.RecoveryPolicy;
import com.example.backend.room.recovery.RoomPresence;

/**
 * 방 생성부터 퇴장까지의 업무 규칙을 담당합니다. 컨트롤러는 HTTP를, 이 서비스는 방 상태를 관리합니다.
 * 현재 저장소는 서버 메모리이므로 서버 재시작 시 사라지며 여러 서버 간 공유되지 않습니다.
 * public 메서드의 synchronized는 이 서비스 객체의 잠금을 공유합니다.
 * 한 요청의 검사와 변경이 끝나기 전에 다른 요청이 끼어들어 정원/차례를 깨뜨리지 못하게 합니다.
 */
@Service
public class RoomService {
    // 초대 코드는 사람이 읽기 쉽게 I/O/0/1을 제외합니다. 비밀 참가 토큰과는 별개입니다.
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Duration LIFETIME = Duration.ofHours(6);
    // 방 코드 → 서버 내부 방 객체. 접근은 아래의 동기화된 메서드를 통해서만 합니다.
    private final Map<String, Room> rooms = new HashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;
    private final RoomUpdates updates;
    private final RecoveryPolicy recovery;

    // 운영에서는 실제 시각, 테스트에서는 조작 가능한 시계를 사용해 만료를 기다리지 않고 검증합니다.
    public RoomService() { this(Clock.systemUTC(), new RoomUpdates(), RecoveryPolicy.DEFAULT); }
    RoomService(Clock clock) { this(clock, new RoomUpdates(), RecoveryPolicy.DEFAULT); }
    @Autowired
    public RoomService(RoomUpdates updates, RecoveryPolicy recovery) { this(Clock.systemUTC(), updates, recovery); }
    RoomService(Clock clock, RoomUpdates updates, RecoveryPolicy recovery) {
        this.clock = clock; this.updates = updates; this.recovery = recovery;
    }

    // 닉네임 검증 → 만료 방 정리 → 고유 코드 발급 → 흑 참가자 등록 순으로 방을 생성합니다.
    public synchronized Admission create(String nickname) {
        String name = validateNickname(nickname);
        // 생성 시 만료 데이터를 정리하고 최대 개수를 제한해 메모리가 계속 늘지 않도록 합니다.
        expireDisconnectedRooms();
        if (rooms.size() >= 1000) throw error(HttpStatus.SERVICE_UNAVAILABLE, "ROOM_LIMIT", "현재 방이 많습니다. 잠시 후 다시 시도해 주세요.");
        String code;
        // 난수라도 중복 가능성이 있으므로 실제 저장소에서 사용 중인지 확인합니다.
        do { code = generateCode(); } while (rooms.containsKey(code));
        Room room = new Room(code, clock.instant().plus(LIFETIME));
        Member host = member(name, "black");
        room.members.add(host);
        room.presence.admit(host.player.playerId(), clock.instant(), recovery.gracePeriod());
        rooms.put(code, room);
        return new Admission(view(room), host.player.playerId(), host.token);
    }

    // 초대받은 사람은 아직 토큰이 없으므로 방장 이름/정원 등 공개 정보만 제공합니다.
    public synchronized Preview preview(String code) {
        Room room = find(code);
        return new Preview(room.code, room.status, room.members.getFirst().player.nickname(), room.members.size(), room.expiresAt);
    }

    // 두 번째 참가자를 백으로 등록합니다. 정원 검사와 등록이 같은 잠금 안에서 실행됩니다.
    public synchronized Admission join(String code, String nickname) {
        String name = validateNickname(nickname);
        Room room = find(code);
        if (!"waiting".equals(room.status) || room.members.size() >= 2) throw error(HttpStatus.CONFLICT, "ROOM_FULL", "이미 두 사람이 참여한 방입니다.");
        // 같은 방 안에서만 이름 중복을 제한합니다. 참가자 인증에는 이름을 사용하지 않습니다.
        if (room.members.stream().anyMatch(member -> member.player.nickname().equalsIgnoreCase(name))) {
            throw error(HttpStatus.CONFLICT, "NICKNAME_TAKEN", "이 방에서 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.");
        }
        Member guest = member(name, "white");
        room.members.add(guest);
        room.presence.admit(guest.player.playerId(), clock.instant(), recovery.gracePeriod());
        // 두 명이 모였으므로 대국을 시작합니다. revision 증가를 통해 클라이언트도 변경을 구분합니다.
        room.status = "playing";
        room.revision++;
        updates.publish(view(room));
        return new Admission(view(room), guest.player.playerId(), guest.token);
    }

    // 전체 보드는 해당 방의 유효한 참가 토큰을 가진 사람에게만 반환합니다.
    public synchronized RoomView state(String code, String token) {
        Room room = lookup(code);
        authenticate(room, token);
        return view(room);
    }

    // 인증 → 구독 등록 → 초기 보드 전달을 같은 잠금 안에서 처리합니다.
    // 별개로 실행하면 최초 조회와 구독 사이에 상대가 둔 수를 놓칠 수 있습니다.
    public synchronized Runnable subscribe(String code, String token, Consumer<RoomView> listener) {
        Room room = lookup(code);
        Member member = authenticate(room, token);
        // 닫힌 방도 기존 참가자는 최종 보드를 복구할 수 있습니다. 새 구독/재대결은 만들지 않습니다.
        if ("closed".equals(room.status)) { listener.accept(view(room)); return () -> {}; }
        String playerId = member.player.playerId();
        String connectionId = UUID.randomUUID().toString();
        Runnable unsubscribe = updates.subscribe(code, listener);
        if (room.presence.connect(playerId, connectionId)) {
            room.revision++;
            updates.publish(view(room));
        } else listener.accept(view(room));
        return () -> disconnected(room, playerId, connectionId, unsubscribe);
    }

    // 해제 함수는 여러 종료 경로에서 불릴 수 있으므로 실제 마지막 연결이 사라질 때만 알립니다.
    private synchronized void disconnected(Room room, String playerId, String connectionId, Runnable unsubscribe) {
        unsubscribe.run();
        if (rooms.get(room.code) != room || "closed".equals(room.status)) return;
        if (room.presence.disconnect(playerId, connectionId, clock.instant(), recovery.gracePeriod())) {
            room.revision++;
            updates.publish(view(room));
        }
    }

    // 클라이언트가 보낸 완성 보드는 받지 않습니다. 좌표만 받아 서버가 직접 다음 상태를 계산합니다.
    public synchronized RoomView move(String code, String token, MoveRequest request) {
        Room room = find(code);
        Member member = authenticate(room, token);
        if (!"playing".equals(room.status)) throw error(HttpStatus.CONFLICT, "NOT_PLAYING", "두 사람이 입장한 진행 중인 방에서만 돌을 둘 수 있습니다.");
        requireConnected(room);
        if (request == null || request.revision() == null || request.row() == null || request.col() == null) {
            throw error(HttpStatus.BAD_REQUEST, "INVALID_MOVE", "착수 위치와 방 버전이 필요합니다.");
        }
        // 같은 버전으로 요청한 수가 이미 처리되었다면 중복/지연 요청으로 보고 거절합니다.
        if (request.revision() != room.revision) throw error(HttpStatus.CONFLICT, "STALE_ROOM", "방 상태가 변경되었습니다. 최신 보드에서 다시 두어 주세요.");
        if (!member.player.color().equals(room.game.currentTurn())) throw error(HttpStatus.CONFLICT, "NOT_YOUR_TURN", "상대방의 차례입니다.");
        try {
            // 순수 규칙 엔진이 좌표 유효성, 뒤집기, 패스, 종료를 계산합니다.
            room.game = OthelloRules.play(room.game, request.row(), request.col());
        } catch (IllegalArgumentException exception) {
            throw error(HttpStatus.BAD_REQUEST, "INVALID_MOVE", exception.getMessage());
        }
        // 게임이 끝났다면 방도 finished로 바꾸고 성공한 변경에 대해서만 버전을 증가시킵니다.
        room.status = room.game.status();
        room.revision++;
        // 패스와 종료도 새 보드에 포함되므로 같은 상태 메시지 하나로 두 화면을 동기화합니다.
        updates.publish(view(room));
        return view(room);
    }

    // 두 기기가 같은 대국 번호로 동시에 동의해도 잠금 안에서 순서대로 반영되므로 한 번만 시작합니다.
    // revision을 입력으로 받으면 첫 동의가 버전을 올려 두 번째 정상 동의까지 거절되므로 gameNumber를 씁니다.
    public synchronized RoomView rematch(String code, String token, RematchRequest request) {
        Room room = find(code);
        Member member = authenticate(room, token);
        if (request == null || request.gameNumber() == null || request.ready() == null || request.gameNumber() < 1) {
            throw error(HttpStatus.BAD_REQUEST, "INVALID_REMATCH", "대국 번호와 재대결 동의 여부가 필요합니다.");
        }
        if (request.gameNumber() != room.gameNumber) {
            throw error(HttpStatus.CONFLICT, "STALE_GAME", "이미 다음 대국으로 바뀌었습니다. 현재 화면을 확인해 주세요.");
        }
        if (!"finished".equals(room.status)) {
            throw error(HttpStatus.CONFLICT, "GAME_NOT_FINISHED", "대국이 끝난 뒤 재대결을 요청할 수 있습니다.");
        }
        if (request.ready()) requireConnected(room);
        // 같은 상태를 반복 요청하면 버전을 올리거나 알림을 중복 전송하지 않습니다.
        if (!room.rematch.setReady(member.player.playerId(), request.ready())) return view(room);
        List<String> playerIds = room.members.stream().map(value -> value.player.playerId()).toList();
        if (room.rematch.everyoneReady(playerIds)) startNextGame(room);
        room.revision++;
        RoomView updated = view(room);
        updates.publish(updated);
        return updated;
    }

    // 참가 ID·닉네임·토큰은 유지하고 돌 색상과 대국 상태만 초기화합니다.
    // 방 전체 revision은 초기화하지 않아 이전 판의 지연 응답이 새 보드를 덮어쓰지 못하게 합니다.
    private void startNextGame(Room room) {
        room.members.replaceAll(member -> {
            Player player = member.player;
            String nextColor = "black".equals(player.color()) ? "white" : "black";
            return new Member(new Player(player.playerId(), player.nickname(), player.userId(), nextColor), member.token);
        });
        room.game = OthelloRules.initial();
        room.status = "playing";
        room.gameNumber++;
        room.rematch.clear();
    }

    // 명시적 퇴장 시 남은 참가자에게도 즉시 종료 상태를 전달합니다. 최종 보드는 그대로 보존합니다.
    public synchronized void leave(String code, String token) {
        Room room = find(code);
        authenticate(room, token);
        closeRoom(room, "left");
    }

    // 조회/복구는 종료된 보드를 허용하지만, 입장·착수·재대결·퇴장은 열린 방에서만 허용합니다.
    private Room find(String code) {
        Room room = lookup(code);
        if ("closed".equals(room.status)) throw error(HttpStatus.GONE, "ROOM_CLOSED",
                "reconnect_timeout".equals(room.closeReason) ? "재접속 대기 시간이 지나 종료된 방입니다." : "참가자가 나가서 종료된 방입니다.");
        return room;
    }

    private Room lookup(String code) {
        if (code == null || !code.matches("[A-HJ-NP-Z2-9]{6}")) throw error(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND", "올바른 초대 링크가 아닙니다.");
        Room room = rooms.get(code);
        if (room == null) throw error(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND", "방을 찾을 수 없습니다. 초대 링크를 확인해 주세요.");
        if (!clock.instant().isBefore(room.expiresAt)) {
            closeRoom(room, "expired");
            rooms.remove(code);
            throw error(HttpStatus.GONE, "ROOM_EXPIRED", "방의 유효 시간이 지났습니다. 새 방을 만들어 주세요.");
        }
        // 스케줄러 실행 사이의 경계에서도 기한이 지난 재접속으로 방이 되살아나지 않게 합니다.
        if (!"closed".equals(room.status) && room.presence.recoveryExpired(clock.instant())) closeRoom(room, "reconnect_timeout");
        return room;
    }

    // 단절은 승패 판정으로 바꾸지 않습니다. 완료된 결과나 진행 중 보드를 보존한 채 방만 닫습니다.
    private void closeRoom(Room room, String reason) {
        if ("closed".equals(room.status)) return;
        room.status = "closed";
        room.closeReason = reason;
        room.rematch.clear();
        room.presence.close();
        room.revision++;
        updates.publish(view(room));
    }

    private void requireConnected(Room room) {
        if (!room.presence.allConnected()) throw error(HttpStatus.CONFLICT, "PLAYER_DISCONNECTED", "참가자가 다시 연결될 때까지 대국을 잠시 멈췄어요.");
    }

    // 서버가 시간을 결정합니다. 브라우저의 카운트다운은 안내용이며 종료 여부를 결정하지 않습니다.
    public synchronized void expireDisconnectedRooms() {
        var iterator = rooms.values().iterator();
        Instant now = clock.instant();
        while (iterator.hasNext()) {
            Room room = iterator.next();
            if (!now.isBefore(room.expiresAt)) { closeRoom(room, "expired"); iterator.remove(); }
            else if (!"closed".equals(room.status) && room.presence.recoveryExpired(now)) closeRoom(room, "reconnect_timeout");
        }
    }

    // 방 코드나 playerId만 아는 것으로는 참가 권한이 생기지 않습니다. 해당 방의 토큰을 확인합니다.
    private Member authenticate(Room room, String token) {
        if (token != null && token.length() <= 128) {
            for (Member member : room.members) {
                // 비밀값을 비교하므로 앞부분 불일치 시 바로 끝나는 문자열 비교 대신 바이트 비교를 사용합니다.
                if (MessageDigest.isEqual(member.token.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) return member;
            }
        }
        throw error(HttpStatus.UNAUTHORIZED, "INVALID_SESSION", "참가 정보를 확인할 수 없습니다. 초대 링크로 다시 입장해 주세요.");
    }

    // 프런트엔드 검증은 우회할 수 있으므로 서버도 독립적으로 검증합니다.
    // 공백 제거와 NFC 정규화 후 문자·숫자·밑줄·하이픈 2~12자만 허용합니다.
    private String validateNickname(String value) {
        if (value == null) throw error(HttpStatus.BAD_REQUEST, "INVALID_NICKNAME", "닉네임을 입력해 주세요.");
        String name = Normalizer.normalize(value.strip(), Normalizer.Form.NFC);
        if (!name.matches("[\\p{L}\\p{N}_-]{2,12}")) throw error(HttpStatus.BAD_REQUEST, "INVALID_NICKNAME", "닉네임은 공백 없이 문자·숫자·_·-로 2~12자 입력해 주세요.");
        return name;
    }

    // 공개 식별자는 UUID, 비밀 인증 토큰은 32바이트 보안 난수로 각각 발급합니다.
    // 계정 없이 참가하므로 호환용 userId는 null입니다. 식별과 인증에는 playerId와 토큰을 사용합니다.
    private Member member(String nickname, String color) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return new Member(new Player(UUID.randomUUID().toString(), nickname, null, color), Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    // 공유하기 짧은 코드를 만듭니다. 중복 여부는 create에서 별도로 확인합니다.
    private String generateCode() {
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return code.toString();
    }

    // 서버 내부 Member의 토큰을 제거하고 보드를 복사해 외부용 응답을 만듭니다.
    // 반환된 배열을 호출자가 수정하더라도 실제 서버 보드가 변하면 안 됩니다.
    private RoomView view(Room room) {
        return new RoomView(room.code, room.status, room.members.stream().map(member -> member.player).toList(),
                OthelloRules.copy(room.game), room.revision, room.expiresAt, room.gameNumber, room.rematch.snapshot(),
                room.presence.snapshot(), room.closeReason, clock.instant());
    }

    // 예외 생성 형식을 통일합니다. HTTP 응답으로 변환하는 일은 RoomErrorHandler가 담당합니다.
    private static RoomException error(HttpStatus status, String code, String message) { return new RoomException(status, code, message); }
    // 인증 토큰을 포함하는 서버 내부 모델입니다. 이 레코드를 그대로 응답으로 보내지 않습니다.
    private record Member(Player player, String token) {}

    // 서비스만 수정하는 저장 객체입니다. 공개 응답 모델인 RoomView와 역할을 분리합니다.
    private static final class Room {
        final String code;
        final Instant expiresAt;
        final List<Member> members = new ArrayList<>();
        String status = "waiting";
        // 대기 중에도 초기 보드는 준비해 두지만, move는 방 상태가 playing일 때만 허용합니다.
        GameState game = OthelloRules.initial();
        int revision = 0;
        int gameNumber = 1;
        final RematchVotes rematch = new RematchVotes();
        final RoomPresence presence = new RoomPresence();
        String closeReason;

        Room(String code, Instant expiresAt) { this.code = code; this.expiresAt = expiresAt; }
    }

}
