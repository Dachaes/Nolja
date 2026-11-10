import type { DiscColor, Player } from '../types'
import { Disc } from './Disc'
import styles from './PlayerPanel.module.scss'

// 참가자를 색상별로 표시하고 현재 차례를 강조합니다. 본인 표시와 key에는 playerId를 씁니다.
export function PlayerPanel({ players, currentTurn, myPlayerId }: { players: Player[]; currentTurn: DiscColor | null; myPlayerId: string }) {
  return <div className={styles.players} aria-label="참가자">
    {players.map(player => <div key={player.playerId}
      className={`${styles.player} ${currentTurn === player.color ? styles.active : ''}`}
      aria-label={`${player.nickname}, ${player.color === 'black' ? '흑' : '백'}${currentTurn === player.color ? ', 현재 차례' : ''}`}>
      <Disc color={player.color} small /><span>{player.nickname}{player.playerId === myPlayerId ? ' (나)' : ''}</span>
    </div>)}
  </div>
}
