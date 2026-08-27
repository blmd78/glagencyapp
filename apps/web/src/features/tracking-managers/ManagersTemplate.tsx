import { fmtDuration } from '@glagency/core'
import { ManagerRowItem } from './components/manager-row'
import type { ManagersData } from './services/get-managers-day'

/**
 * Présence des encadrants — port de `/m/:date`.
 *
 * La barre « en ligne » n'est rendue QUE pour aujourd'hui : sur une date passée, elle est absente
 * de leur document, et afficher « personne en poste » sur le 20 août n'aurait aucun sens.
 */
export function ManagersTemplate({ data }: { data: ManagersData }) {
  const live = data.rows.filter((r) => r.day.live != null)

  return (
    <div className="wrap">
      {data.isToday ? (
        live.length === 0 ? (
          <div className="livebar none">Personne en poste actuellement.</div>
        ) : (
          <div className="livebar">
            {live.map((r) => {
              const state = r.day.live?.state
              const since = r.day.live?.since
              return (
                <span
                  key={r.profileId}
                  className={state === 'pause' ? 'lv p' : state === 'idle' ? 'lv i' : 'lv'}
                >
                  <i />
                  {r.name}
                  {since != null ? (
                    <em>
                      depuis {fmtDuration(Math.max(0, Math.round((data.computedAtMs - since) / 60_000)))}
                    </em>
                  ) : null}
                </span>
              )
            })}
          </div>
        )
      ) : null}

      <div className="card">
        <div className="blockh">
          <h2>Présence des managers</h2>
          <span className="cnt">{data.activeCount} en activité · clique pour le détail</span>
        </div>
        {data.rows.length === 0 ? (
          <p className="empty">Aucun manager en poste ce jour-là.</p>
        ) : (
          <div className="dt mgr">
            <div className="thead">
              <span />
              <span>Manager</span>
              <span>Statut · horaire</span>
              <span className="r">Réel</span>
              <span className="r">Inactif</span>
              <span className="r">Pause</span>
              <span />
            </div>
            {data.rows.map((row) => (
              <ManagerRowItem key={row.profileId} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
