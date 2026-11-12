package com.example.backend.mole;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGenerator;

/**
 * 두더지잡기 한 판의 시간, 두더지 위치, 참가자 점수를 보관합니다.
 * 브라우저가 보낸 점수를 믿지 않고 이 클래스가 직접 계산합니다.
 * RoomService가 한 번에 하나의 작업만 실행하게 하므로 같은 두더지가 중복 득점되지 않습니다.
 */
public final class MoleMatch {

    // 숫자의 의미를 이름으로 표현해 규칙을 확인하거나 바꾸기 쉽게 합니다.
    private static final int HOLE_COUNT = 16;
    private static final int COUNTDOWN_SECONDS = 3;
    private static final int GAME_SECONDS = 30;
    private static final int BASE_POINTS = 100;

    // record는 값을 묶는 자료형입니다. 예를 들어 target.id()로 두더지의 고유 번호를 읽습니다.
    public record Target(
        int id,
        int hole,
        Instant appearedAt,
        Instant expiresAt,
        String claimedBy,
        int points
    ) {}

    // score: 총점, hits/misses: 성공/실패 횟수, combo/bestCombo: 현재/최고 연속 성공 횟수입니다.
    public record Score(
        String playerId,
        int score,
        int hits,
        int misses,
        int combo,
        int bestCombo
    ) {}

    // 브라우저에 보낼 현재 게임 상태입니다. 빈 구멍은 holes 목록의 null로 표시합니다.
    public record View(
        Instant startsAt,
        Instant endsAt,
        Instant pausedAt,
        boolean finished,
        List<Target> holes,
        List<Score> scores
    ) {}

    private final Target[] holes = new Target[HOLE_COUNT];
    // 참가 순서를 유지해 상태를 보낼 때 점수 목록의 순서도 일정하게 합니다.
    private final Map<String, Score> scores = new LinkedHashMap<>();
    // 빈 구멍을 아주 빠르게 연속으로 누르는 중복 입력을 걸러낼 때 사용합니다.
    private final Map<String, Instant> lastMisses = new HashMap<>();
    private final RandomGenerator random;
    private Instant startsAt;
    private Instant endsAt;
    private Instant pausedAt;
    private Instant nextSpawn;
    // 새 두더지를 만들 때마다 증가합니다. 같은 구멍에 나중에 나온 두더지와 구분하는 번호입니다.
    private int sequence;
    private boolean finished;

    // 난수 생성기를 외부에서 받으면 테스트에서 등장 위치를 재현할 수 있습니다.
    public MoleMatch(List<String> playerIds, RandomGenerator random) {
        this.random = random;
        playerIds.forEach(id -> scores.put(id, new Score(id, 0, 0, 0, 0, 0)));
    }

    // 서버가 주기적으로 호출합니다. 반환값이 true일 때만 바뀐 상태를 참가자에게 전송합니다.
    public boolean tick(Instant now, boolean connected) {
        if (finished) {
            return false;
        }
        if (startsAt == null) {
            if (!connected) {
                return false;
            }
            startsAt = now.plusSeconds(COUNTDOWN_SECONDS);
            endsAt = startsAt.plusSeconds(GAME_SECONDS);
            nextSpawn = startsAt;
            return true;
        }
        // 끊긴 시점까지의 변화를 먼저 계산하고 시간을 멈춥니다. 이미 종료 시각이면 종료 처리합니다.
        if (!connected) {
            if (pausedAt != null) {
                return false;
            }
            advance(now);
            if (!finished) {
                pausedAt = now;
            }
            return true;
        }
        boolean changed = false;
        if (pausedAt != null) {
            resume(now);
            changed = true;
        }
        return advance(now) || changed;
    }

    // 멈춰 있던 시간을 모든 예정 시각에 더해 남은 게임 시간과 두더지 표시 시간을 보존합니다.
    private void resume(Instant now) {
        Duration pause = Duration.between(pausedAt, now);
        startsAt = startsAt.plus(pause);
        endsAt = endsAt.plus(pause);
        nextSpawn = nextSpawn.plus(pause);
        for (int hole = 0; hole < holes.length; hole++) {
            Target target = holes[hole];
            if (target != null) {
                holes[hole] = new Target(
                    target.id(),
                    hole,
                    target.appearedAt().plus(pause),
                    target.expiresAt().plus(pause),
                    target.claimedBy(),
                    target.points()
                );
            }
        }
        pausedAt = null;
    }

