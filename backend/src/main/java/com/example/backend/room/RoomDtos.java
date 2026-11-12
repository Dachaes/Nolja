package com.example.backend.room;

import com.example.backend.mole.MoleMatch;
import com.example.backend.othello.GameState;
import com.example.backend.room.recovery.RoomPresence.PresenceView;
import java.time.Instant;
import java.util.List;

// DTO는 API로 주고받는 데이터의 모양입니다. record가 생성자와 읽기 메서드 등을 자동으로 만듭니다.
// 관련 DTO를 한곳에 모으며, 이 클래스 자체의 인스턴스는 만들지 않습니다.
public final class RoomDtos {

    private RoomDtos() {}

    // JSON은 필드 이름과 값으로 데이터를 주고받는 형식입니다. 예: {"nickname":"민서"}
    // 방 입장 시 받는 닉네임입니다.
    public record NicknameRequest(String nickname) {}

    // 방 생성 시에는 닉네임과 선택한 게임 종류를 함께 받습니다.
    public record CreateRequest(String nickname, String gameType) {}

    // hole은 0~15번 구멍, moleId는 두더지 번호입니다. 빈 구멍을 눌렀다면 moleId는 null입니다.
    public record HitRequest(Integer hole, Integer moleId, Integer gameNumber) {}

    // Integer는 누락된 필드를 null로 구분할 수 있습니다. int로 받으면 기본값 0과 구분하기 어렵습니다.
    public record MoveRequest(Integer row, Integer col, Integer revision) {}

    // 게임 번호로 지난 판에서 늦게 도착한 재대결 요청을 구분합니다. ready=false는 본인의 동의 취소입니다.
    public record RematchRequest(Integer gameNumber, Boolean ready) {}

    // 외부에 보여도 되는 참가자 정보입니다. 인증 토큰은 포함하지 않습니다.
    public record Player(String playerId, String nickname, String userId, String color) {}

    // 초대받은 사람에게 공개할 방 정보만 제공합니다.
    public record Preview(
        String code,
        String status,
        String hostNickname,
        int playerCount,
        Instant expiresAt,
        String gameType
    ) {}

    // 참가자 전용 상태 응답입니다. revision으로 새 응답과 오래된 응답을 구분합니다.
    // gameNumber는 재대결 시작 시에만 증가하고 revision은 모든 방 상태 변경 시 증가합니다.
    // presence는 연결/복귀 기한, closeReason은 방 종료 이유, serverTime은 기기 시각 보정용입니다.
    public record RoomView(
        String code,
        String status,
        List<Player> players,
        GameState game,
        int revision,
        Instant expiresAt,
        int gameNumber,
        List<String> rematchReadyPlayerIds,
        List<PresenceView> presence,
        String closeReason,
        Instant serverTime,
        String gameType,
        MoleMatch.View mole
    ) {}

    // 생성/입장 요청자에게만 반환하는 비밀 토큰 포함 응답입니다.
    public record Admission(RoomView room, String playerId, String token) {}

    // code는 프로그램의 분기용, message는 사용자에게 보여줄 안내용입니다.
    public record ApiError(String code, String message) {}
}
