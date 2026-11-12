package com.example.backend.mole;

import com.example.backend.room.RoomService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Spring이 이 객체를 생성합니다. 브라우저의 요청이 없어도 게임 시간이 흐르도록 주기적으로 호출합니다.
@Component
public class MoleTicker {

    private final RoomService rooms;

    public MoleTicker(RoomService rooms) {
        this.rooms = rooms;
    }

    @Scheduled(fixedDelay = 80)
    public void tick() {
        // 이전 실행이 끝난 뒤 80ms를 기다렸다가 다시 실행합니다. 실제 규칙 계산은 RoomService에 맡깁니다.
        rooms.tickMoleRooms();
    }
}
