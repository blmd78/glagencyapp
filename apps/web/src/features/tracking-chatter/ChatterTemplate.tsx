import { fmtDuration } from '@glagency/core'
import { PeriodCard } from './components/period-card'
import type { ChatterData } from './types'

/**
 * Fiche d'un chatteur — port de `/c/:id` : trois cartes, semaine, mois, puis sites et modèles.
 * Entièrement rendue côté serveur : rien à hydrater sur cet écran.
 */
export function ChatterTemplate({ data }: { data: ChatterData }) {
  return (
    <div className="wrap">
      <PeriodCard title="Cette semaine" totals={data.week} />
      <PeriodCard title="Ce mois" totals={data.month} />

      <div className="card">
        <div className="blockh">
          <h2>Sites &amp; apps</h2>
          <span className="cnt">cumul du mois, sur le temps actif</span>
        </div>
        <div className="detail" style={{ background: 'transparent' }}>
          <div className="dlab">Modèles travaillés (mois)</div>
          <div className="sites">
            {data.models.length === 0 ? (
              <span className="pill nt">aucun modèle relevé</span>
            ) : (
              data.models.map((m) => (
                <span key={m.model} className="mt">
                  {m.model} {fmtDuration(m.minutes)}
                </span>
              ))
            )}
          </div>

          <div className="dlab">Sites &amp; apps</div>
          <div className="sites">
            {data.sites.length === 0 ? (
              <span className="pill nt">aucun site relevé</span>
            ) : (
              data.sites.map((s) => (
                <span key={`${s.kind}:${s.label}`} className={s.allowed ? 'pill tool' : 'pill'}>
                  {s.label}
                  <em>{fmtDuration(s.minutes)}</em>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
