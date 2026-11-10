import { useRef, type KeyboardEvent } from 'react'
import type { Board as BoardState, Position } from '../types'
import { BOARD_SIZE } from '../rules'
import { BoardCell } from './BoardCell'
import styles from './Board.module.scss'

// 8개의 행과 각 행의 8개 칸을 그립니다. 착수 판단은 부모가 전달한 legalMoves를 따릅니다.
export function Board({ board, legalMoves, lastMove, showHints, onPlay }: {
  board: BoardState; legalMoves: Position[]; lastMove: Position | null
  showHints: boolean; onPlay: (position: Position) => void
}) {
  // 키보드 이동 시 실제 칸 버튼에 포커스를 주기 위해 보드 DOM을 참조합니다.
  const boardRef = useRef<HTMLDivElement>(null)
  // 좌표 문자열을 Set에 넣어 각 칸의 착수 가능 여부를 간단히 조회합니다.
  const legalKeys = new Set(legalMoves.map(({ row, col }) => `${row}-${col}`))
  // Tab 진입점은 한 칸만 둡니다. 나머지 63칸은 방향키로 탐색할 수 있습니다.
  const entry = legalMoves[0] ?? { row: 0, col: 0 }
  // 방향키는 보드 경계를 넘지 않게 제한하고, Ctrl+Home/End는 보드 전체의 양 끝으로 이동합니다.
  function navigate(event: KeyboardEvent<HTMLButtonElement>, { row, col }: Position) {
    const targets: Record<string, Position> = {
      ArrowUp: { row: Math.max(0, row - 1), col }, ArrowDown: { row: Math.min(BOARD_SIZE - 1, row + 1), col },
      ArrowLeft: { row, col: Math.max(0, col - 1) }, ArrowRight: { row, col: Math.min(BOARD_SIZE - 1, col + 1) },
      Home: { row: event.ctrlKey ? 0 : row, col: 0 }, End: { row: event.ctrlKey ? BOARD_SIZE - 1 : row, col: BOARD_SIZE - 1 },
    }
    const target = targets[event.key]
    if (!target) return
    // 방향키의 기본 페이지 스크롤 대신 선택한 칸으로 포커스를 옮깁니다.
    event.preventDefault()
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${target.row}-${target.col}"]`)?.focus()
  }
  // grid/row/gridcell 역할로 시각적인 격자 구조를 보조 기술에도 알려줍니다.
  return <div ref={boardRef} className={styles.board} role="grid" aria-label="오셀로 8 × 8 보드" aria-describedby="board-instructions">
    {board.map((row, r) => <div role="row" className={styles.row} key={r}>
      {row.map((cell, c) => <BoardCell key={c} cell={cell} position={{ row: r, col: c }}
        legal={legalKeys.has(`${r}-${c}`)} showHints={showHints}
        lastMove={lastMove?.row === r && lastMove.col === c}
        focusable={entry.row === r && entry.col === c} onPlay={onPlay} onNavigate={navigate} />)}
    </div>)}
  </div>
}
