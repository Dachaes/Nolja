package com.example.backend.room.realtime;

import com.example.backend.room.RoomDtos.RoomView;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

/**
 * 방 코드마다 상태 변경을 알려 줄 함수(구독자)를 모아 둡니다.
 * Consumer<RoomView>는 방 상태를 인자로 받아 처리하는 함수이고, accept(room)으로 실행합니다.
 * 실제 전송은 연결 객체에 맡기므로 이 클래스는 게임 규칙이나 소켓 사용법을 몰라도 됩니다.
 */
@Component
public class RoomUpdates {

    private final ConcurrentHashMap<String, Set<Consumer<RoomView>>> listeners =
        new ConcurrentHashMap<>();

    // 구독 해제 함수를 반환합니다. 화면 이동/소켓 종료 시 반드시 호출해 참조가 남지 않게 합니다.
    public Runnable subscribe(String code, Consumer<RoomView> listener) {
        // compute는 해당 방의 목록을 읽고 수정해 저장하는 과정을 한 번에 처리합니다.
        listeners.compute(code, (key, current) -> {
            Set<Consumer<RoomView>> group =
                current == null ? ConcurrentHashMap.newKeySet() : current;
            group.add(listener);
            return group;
        });
        // 마지막 구독자가 나가면 null을 반환해 방의 빈 구독 목록도 저장소에서 제거합니다.
        return () ->
            listeners.computeIfPresent(code, (key, group) -> {
                group.remove(listener);
                return group.isEmpty() ? null : group;
            });
    }

    // 콜백은 소켓에 직접 쓰지 않고 전송 대기열에만 넣습니다. 느린 기기가 착수 처리를 막지 않습니다.
    public void publish(RoomView room) {
        Set<Consumer<RoomView>> group = listeners.get(room.code());
        if (group != null) {
            group.forEach(listener -> listener.accept(room));
        }
    }
}
