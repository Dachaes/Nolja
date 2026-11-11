package com.example.backend.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 별도 배포한 프런트엔드의 HTTP와 WebSocket 출처를 함께 관리합니다. */
@Configuration
public class WebOriginConfig implements WebMvcConfigurer {
    private final String[] allowedOrigins;

    public WebOriginConfig(@Value("${app.allowed-origins:}") String origins) {
        allowedOrigins = Arrays.stream(origins.split(","))
            .map(String::trim).filter(origin -> !origin.isEmpty()).toArray(String[]::new);
    }

    public String[] allowedOrigins() { return allowedOrigins.clone(); }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.length == 0) return;
        registry.addMapping("/api/**")
            .allowedOrigins(allowedOrigins)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("Content-Type", "Authorization")
            .maxAge(3600);
    }
}