    // 종료 확인 → 표시 시간이 지난 두더지 제거 → 새 두더지 등장 순으로 처리합니다.
    private boolean advance(Instant now) {
        if (!now.isBefore(endsAt)) {
            finished = true;
            Arrays.fill(holes, null);
            return true;
        }
        if (now.isBefore(startsAt)) {
            return false;
        }
        boolean changed = false;
        for (int i = 0; i < holes.length; i++) {
            if (holes[i] != null && !now.isBefore(holes[i].expiresAt())) {
                holes[i] = null;
                changed = true;
            }
        }
        if (!now.isBefore(nextSpawn)) {
            // spawn은 시간이 되면 반드시 호출해야 하므로 changed 검사보다 앞에서 실행합니다.
            changed = spawn(now) || changed;
        }
        return changed;
    }

    // 전반에는 최대 3마리, 후반에는 최대 4마리를 유지합니다. 시간이 지날수록 빨리 숨고 등장합니다.
    private boolean spawn(Instant now) {
        long elapsed = Duration.between(startsAt, now).toMillis();
        int targetCount = elapsed < 15000 ? 3 : 4;
        int active = (int) Arrays.stream(holes)
            .filter(target -> target != null && target.claimedBy() == null)
            .count();
        List<Integer> freeHoles = new ArrayList<>();
        for (int hole = 0; hole < holes.length; hole++) {
            if (holes[hole] == null) {
                freeHoles.add(hole);
            }
        }

        boolean changed = false;
        while (active < targetCount && !freeHoles.isEmpty()) {
            // 뽑은 구멍은 목록에서 제거해 같은 위치에 두 마리가 등장하지 않게 합니다.
            int hole = freeHoles.remove(random.nextInt(freeHoles.size()));
            long lifetime = Math.max(700, 1450 - elapsed / 40);
            holes[hole] = new Target(++sequence, hole, now, now.plusMillis(lifetime), null, 0);
            active++;
            changed = true;
        }
        nextSpawn = now.plusMillis(Math.max(300, 600 - elapsed / 100));
        return changed;
    }

    // 구멍 번호와 두더지 ID가 모두 맞아야 득점합니다. 상대가 먼저 잡은 두더지나 늦은 입력은 무시합니다.
    // 서로 다른 구멍의 입력은 별개이므로 방 전체 버전 대신 두더지 ID로 중복을 판별합니다.
    public boolean hit(String playerId, int hole, Integer targetId, Instant now) {
        if (
            finished ||
            startsAt == null ||
            now.isBefore(startsAt) ||
            !now.isBefore(endsAt) ||
            pausedAt != null
        ) {
            return false;
        }
        Target target = holes[hole];
        if (
            targetId != null &&
            (target == null ||
                target.id() != targetId ||
                target.claimedBy() != null ||
                !now.isBefore(target.expiresAt()))
        ) {
            return false;
        }
        // 빈 구멍을 눌렀지만 요청이 도착하기 전에 새 두더지가 나왔다면 실수로 처리하지 않습니다.
        if (targetId == null && target != null) {
            return false;
        }
        Score score = scores.get(playerId);
        if (targetId == null) {
            // 70ms 안의 빈 구멍 연속 입력은 중복으로 간주합니다. 정상 실수는 콤보만 초기화합니다.
            Instant previous = lastMisses.get(playerId);
            if (previous != null && now.isBefore(previous.plusMillis(70))) {
                return false;
            }
            lastMisses.put(playerId, now);
            scores.put(
                playerId,
                new Score(
                    playerId,
                    score.score(),
                    score.hits(),
                    score.misses() + 1,
                    0,
                    score.bestCombo()
                )
            );
        } else {
            int combo = score.combo() + 1;
            // 정수 나눗셈으로 3회마다 보너스를 25점씩 높이고, 기본 점수 외 보너스는 100점으로 제한합니다.
            int points = BASE_POINTS + Math.min(100, (combo / 3) * 25);
            scores.put(
                playerId,
                new Score(
                    playerId,
                    score.score() + points,
                    score.hits() + 1,
                    score.misses(),
                    combo,
                    Math.max(score.bestCombo(), combo)
                )
            );
            // 잡은 표시를 320ms 동안 남겨 두 참가자 모두 누가 득점했는지 확인할 수 있게 합니다.
            holes[hole] = new Target(
                target.id(),
                hole,
                target.appearedAt(),
                now.plusMillis(320),
                playerId,
                points
            );
        }
        return true;
    }

    // 방 서비스가 게임 종료 여부를 읽을 때 사용합니다.
    public boolean finished() {
        return finished;
    }

    // 내부 배열을 그대로 주면 외부 코드가 서버 상태를 바꿀 수 있으므로 복사본을 반환합니다.
    public View snapshot() {
        // List.copyOf는 null을 허용하지 않습니다. 빈 구멍을 유지하도록 배열을 복사한 뒤 읽기 전용으로 감쌉니다.
        return new View(
            startsAt,
            endsAt,
            pausedAt,
            finished,
            Collections.unmodifiableList(Arrays.asList(holes.clone())),
            List.copyOf(scores.values())
        );
    }
}
