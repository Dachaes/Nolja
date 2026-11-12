package com.example.backend.room.realtime;

import com.example.backend.config.WebOriginConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

// WebSocket은 연결을 유지한 채 서버가 브라우저에 상태를 바로 보낼 수 있는 통신 방식입니다.
// 일반 HTTP API와 별도로 연결 주소와 메시지 처리기를 등록합니다.
@Configuration
@EnableWebSocket
public class RoomSocketConfig implements WebSocketConfigurer {

    private final RoomSocketHandler handler;
    private final WebOriginConfig origins;

    public RoomSocketConfig(RoomSocketHandler handler, WebOriginConfig origins) {
        this.handler = handler;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // * 부분은 실제 방 코드나 게임 종류에 해당합니다. 연결 이후의 인증은 handler에서 진행합니다.
        // 설정이 비어 있으면 같은 출처(프로토콜·호스트·포트)의 연결만 허용합니다.
        registry
            .addHandler(handler, "/ws/rooms/*", "/ws/games/*/rooms/*")
            .setAllowedOrigins(origins.allowedOrigins());
    }
}
