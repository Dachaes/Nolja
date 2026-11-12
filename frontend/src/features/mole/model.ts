import type { MoleScore, MoleState, MoleTarget } from './types.ts'

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0

// 두더지 ID, 위치, 시각, 득점자가 유효한지 확인합니다. null은 정상적인 빈 구멍입니다.
function isValidTarget(target: MoleTarget | null, hole: number, playerIds: Set<string>) {
  if (target === null) {
    return true
  }
  return (
    !!target &&
    Number.isSafeInteger(target.id) &&
    target.id > 0 &&
    target.hole === hole &&
    isDate(target.appearedAt) &&
    isDate(target.expiresAt) &&
    (target.claimedBy === null || playerIds.has(target.claimedBy)) &&
    nonnegative(target.points)
  )
}

// 점수는 음수가 될 수 없고, 현재 콤보 ≤ 최고 콤보 ≤ 성공 횟수 관계를 지켜야 합니다.
function isValidScore(score: MoleScore, playerIds: Set<string>) {
  return (
    !!score &&
    playerIds.has(score.playerId) &&
    [score.score, score.hits, score.misses, score.combo, score.bestCombo].every(nonnegative) &&
    score.combo <= score.bestCombo &&
    score.bestCombo <= score.hits
  )
}

// 외부 JSON은 타입 선언만으로 검증되지 않습니다. 시간, 구멍, 점수를 각각 확인한 후 화면에 적용합니다.
export function isMoleState(value: unknown, playerIds: Set<string>): value is MoleState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const game = value as Partial<MoleState>
  if (
    typeof game.finished !== 'boolean' ||
    !(game.startsAt === null || isDate(game.startsAt)) ||
    !(game.endsAt === null || isDate(game.endsAt)) ||
    (game.startsAt === null) !== (game.endsAt === null) ||
    (game.startsAt !== null && Date.parse(game.endsAt!) - Date.parse(game.startsAt!) !== 30000) ||
    !(game.pausedAt === null || isDate(game.pausedAt))
  ) {
    return false
  }

  if (
    !Array.isArray(game.holes) ||
    game.holes.length !== 16 ||
    !game.holes.every((target, hole) => isValidTarget(target, hole, playerIds))
  ) {
    return false
  }

  // 모든 참가자의 점수가 정확히 한 번씩 있어야 합니다. Set으로 중복 ID도 검사합니다.
  return (
    Array.isArray(game.scores) &&
    game.scores.length === playerIds.size &&
    new Set(game.scores.map(score => score?.playerId)).size === playerIds.size &&
    game.scores.every(score => isValidScore(score, playerIds))
  )
}

// 화면 표시용 시간 계산입니다. 서버의 종료 판단을 대신하지 않으며, 일시정지 시에는 시각을 고정합니다.
export function moleClock(game: MoleState, now: number) {
  const effectiveNow = game.pausedAt ? Date.parse(game.pausedAt) : now
  const countdown = game.startsAt
    ? Math.max(0, Math.ceil((Date.parse(game.startsAt) - effectiveNow) / 1000))
    : 3
  let remaining = 30
  if (game.finished) {
    remaining = 0
  } else if (game.endsAt) {
    remaining = Math.max(0, Math.min(30, (Date.parse(game.endsAt) - effectiveNow) / 1000))
  }
  return {
    countdown,
    remaining,
    active:
      game.startsAt !== null &&
      countdown === 0 &&
      remaining > 0 &&
      !game.pausedAt &&
      !game.finished,
  }
}
