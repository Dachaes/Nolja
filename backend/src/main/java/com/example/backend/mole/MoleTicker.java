package com.example.backend.mole;

import com.example.backend.room.RoomService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MoleTicker {
    private final RoomService rooms;
    public MoleTicker(RoomService rooms) { this.rooms = rooms; }

    @Scheduled(fixedDelay = 80)
    public void tick() { rooms.tickMoleRooms(); }
}
