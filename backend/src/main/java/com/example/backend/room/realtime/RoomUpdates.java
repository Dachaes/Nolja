package com.example.backend.room.realtime;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;
import com.example.backend.room.RoomDtos.RoomView;

/** 방별 구독자 목록입니다. 게임 규칙과 네트워크 전송을 서로 분리합니다. */
@Component
public class RoomUpdates {
    private final ConcurrentHashMap<String, Set<Consumer<RoomView>>> listeners = new ConcurrentHashMap<>();

    // 구독 해제 함수를 반환합니다. 화면 이동/소켓 종료 시 반드시 호출해 참조가 남지 않게 합니다.
    public Runnable subscribe(String code, Consumer<RoomView> listener) {
        listeners.compute(code, (key, current) -> {
            Set<Consumer<RoomView>> group = current == null ? ConcurrentHashMap.newKeySet() : current;
            group.add(listener);
            return group;
        });
        return () -> listeners.computeIfPresent(code, (key, group) -> {
            group.remove(listener);
            return group.isEmpty() ? null : group;
        });
    }

    // 콜백은 소켓에 직접 쓰지 않고 전송 대기열에만 넣습니다. 느린 기기가 착수 처리를 막지 않습니다.
    public void publish(RoomView room) {
        Set<Consumer<RoomView>> group = listeners.get(room.code());
        if (group != null) group.forEach(listener -> listener.accept(room));
    }
}
