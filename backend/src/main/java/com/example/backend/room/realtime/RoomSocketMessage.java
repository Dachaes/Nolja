package com.example.backend.room.realtime;

import com.example.backend.room.RoomDtos.ApiError;
import com.example.backend.room.RoomDtos.RoomView;

// 전송 규약입니다. 항상 완성된 상태를 보내므로 중간 메시지를 놓쳐도 다음 상태로 복구할 수 있습니다.
// 인증 요청의 비밀 토큰은 어떤 서버 메시지에도 포함하지 않습니다.
public record RoomSocketMessage(String type, RoomView room, ApiError error, Integer status) {
    public static RoomSocketMessage state(RoomView room) {
        return new RoomSocketMessage("room", room, null, null);
    }

    public static RoomSocketMessage pong() {
        return new RoomSocketMessage("pong", null, null, null);
    }

    public static RoomSocketMessage failure(String code, String message, int status) {
        return new RoomSocketMessage("error", null, new ApiError(code, message), status);
    }
}
