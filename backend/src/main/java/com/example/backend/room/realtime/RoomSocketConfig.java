package com.example.backend.room.realtime;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class RoomSocketConfig implements WebSocketConfigurer {
    private final RoomSocketHandler handler;
    public RoomSocketConfig(RoomSocketHandler handler) { this.handler = handler; }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Spring의 기본 same-origin 검사를 유지합니다. 개발/배포 프록시도 원래 Host를 전달해야 합니다.
        registry.addHandler(handler, "/ws/rooms/*");
    }
}
