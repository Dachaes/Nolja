package com.example.backend.room.recovery;

import java.time.Duration;

/**
 * 재접속을 기다릴 시간과 연결 확인 메시지(heartbeat)가 없어도 기다릴 시간을 보관합니다.
 * Duration은 특정 시각이 아닌 '2분', '45초' 같은 시간 길이를 나타냅니다.
 * 테스트에서는 실제로 오래 기다리지 않도록 짧은 정책을 만들 수 있습니다.
 */
public record RecoveryPolicy(Duration gracePeriod, Duration heartbeatTimeout) {
    public static final RecoveryPolicy DEFAULT = new RecoveryPolicy(
        Duration.ofMinutes(2),
        Duration.ofSeconds(45)
    );

    public RecoveryPolicy {
        // record의 생성 과정에서 검사하므로 어떤 경로로 객체를 만들어도 잘못된 시간은 사용할 수 없습니다.
        if (
            gracePeriod.isNegative() ||
            gracePeriod.isZero() ||
            heartbeatTimeout.isNegative() ||
            heartbeatTimeout.isZero()
        ) {
            throw new IllegalArgumentException("복구 대기 시간은 0보다 커야 합니다.");
        }
    }
}
