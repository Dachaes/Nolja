package com.example.backend.room.rematch;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 재대결 동의만 관리합니다. 인증·방 상태 검사와 동시 요청 잠금은 RoomService가 담당합니다. */
public final class RematchVotes {

    // 닉네임이 같거나 돌 색상이 바뀌어도 참가자를 구분할 수 있도록 playerId를 저장합니다.
    private final Set<String> readyPlayerIds = new LinkedHashSet<>();

    // 토글이 아닌 원하는 상태를 받습니다. 같은 요청이 다시 와도 동의가 반대로 바뀌지 않습니다.
    public boolean setReady(String playerId, boolean ready) {
        return ready ? readyPlayerIds.add(playerId) : readyPlayerIds.remove(playerId);
    }

    public boolean everyoneReady(List<String> playerIds) {
        // 두 참가자 모두 동의 목록에 있어야 합니다. 한 사람만 있는 대기실은 재대결할 수 없습니다.
        return playerIds.size() == 2 && readyPlayerIds.containsAll(playerIds);
    }

    // 수정할 수 없는 복사본만 노출해 응답을 통해 내부 동의 목록을 바꾸지 못하게 합니다.
    public List<String> snapshot() {
        return List.copyOf(readyPlayerIds);
    }

    public void clear() {
        // 다음 판 시작 또는 방 종료 시 이전 동의가 남지 않도록 비웁니다.
        readyPlayerIds.clear();
    }
}
