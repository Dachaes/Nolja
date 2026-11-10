import { getScore, getWinner } from '../rules.ts'
import type { Board, DiscColor } from '../types.ts'

// 같은 최종 보드라도 내 돌 색상에 따라 승리/패배 문구가 다릅니다. 화면과 분리한 순수 함수입니다.
export function getGameResult(board: Board, myColor: DiscColor) {
  const score = getScore(board)
  const winner = getWinner(board)
  const outcome = winner === 'draw' ? 'draw' : winner === myColor ? 'win' : 'lose'
  const title = { win: '승리했어요!', lose: '아쉽게 패배했어요', draw: '무승부예요' }[outcome]
  return { score, winner, outcome, title }
}
