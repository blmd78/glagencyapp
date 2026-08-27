import { fmtDuration } from '@glagency/core'
import type { BoardLiveChip } from '../types'

/** Classe d'état de la pastille : vert par défaut, ambre en pause, rouge en inactivité. */
const chipClass = (state: BoardLiveChip['state']): string =>
  state === 'pause' ? 'lv p' : state === 'idle' ? 'lv i' : 'lv'

const label = (state: BoardLiveChip['state']): string =>
  state === 'pause' ? 'en pause' : state === 'idle' ? 'inactif' : 'en ligne'

export function LiveBar({ chips, now }: { chips: BoardLiveChip[]; now: number }) {
  if (chips.length === 0) {
    return <div className="livebar none">Personne en poste actuellement.</div>
  }
  return (
    <div className="livebar">
      {chips.map((c) => (
        <span key={c.profileId} className={chipClass(c.state)}>
          <i />
          {c.name}
          {c.sinceMs != null ? (
            <em>
              {label(c.state)} depuis {fmtDuration(Math.max(0, Math.round((now - c.sinceMs) / 60_000)))}
            </em>
          ) : (
            <em>{label(c.state)}</em>
          )}
        </span>
      ))}
    </div>
  )
}
