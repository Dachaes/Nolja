import type { ReactNode } from 'react'
import { Disc } from '../components/Disc'
import { COLOR_LABEL } from '../rules'
import type { Board, Player } from '../types'
import { getGameResult } from './result'
import styles from './GameResult.module.scss'

interface GameResultProps {
  board: Board
  players: Player[]
  me: Player
  gameNumber: number
  actions: ReactNode
}

// 최종 점수와 본인 기준 승패를 표시합니다. 방의 재대결/로비 동작은 actions로 받아 분리합니다.
export function GameResult({ board, players, me, gameNumber, actions }: GameResultProps) {
  const { score, winner, title } = getGameResult(board, me.color)
  const winningPlayer = players.find(player => player.color === winner)
  return (
    <section className={styles.result} aria-label="대국 결과">
      <p className={styles.eyebrow}>{gameNumber}번째 대국 결과</p>
      <h2>{title}</h2>
      <p className={styles.description}>{winner === 'draw' ? '두 사람의 돌 개수가 같아요.' : `${winningPlayer?.nickname ?? COLOR_LABEL[winner]}님의 승리예요.`}</p>
      {/* 순서를 흑/백으로 고정하고 실제 놓인 돌 개수를 보여줍니다. 빈칸은 점수에 더하지 않습니다. */}
      <div className={styles.scores}>
        {(['black', 'white'] as const).map(color => {
          const player = players.find(value => value.color === color)
          return <div key={color} className={styles.player}>
            <span className={styles.disc}><Disc color={color} /></span>
            <span className={styles.name}>{player?.nickname} {player?.playerId === me.playerId ? '(나)' : ''}</span>
            <strong aria-label={`${COLOR_LABEL[color]} 최종 ${score[color]}점`}>{score[color]}</strong>
          </div>
        })}
      </div>
      <p className={styles.description}>두 사람 모두 둘 곳이 없어 대국이 끝났어요.</p>
      {actions}
    </section>
  )
}
