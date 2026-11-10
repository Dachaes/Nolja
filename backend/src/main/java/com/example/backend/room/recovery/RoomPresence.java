package com.example.backend.room.recovery;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 참가자별 실제 소켓과 복귀 기한을 관리합니다. 모든 변경은 RoomService의 잠금 안에서 실행합니다. */
public final class RoomPresence {
    public record PresenceView(String playerId, boolean connected, Instant reconnectDeadline) {}
    private final Map<String, ConnectionState> players = new LinkedHashMap<>();

    // 입장 HTTP 응답과 첫 소켓 인증 사이에도 자리를 예약합니다. 인증 전에는 착수할 수 없습니다.
    public void admit(String playerId, Instant now, Duration gracePeriod) {
        players.put(playerId, new ConnectionState(now.plus(gracePeriod)));
    }

    // 새로고침 중 새 소켓이 먼저 열려도 이전 소켓 종료가 새 연결을 끊긴 상태로 만들면 안 됩니다.
    // 참가 ID 하나에 소켓 ID 여러 개를 기록하고 마지막 소켓이 사라질 때만 오프라인으로 바꿉니다.
    public boolean connect(String playerId, String connectionId) {
        ConnectionState state = players.get(playerId);
        boolean wasOffline = state.connections.isEmpty();
        state.connections.add(connectionId);
        state.deadline = null;
        return wasOffline;
    }

    public boolean disconnect(String playerId, String connectionId, Instant now, Duration gracePeriod) {
        ConnectionState state = players.get(playerId);
        if (!state.connections.remove(connectionId) || !state.connections.isEmpty()) return false;
        state.deadline = now.plus(gracePeriod);
        return true;
    }

    public boolean allConnected() { return players.values().stream().allMatch(state -> !state.connections.isEmpty()); }

    public boolean recoveryExpired(Instant now) {
        return players.values().stream().anyMatch(state -> state.deadline != null && !now.isBefore(state.deadline));
    }

    public List<PresenceView> snapshot() {
        return players.entrySet().stream().map(entry -> new PresenceView(entry.getKey(),
                !entry.getValue().connections.isEmpty(), entry.getValue().deadline)).toList();
    }

    // 닫힌 방에는 복귀 타이머가 필요 없습니다. 마지막 보드와 참가자 정보는 RoomService에 남습니다.
    public void close() { players.values().forEach(state -> { state.connections.clear(); state.deadline = null; }); }

    private static final class ConnectionState {
        final Set<String> connections = new HashSet<>();
        Instant deadline;
        ConnectionState(Instant deadline) { this.deadline = deadline; }
    }
}
