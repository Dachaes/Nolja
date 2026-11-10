import type { KeyboardEvent } from 'react'
import type { Cell, Position } from '../types'
import { COLOR_LABEL } from '../rules'
import { Disc } from './Disc'
import styles from './Board.module.scss'

// 하나의 칸을 그립니다. 빈칸이면 힌트, 돌이 있으면 Disc를 표시합니다.
export function BoardCell({ cell, position, legal, showHints, lastMove, onPlay, onNavigate, focusable }: {
  cell: Cell; position: Position; legal: boolean; showHints: boolean; lastMove: boolean
  onPlay: (position: Position) => void
  onNavigate: (event: KeyboardEvent<HTMLButtonElement>, position: Position) => void
  focusable: boolean
}) {
  // 배열 좌표 (0, 0)를 사람이 읽는 A1로 변환해 접근성 이름과 브라우저 테스트에 사용합니다.
  const coordinate = `${String.fromCharCode(65 + position.col)}${position.row + 1}`
  const label = `${coordinate}, ${cell ? `${COLOR_LABEL[cell]} 돌` : legal ? '놓을 수 있음' : '놓을 수 없음'}${lastMove ? ', 마지막 수' : ''}`
  // disabled 대신 aria-disabled를 써서 놓을 수 없는 칸도 방향키로 살펴볼 수 있게 합니다.
  // aria-disabled만으로 클릭은 차단되지 않으므로 onClick에서도 legal을 반드시 확인합니다.
  // Disc의 key를 색상으로 두어 돌이 뒤집힐 때 등장 애니메이션이 다시 실행되게 합니다.
  return <div role="gridcell" className={styles.cell}>
    <button type="button" className={`${styles.square} ${legal ? styles.legal : ''}`}
      aria-label={label} aria-disabled={!legal} tabIndex={focusable ? 0 : -1}
      data-cell={`${position.row}-${position.col}`}
      onClick={() => { if (legal) onPlay(position) }} onKeyDown={event => onNavigate(event, position)}>
      {cell ? <Disc key={cell} color={cell} lastMove={lastMove} /> : legal && showHints ? <span className={styles.hint} aria-hidden="true" /> : null}
    </button>
  </div>
}
