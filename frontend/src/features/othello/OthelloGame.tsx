import { useState, type ReactNode } from 'react'
import { Board } from './components/Board'
import { GameActions } from './components/GameActions'
import { GameResult } from './result/GameResult'
import { PlayerPanel } from './components/PlayerPanel'
import { RulesHelp } from './components/RulesHelp'
import { ScoreBoard } from './components/ScoreBoard'
import { COLOR_LABEL, getLegalMoves, getScore, getWinner } from './rules'
import type { GameState, Player, Position } from './types'
import styles from './OthelloGame.module.scss'

// 게임 상태와 내 참가 정보는 부모가 서버에서 받아 전달합니다.
// 이 컴포넌트는 화면 구성과 힌트 표시만 맡으며 API를 직접 호출하지 않습니다.
interface OthelloGameProps {
  game: GameState
  players: Player[]
  me: Player
  canPlay: boolean
  onPlay: (position: Position) => void
  onLeave: () => void
  leaving: boolean
  gameNumber: number
  finishedActions: ReactNode
  roomClosed: boolean
  activityLabel?: string
}

// 서버 보드에서 점수·가능한 수·결과를 계산하여 기능별 컴포넌트에 나눠 전달합니다.
export function OthelloGame({ game, players, me, canPlay, onPlay, onLeave, leaving, gameNumber, finishedActions, roomClosed, activityLabel }: OthelloGameProps) {
  const [showHints, setShowHints] = useState(true)
  const score = getScore(game.board)
  // 내 차례가 아니면 가능한 수를 빈 배열로 전달해 보드 클릭도 함께 비활성화합니다.
  const legalMoves = canPlay && game.currentTurn ? getLegalMoves(game.board, game.currentTurn) : []
  const winner = game.status === 'finished' ? getWinner(game.board) : null
  const passMessage = game.passedPlayer
    ? `${COLOR_LABEL[game.passedPlayer]}이 둘 곳이 없어 자동으로 패스했어요.`
    : ''
  // 화면의 차례/결과를 스크린리더도 전달받을 수 있도록 하나의 문장으로 만듭니다.
  const announcement = game.currentTurn
    ? `${passMessage} ${game.currentTurn === me.color ? '내 차례' : '상대 차례'}입니다.`
    : `게임 종료. ${winner === 'draw' ? '무승부' : winner ? `${COLOR_LABEL[winner]} 승리` : ''}.`

  return (
    <main className={styles.game} aria-label="오셀로 온라인 대전">
      <PlayerPanel players={players} currentTurn={game.currentTurn} myPlayerId={me.playerId} />
      <ScoreBoard score={score} currentTurn={game.currentTurn} myColor={me.color} activityLabel={game.status === 'playing' ? activityLabel : undefined} />
      {/* 시각적으로 숨겨도 접근성 트리에는 남습니다. 상태가 바뀌면 문장 전체를 읽습니다. */}
      <div role="status" aria-atomic="true" className={styles.srOnly}>
        {game.status === 'playing' && activityLabel ? activityLabel : announcement} 흑 {score.black}, 백 {score.white}.
      </div>
      {passMessage && <p className={styles.notice}>{passMessage}</p>}
      {game.status === 'finished' && <GameResult board={game.board} players={players} me={me} gameNumber={gameNumber} actions={finishedActions} />}
      <Board board={game.board} legalMoves={legalMoves} lastMove={game.lastMove} showHints={showHints} onPlay={onPlay} />
      {/* 종료 후의 로비/재대결 버튼은 결과 카드에 모아 중복된 퇴장 버튼을 만들지 않습니다. */}
      {game.status === 'playing' && !roomClosed && <GameActions showHints={showHints} onToggleHints={() => setShowHints(value => !value)} onLeave={onLeave} leaving={leaving} />}
      <RulesHelp />
    </main>
  )
}
