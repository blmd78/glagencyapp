import { RecapCard } from './components/recap-card'
import type { RecapData } from './services/get-week-recap'

/**
 * Récap hebdomadaire — port de `/recap`. Les totaux en tête, puis un palier par mission.
 */
export function RecapTemplate({ data }: { data: RecapData }) {
  const t = data.totals
  return (
    <div className="wrap wide">
      <div className="btot rtot">
        <span>
          <b>{t.planned}</b> prévues
        </span>
        <span>
          <b className="ok">{t.done}</b> faites
        </span>
        <span>
          <b className="ko">{t.notDone}</b> pas faites
        </span>
        <span>
          <b>
            {t.debriefs}/{t.expected}
          </b>{' '}
          débriefs
        </span>
      </div>

      {data.groups.length === 0 ? (
        <div className="card">
          <p className="empty">Aucune to-do sur cette semaine.</p>
        </div>
      ) : (
        data.groups.map((g) => (
          <div key={g.label} className="rgroup">
            <div className="rglab">
              <em>{g.people.length}</em>
              <span>{g.label}</span>
            </div>
            <div className="rlist">
              {g.people.map((p) => (
                <RecapCard key={p.profileId} person={p} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
