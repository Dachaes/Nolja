package com.example.backend.mole;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGenerator;

/** Server-owned clock, targets and scores. RoomService serializes all access. */
public final class MoleMatch {
    public record Target(int id, int hole, Instant appearedAt, Instant expiresAt, String claimedBy, int points) {}
    public record Score(String playerId, int score, int hits, int misses, int combo, int bestCombo) {}
    public record View(Instant startsAt, Instant endsAt, Instant pausedAt, boolean finished,
                       List<Target> holes, List<Score> scores) {}

    private final Target[] holes = new Target[16];
    private final Map<String, Score> scores = new LinkedHashMap<>();
    private final Map<String, Instant> lastMisses = new HashMap<>();
    private final RandomGenerator random;
    private Instant startsAt;
    private Instant endsAt;
    private Instant pausedAt;
    private Instant nextSpawn;
    private int sequence;
    private boolean finished;

    public MoleMatch(List<String> playerIds, RandomGenerator random) {
        this.random = random;
        playerIds.forEach(id -> scores.put(id, new Score(id, 0, 0, 0, 0, 0)));
    }

    public boolean tick(Instant now, boolean connected) {
        if (finished) return false;
        if (startsAt == null) {
            if (!connected) return false;
            startsAt = now.plusSeconds(3);
            endsAt = startsAt.plusSeconds(30);
            nextSpawn = startsAt;
            return true;
        }
        // Advance to the disconnection instant before freezing the clock.
        if (!connected) {
            if (pausedAt != null) return false;
            advance(now);
            if (!finished) pausedAt = now;
            return true;
        }
        boolean changed = false;
        if (pausedAt != null) {
            Duration pause = Duration.between(pausedAt, now);
            startsAt = startsAt.plus(pause);
            endsAt = endsAt.plus(pause);
            nextSpawn = nextSpawn.plus(pause);
            for (int i = 0; i < holes.length; i++) {
                Target target = holes[i];
                if (target != null) holes[i] = new Target(target.id(), i, target.appearedAt().plus(pause),
                        target.expiresAt().plus(pause), target.claimedBy(), target.points());
            }
            pausedAt = null;
            changed = true;
        }
        return advance(now) || changed;
    }

    private boolean advance(Instant now) {
        if (!now.isBefore(endsAt)) {
            finished = true;
            Arrays.fill(holes, null);
            return true;
        }
        if (now.isBefore(startsAt)) return false;
        boolean changed = false;
        for (int i = 0; i < holes.length; i++) {
            if (holes[i] != null && !now.isBefore(holes[i].expiresAt())) {
                holes[i] = null;
                changed = true;
            }
        }
        if (!now.isBefore(nextSpawn)) {
            long elapsed = Duration.between(startsAt, now).toMillis();
            int targetCount = elapsed < 15000 ? 3 : 4;
            int active = (int) Arrays.stream(holes).filter(target -> target != null && target.claimedBy() == null).count();
            List<Integer> free = new ArrayList<>();
            for (int i = 0; i < holes.length; i++) if (holes[i] == null) free.add(i);
            while (active < targetCount && !free.isEmpty()) {
                int hole = free.remove(random.nextInt(free.size()));
                long lifetime = Math.max(700, 1450 - elapsed / 40);
                holes[hole] = new Target(++sequence, hole, now, now.plusMillis(lifetime), null, 0);
                active++;
                changed = true;
            }
            nextSpawn = now.plusMillis(Math.max(300, 600 - elapsed / 100));
        }
        return changed;
    }

    /** Stale targets (including an opponent's catch) have no penalty. No revision lock across distinct holes. */
    public boolean hit(String playerId, int hole, Integer targetId, Instant now) {
        if (finished || startsAt == null || now.isBefore(startsAt) || !now.isBefore(endsAt) || pausedAt != null) return false;
        Target target = holes[hole];
        if (targetId != null && (target == null || target.id() != targetId || target.claimedBy() != null || !now.isBefore(target.expiresAt()))) return false;
        // An empty-hole click that raced with a new spawn is harmless too.
        if (targetId == null && target != null) return false;
        Score score = scores.get(playerId);
        if (targetId == null) {
            Instant previous = lastMisses.get(playerId);
            if (previous != null && now.isBefore(previous.plusMillis(70))) return false;
            lastMisses.put(playerId, now);
            scores.put(playerId, new Score(playerId, score.score(), score.hits(), score.misses() + 1, 0, score.bestCombo()));
        } else {
            int combo = score.combo() + 1;
            int points = 100 + Math.min(100, (combo / 3) * 25);
            scores.put(playerId, new Score(playerId, score.score() + points, score.hits() + 1, score.misses(), combo, Math.max(score.bestCombo(), combo)));
            holes[hole] = new Target(target.id(), hole, target.appearedAt(), now.plusMillis(320), playerId, points);
        }
        return true;
    }

    public boolean finished() { return finished; }
    public View snapshot() {
        // List.copyOf rejects the empty (null) holes. Wrap a defensive array copy instead.
        return new View(startsAt, endsAt, pausedAt, finished,
                java.util.Collections.unmodifiableList(Arrays.asList(holes.clone())), List.copyOf(scores.values()));
    }
}
