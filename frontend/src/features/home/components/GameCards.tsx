import { games } from '../catalog/games'
import { navigate } from '../../room/model/navigation'
import styles from '../HomePage.module.scss'

export function GameCards() {
  return <section className={styles.games} aria-label="시작할 수 있는 게임">
    {games.map(game => <button type="button" key={game.id} className={styles.game} onClick={() => navigate(game.path)}>
      <span className={styles.board} aria-hidden="true"><i /><i /><i /><i /></span>
      <strong>{game.name}</strong><span>{game.description}</span><small>2명 · 초대 코드로 함께</small>
    </button>)}
  </section>
}
