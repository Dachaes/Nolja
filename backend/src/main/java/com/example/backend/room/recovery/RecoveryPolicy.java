package com.example.backend.room.recovery;

import java.time.Duration;

/** 복구 대기 시간과 heartbeat 제한을 모읍니다. 테스트에서는 짧은 시간으로 바꿀 수 있습니다. */
public record RecoveryPolicy(Duration gracePeriod, Duration heartbeatTimeout) {
    public static final RecoveryPolicy DEFAULT = new RecoveryPolicy(Duration.ofMinutes(2), Duration.ofSeconds(45));

    public RecoveryPolicy {
        if (gracePeriod.isNegative() || gracePeriod.isZero() || heartbeatTimeout.isNegative() || heartbeatTimeout.isZero()) {
            throw new IllegalArgumentException("복구 대기 시간은 0보다 커야 합니다.");
        }
    }
}
