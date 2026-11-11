import type { MoleState } from './types.ts'

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0

export function isMoleState(value: unknown, playerIds: Set<string>): value is MoleState {
  if (!value || typeof value !== 'object') return false
  const game = value as Partial<MoleState>
  if (typeof game.finished !== 'boolean'
    || !(game.startsAt === null || isDate(game.startsAt))
    || !(game.endsAt === null || isDate(game.endsAt))
    || (game.startsAt === null) !== (game.endsAt === null)
    || (game.startsAt !== null && Date.parse(game.endsAt!) - Date.parse(game.startsAt!) !== 30000)
    || !(game.pausedAt === null || isDate(game.pausedAt))
    || !Array.isArray(game.holes) || game.holes.length !== 16
    || !game.holes.every((target, hole) => target === null || (target && Number.isSafeInteger(target.id) && target.id > 0
      && target.hole === hole && isDate(target.appearedAt) && isDate(target.expiresAt)
      && (target.claimedBy === null || playerIds.has(target.claimedBy)) && nonnegative(target.points)))) return false
  return Array.isArray(game.scores) && game.scores.length === playerIds.size
    && new Set(game.scores.map(score => score?.playerId)).size === playerIds.size
    && game.scores.every(score => score && playerIds.has(score.playerId)
      && [score.score, score.hits, score.misses, score.combo, score.bestCombo].every(nonnegative)
      && score.combo <= score.bestCombo && score.bestCombo <= score.hits)
}

export function moleClock(game: MoleState, now: number) {
  const effectiveNow = game.pausedAt ? Date.parse(game.pausedAt) : now
  const countdown = game.startsAt ? Math.max(0, Math.ceil((Date.parse(game.startsAt) - effectiveNow) / 1000)) : 3
  const remaining = game.finished ? 0 : game.endsAt
    ? Math.max(0, Math.min(30, (Date.parse(game.endsAt) - effectiveNow) / 1000)) : 30
  return { countdown, remaining, active: game.startsAt !== null && countdown === 0 && remaining > 0 && !game.pausedAt && !game.finished }
}
