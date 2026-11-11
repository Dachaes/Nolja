import type { Room } from '../types.ts'
import { isMoleState } from '../../mole/model.ts'

const isDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))

// 소켓 응답과 저장된 보드에 같은 검증을 적용합니다. TypeScript 타입만으로 외부 JSON을 신뢰하지 않습니다.
export function isRoomSnapshot(value: unknown): value is Room {
  if (!value || typeof value !== 'object') return false
  const room = value as Partial<Room>
  if (typeof room.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(room.code)
    || !Number.isSafeInteger(room.revision) || room.revision! < 0
    || !Number.isSafeInteger(room.gameNumber) || room.gameNumber! < 1
    || !['waiting', 'playing', 'finished', 'closed'].includes(room.status!)
    || !isDate(room.expiresAt) || !isDate(room.serverTime)
    || !Array.isArray(room.players) || room.players.length < 1 || room.players.length > 2) return false
  if (!room.players.every(player => player && typeof player.playerId === 'string' && typeof player.nickname === 'string'
    && ['black', 'white'].includes(player.color))) return false
  const playerIds = new Set(room.players.map(player => player.playerId))
  if (playerIds.size !== room.players.length) return false
  if (!Array.isArray(room.rematchReadyPlayerIds) || new Set(room.rematchReadyPlayerIds).size !== room.rematchReadyPlayerIds.length
    || !room.rematchReadyPlayerIds.every(id => playerIds.has(id))) return false
  // 각 참가자의 접속 정보가 하나씩 있어야 합니다. 연결된 사람에게 복귀 기한이 있으면 잘못된 응답입니다.
  if (!Array.isArray(room.presence) || room.presence.length !== room.players.length
    || new Set(room.presence.map(player => player?.playerId)).size !== playerIds.size
    || !room.presence.every(player => player && playerIds.has(player.playerId) && typeof player.connected === 'boolean'
      && (player.reconnectDeadline === null || isDate(player.reconnectDeadline))
      && (!player.connected || player.reconnectDeadline === null))) return false
  if (room.status === 'closed' ? !['left', 'reconnect_timeout', 'expired'].includes(room.closeReason!) : room.closeReason !== null) return false
  if (room.gameType === 'whack-a-mole') {
    if (room.mole == null) return (room.status === 'waiting' || room.status === 'closed') && room.players.length === 1
    return room.players.length === 2 && room.status !== 'waiting' && isMoleState(room.mole, playerIds)
      && (room.status === 'closed' || room.mole.finished === (room.status === 'finished'))
  }
  if (room.gameType !== undefined && room.gameType !== 'othello') return false
  const game = room.game
  const isColor = (color: unknown) => color === null || color === 'black' || color === 'white'
  if (!game || !['playing', 'finished'].includes(game.status) || !isColor(game.currentTurn)
    || !isColor(game.passedPlayer) || !Number.isInteger(game.moveCount)
    || !Array.isArray(game.board) || game.board.length !== 8
    || !game.board.every(row => Array.isArray(row) && row.length === 8 && row.every(isColor))) return false
  if (game.lastMove !== null && (!Number.isInteger(game.lastMove?.row) || !Number.isInteger(game.lastMove?.col)
    || game.lastMove.row < 0 || game.lastMove.row > 7 || game.lastMove.col < 0 || game.lastMove.col > 7)) return false
  return true
}
