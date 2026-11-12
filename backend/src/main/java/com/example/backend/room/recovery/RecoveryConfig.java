package com.example.backend.room.recovery;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

// HTTP 요청이 없어도 복구 기한과 조용히 끊긴 소켓을 확인하도록 주기 작업을 활성화합니다.
@Configuration
@EnableScheduling
public class RecoveryConfig {

    @Bean
    public RecoveryPolicy recoveryPolicy(
        @Value("${room.recovery.grace-period-ms:120000}") long graceMs,
        @Value("${room.recovery.heartbeat-timeout-ms:45000}") long heartbeatMs
    ) {
        // @Value는 설정 파일의 값을 읽고, 콜론 뒤 숫자는 값이 없을 때의 기본값입니다.
        // 설정의 밀리초 숫자를 Duration(시간 길이)으로 바꿔 Spring이 공유할 정책 객체를 만듭니다.
        return new RecoveryPolicy(Duration.ofMillis(graceMs), Duration.ofMillis(heartbeatMs));
    }
}
