import { medalFor } from '@glagency/core'
import { MEDAL_EMOJI, MEDAL_LABELS } from '@/lib/types/training'

export interface MedalChip {
  caseId: string
  caseTitle: string
  best: number
}

/**
 * Les médailles gagnées sur une liste d'exercices, en chips (GLA `medbar` / `medchip`) : elles se
 * lisent en tête de liste, avant même de parcourir les cas.
 *
 * SEULES les vraies médailles y figurent (Or, Argent, Bronze) : un cas noté sous 60 n'est pas
 * validé, l'afficher là reviendrait à décorer un échec. Aucune médaille → on le dit, plutôt que de
 * laisser un vide qui ressemble à un bug.
 */
export function MedalBar({ chips }: { chips: MedalChip[] }) {
  const medals = chips.flatMap((c) => {
    const medal = medalFor(c.best)
    return medal ? [{ ...c, medal }] : []
  })

  if (medals.length === 0) {
    return <span className="text-[11.5px] text-[var(--gla-faint)]">Aucune médaille pour l’instant</span>
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {medals.map((m) => (
        <span
          key={m.caseId}
          title={`${m.caseTitle} — ${m.best}/100 · ${MEDAL_LABELS[m.medal]}`}
          className="inline-flex items-center gap-1 rounded-[20px] border border-[var(--gla-border)] bg-[var(--gla-surface2)] py-[3px] pl-[7px] pr-[9px] text-xs"
        >
          <span aria-hidden className="text-sm leading-none">{MEDAL_EMOJI[m.medal]}</span>
          <b className="tabular-nums" style={{ color: m.best >= 75 ? 'var(--gla-teal)' : 'var(--gla-warning)' }}>
            {m.best}
          </b>
        </span>
      ))}
    </span>
  )
}
