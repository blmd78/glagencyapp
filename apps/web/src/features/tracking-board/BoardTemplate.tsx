import { AutoRefresh } from './components/auto-refresh'
import { LiveBar } from './components/live-bar'
import { ModelGroup } from './components/model-group'
import type { BoardData } from './types'

/**
 * Le board d'un créneau — port de `/d/:shift/:date`.
 *
 * Server Component : tout le rendu part en HTML, seules deux feuilles sont clientes (le
 * rafraîchissement, et le contenu déplié d'une ligne). Aucune donnée de ligne n'est sérialisée en
 * props client — c'est ce qui garde la page légère avec deux cents chatteurs.
 */
export function BoardTemplate({ data }: { data: BoardData }) {
  const toolMin = data.groups[0]?.rows[0]?.toolMinMinutes ?? 330

  return (
    <div className="wrap">
      <AutoRefresh seconds={60} />

      <div className="card">
        <div className="blockh">
          <h2>🟢 En ligne maintenant</h2>
          <span className="cnt">
            {data.live.length} connecté{data.live.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="cardpad">
          <LiveBar chips={data.live} now={data.computedAtMs} />
        </div>
      </div>

      {data.groups.length === 0 ? (
        <div className="card">
          <p className="empty">Aucun chatteur sur ce créneau.</p>
        </div>
      ) : (
        data.groups.map((group) => (
          <ModelGroup
            key={group.model}
            group={group}
            shiftKey={data.shiftKey}
            date={data.date}
            toolMinMinutes={toolMin}
          />
        ))
      )}
    </div>
  )
}
