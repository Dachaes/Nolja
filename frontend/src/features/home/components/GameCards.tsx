import { games } from '../catalog/games'
import { navigate } from '../../room/model/navigation'
import styles from '../HomePage.module.scss'
import { MoleIcon } from '../../mole/MoleIcon'

// 게임 목록 데이터를 카드로 표시하고, 선택한 게임의 방 생성 화면으로 이동합니다.
export function GameCards() {
  return (
    <section className={styles.games} aria-label="게임 목록">
      {games.map(game => (
        <button
          type="button"
          key={game.id}
          className={styles.game}
          disabled={!game.path}
          onClick={() => {
            if (game.path) {
              navigate(game.path)
            }
          }}
        >
          {game.id === 'whack-a-mole' ? (
            <MoleIcon className={styles.mole} />
          ) : (
            <span className={styles.board} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
          <strong>{game.name}</strong>
          <span>{game.description}</span>
          <small>{game.detail}</small>
        </button>
      ))}
    </section>
  )
}
