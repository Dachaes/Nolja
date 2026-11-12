package com.example.backend.config;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 프런트엔드와 백엔드의 주소가 다를 때 접속을 허용할 프런트엔드 주소를 관리합니다.
 * 브라우저는 다른 주소의 서버 요청을 기본적으로 제한하므로 허용 목록을 명시해야 합니다.
 * HTTP 요청과 WebSocket 연결에서 같은 목록을 사용합니다.
 */
@Configuration
public class WebOriginConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public WebOriginConfig(@Value("${app.allowed-origins:}") String origins) {
        // 설정 예: https://doran.example,https://preview.example
        // 쉼표로 나누고 공백과 빈 항목을 제거한 뒤 문자열 배열로 만듭니다.
        allowedOrigins = Arrays.stream(origins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toArray(String[]::new);
    }

    public String[] allowedOrigins() {
        // 배열을 복사해 반환해야 다른 클래스가 원래 허용 목록을 수정할 수 없습니다.
        return allowedOrigins.clone();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 허용 목록이 비어 있으면 다른 출처에 대한 허용 규칙을 추가하지 않습니다.
        if (allowedOrigins.length == 0) {
            return;
        }
        // /api 아래 요청에만 적용합니다. OPTIONS는 브라우저가 실제 요청 전에 보내는 허용 확인입니다.
        registry
            .addMapping("/api/**")
            .allowedOrigins(allowedOrigins)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("Content-Type", "Authorization")
            .maxAge(3600);
    }
}
