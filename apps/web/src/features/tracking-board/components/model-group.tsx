import { fmtDuration } from '@glagency/core'
import { ChatterRow } from './chatter-row'
import type { BoardGroup } from '../types'

/**
 * Un modèle = une carte repliable. `<details>` natif, ouvert par défaut : le board sert à voir
 * l'état de tout le monde d'un coup d'œil ; le replier est un geste de tri, pas l'état de départ.
 */
export function ModelGroup({
  group,
  shiftKey,
  date,
  toolMinMinutes,
}: {
  group: BoardGroup
  shiftKey: string
  date: string
  toolMinMinutes: number
}) {
  return (
    <details className="card modelgroup" open>
      <summary className="blockh">
        <h2>{group.model}</h2>
        <span className="cnt">
          {group.rows.length} chatter{group.rows.length > 1 ? 's' : ''}
          {group.underCount > 0 ? (
            <>
              {' · '}
              <span className="kored">{group.underCount} à sanctionner</span>
            </>
          ) : null}
        </span>
        <span className="gchev">›</span>
      </summary>
      <div className="dt">
        <div className="thead">
          <span />
          <span>Chatter</span>
          <span>Mypuls · min. {fmtDuration(toolMinMinutes)}</span>
          <span className="r">Actif</span>
          <span className="r">Retard</span>
          <span />
        </div>
        {group.rows.map((row) => (
          <ChatterRow key={row.profileId} row={row} shiftKey={shiftKey} date={date} />
        ))}
      </div>
    </details>
  )
}
