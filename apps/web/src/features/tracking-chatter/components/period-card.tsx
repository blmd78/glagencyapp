import { fmtDuration } from '@glagency/core'
import type { PeriodTotals } from '../types'

/** Une période (semaine, mois) : six chiffres, dans leur ordre et avec leurs libellés. */
export function PeriodCard({ title, totals }: { title: string; totals: PeriodTotals }) {
  return (
    <div className="card">
      <div className="blockh">
        <h2>{title}</h2>
        <span className="cnt">
          {totals.workedDays} jour{totals.workedDays > 1 ? 's' : ''} travaillé
          {totals.workedDays > 1 ? 's' : ''}
        </span>
      </div>
      <div className="detail" style={{ background: 'transparent' }}>
        <div className="stats">
          <Stat value={fmtDuration(totals.effectiveMinutes)} label="Effectif cumulé" />
          <Stat value={`${totals.compliantDays}/${totals.workedDays}`} label="Jours conformes" />
          <Stat value={fmtDuration(totals.activeMinutes)} label="Temps actif" />
          <Stat value={fmtDuration(totals.countedPauseMinutes)} label="Pause comptée" />
          <Stat value={fmtDuration(totals.idleMinutes)} label="Inactif" cls="mut" />
          <Stat
            value={fmtDuration(totals.offTaskMinutes)}
            label="Hors whitelist"
            cls={totals.offTaskMinutes > 0 ? 'bad' : undefined}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, cls }: { value: string; label: string; cls?: string }) {
  return (
    <div className={cls ? `stat ${cls}` : 'stat'}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}
