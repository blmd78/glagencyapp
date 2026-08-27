import { fmtDuration } from '@glagency/core'
import { RowDetailPanel } from './row-detail'
import type { BoardRow } from '../types'

/** Point d'état : vert en ligne, ambre en pause, rouge inactif, gris hors shift. */
function dotClass(row: BoardRow): string {
  if (row.crashed) return 'dot bad'
  if (row.state === 'active') return 'dot ok'
  if (row.state === 'pause') return 'dot warn'
  if (row.state === 'idle') return 'dot bad'
  return 'dot mut'
}

/**
 * Une ligne repliée. `<details>` NATIF : l'ouverture est gérée par le navigateur, sans une ligne
 * de JavaScript et sans état React dupliqué. Seul le contenu déplié est un composant client, et il
 * ne charge sa donnée qu'à l'ouverture.
 */
export function ChatterRow({
  row,
  shiftKey,
  date,
}: {
  row: BoardRow
  shiftKey: string
  date: string
}) {
  const ratio = row.toolMinMinutes > 0
    ? Math.min(100, Math.round((row.toolMinutes / row.toolMinMinutes) * 100))
    : 0
  const missing = Math.max(0, row.toolMinMinutes - row.toolMinutes)

  return (
    <details className="item" data-name={row.name.toLowerCase()}>
      <summary className="row">
        <span className={dotClass(row)} />
        <div className="c-name">
          <span className="nm">{row.name}</span>
        </div>
        <div className="c-bar">
          <div className={row.under ? 'mpbar bad' : row.launched ? 'mpbar' : 'mpbar mut'}>
            <i style={{ width: `${ratio}%` }} />
          </div>
          <span className="lbl">
            {row.launched ? (
              <>
                {fmtDuration(row.toolMinutes)} / {fmtDuration(row.toolMinMinutes)}
                {missing > 0 ? <> · manque {fmtDuration(missing)}</> : null}
              </>
            ) : (
              "n'a jamais lancé l'app"
            )}
          </span>
        </div>
        <span className="c-val">{row.launched ? fmtDuration(row.activeMinutes) : '—'}</span>
        <span className={row.latenessMinutes == null ? 'c-val mut' : 'c-val bad'}>
          {row.latenessMinutes == null ? '—' : fmtDuration(row.latenessMinutes)}
        </span>
        <span className="chev">›</span>
      </summary>
      <RowDetailPanel profileId={row.profileId} shiftKey={shiftKey} date={date} />
    </details>
  )
}
