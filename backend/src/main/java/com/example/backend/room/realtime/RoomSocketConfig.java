package com.example.backend.room.realtime;

import com.example.backend.config.WebOriginConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

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
        // 설정이 비어 있으면 기존의 동일 출처 검사만 적용합니다.
        registry.addHandler(handler, "/ws/rooms/*", "/ws/games/*/rooms/*").setAllowedOrigins(origins.allowedOrigins());
    }
}
