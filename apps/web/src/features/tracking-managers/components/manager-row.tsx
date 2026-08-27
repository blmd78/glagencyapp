import { fmtClock, fmtDuration, parisDay } from '@glagency/core'
import type { ManagerRow } from '../services/get-managers-day'

/** « terminé · 12:56 → 06:23 +1j » — leur libellé exact, `+1j` compris. */
function statusLabel(row: ManagerRow): string {
  const d = row.day
  const state = d.crashed ? 'app fermée' : d.openShift ? 'en cours' : 'terminé'
  if (d.started == null) return state
  const from = fmtClock(d.started)
  if (d.ended == null) return `${state} · ${from} → …`
  // Le `+1j` n'est pas décoratif : un shift d'encadrant franchit souvent minuit, et « 12:56 →
  // 06:23 » sans lui se lit comme une journée de moins sept heures.
  const nextDay = parisDay(new Date(d.ended).toISOString()) !== parisDay(new Date(d.started).toISOString())
  return `${state} · ${from} → ${fmtClock(d.ended)}${nextDay ? ' +1j' : ''}`
}

function dotClass(row: ManagerRow): string {
  if (row.day.crashed) return 'dot bad'
  const state = row.day.live?.state
  if (state === 'active') return 'dot ok'
  if (state === 'pause') return 'dot warn'
  if (state === 'idle') return 'dot bad'
  return 'dot mut'
}

/**
 * Une ligne d'encadrant. Grille `.dt.mgr` à 7 colonnes — variante de celle du board, avec une
 * colonne Pause en plus et pas de barre de progression : il n'y a pas de minimum à atteindre.
 */
export function ManagerRowItem({ row }: { row: ManagerRow }) {
  const d = row.day
  return (
    <details className="item" data-name={row.name.toLowerCase()}>
      <summary className="row">
        <span className={dotClass(row)} />
        <div className="c-name">
          <span className="nm">{row.name}</span>
        </div>
        <div className="c-bar">
          <span className="lbl">{statusLabel(row)}</span>
        </div>
        <span className="c-val">{fmtDuration(d.workedMinutes)}</span>
        <span className="c-val mut">{fmtDuration(d.idleMinutes)}</span>
        <span className="c-val">{fmtDuration(d.pauseMinutes)}</span>
        <span className="chev">›</span>
      </summary>
      <div className="detail">
        <div className="stats">
          <Stat value={fmtClock(d.started)} label="Début" />
          <Stat value={d.ended == null ? '—' : fmtClock(d.ended)} label="Fin" />
          <Stat value={fmtDuration(d.workedMinutes)} label="Réel travaillé" />
          <Stat value={fmtDuration(d.idleMinutes)} label="Inactivité" cls="mut" />
          <Stat value={fmtDuration(d.pauseMinutes)} label="Pause" />
        </div>
        <div className="dlab">Timeline</div>
        <div className="tl">
          {d.segments.map((s) => (
            <div
              key={`${s.start}-${s.kind}`}
              className={s.kind === 'active' ? 'trow ' : s.kind === 'pause' ? 'trow p' : 'trow i'}
            >
              <span className="t">
                {fmtClock(s.start)} → {fmtClock(s.end)}
              </span>
              <span className="k">
                {s.kind === 'active' ? 'Actif' : s.kind === 'pause' ? 'Pause' : 'Inactif'}
              </span>
              <span className="d">{fmtDuration(Math.round((s.end - s.start) / 60_000))}</span>
              {/* Les encadrants ne sont pas suivis au focus : la colonne sites reste vide, sauf
                  pour dire ce qu'une inactivité signifie. */}
              <span className="s">{s.kind === 'idle' ? 'PC pas touché' : null}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
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
