package com.example.backend.room.recovery;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import com.example.backend.room.RoomService;

// 두 사람 모두 끊긴 방도 다음 요청을 기다리지 않고 종료할 수 있도록 서버가 기한을 확인합니다.
@Component
public class RoomRecoveryMonitor {
    private final RoomService rooms;
    public RoomRecoveryMonitor(RoomService rooms) { this.rooms = rooms; }

    @Scheduled(fixedDelayString = "${room.recovery.check-interval-ms:1000}")
    public void checkDeadlines() { rooms.expireDisconnectedRooms(); }
}
