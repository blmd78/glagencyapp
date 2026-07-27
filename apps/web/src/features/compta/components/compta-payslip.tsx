'use client'

import { frDayShort, type Fortnight } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import { ComptaEntryForm } from './compta-entry-form'
import type { ComptaRow } from '../types'

/** Une ligne de la fiche : libellé à gauche, montant aligné à droite en tabulaire. */
function Line({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className={muted ? 'flex justify-between text-sm text-muted-foreground' : 'flex justify-between text-sm'}>
      <span>{label}</span>
      <span className="tabular-nums">{eur(amount)}</span>
    </div>
  )
}

/**
 * Fiche de paie d'un chatteur sur une quinzaine — le détail de la formule, ligne à ligne, avec
 * les motifs de sanction en clair. Un chatteur non relié à MyPuls affiche un avertissement au
 * lieu d'un 0 € trompeur : sans lien, aucun CA n'est calculable (spec §7).
 */
export function ComptaPayslip({
  row,
  mondays,
  canPay,
}: {
  row: ComptaRow
  /** Conservé dans la signature pour `compta-view.tsx` (tâche 6) ; plus utilisé dans le corps
   *  depuis que le libellé du mode `fixed` affiche `mondays.length` plutôt que `fortnight.label`
   *  (correction post-revue) — non déstructuré pour ne pas rouvrir le warning ESLint résolu. */
  fortnight: Fortnight
  /** Lundis des semaines rattachées — un formulaire de saisie par semaine (tâche 8). */
  mondays: string[]
  canPay: boolean
}) {
  const p = row.payslip

  if (row.chatterId == null) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Aucun chatteur MyPuls relié à ce membre — son CA ne peut pas être calculé. Le lien se
        pose dans <span className="font-medium text-foreground">Membres</span>.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Line
          label={
            row.mode === 'percent'
              ? `Commission — ${eur(p.ca)} × ${row.rate} %`
              : // Le calcul réel est `fixedAmount × weekCount` (cf. payslip.ts) — afficher
                // « × plage de dates » multipliait un montant par un intervalle, ce qui ne
                // veut rien dire. `mondays.length` EST le nombre de semaines rattachées.
                `Fixe hebdomadaire — ${eur(row.fixedAmount)} × ${mondays.length} semaine${mondays.length > 1 ? 's' : ''}`
          }
          amount={p.base}
        />
        {row.isSetter && <Line label="Fixe setter" amount={p.setter} />}
        {p.bonus !== 0 && <Line label="Bonus" amount={p.bonus} />}
        {p.malus !== 0 && <Line label="Malus saisis" amount={-p.malus} />}
        {row.handoffs > 0 && <Line label={`Handoffs — ${row.handoffs} × 0,60 €`} amount={p.handoffsAmount} />}
        {p.prime !== 0 && <Line label="Prime nouveau chatteur" amount={p.prime} />}
      </div>

      {row.sanctions.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border-l-2 border-red-500 bg-muted/40 p-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Sanctions Police — {eur(-p.sanctions)}
          </span>
          {row.sanctions.map((s, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span>
                {frDayShort(s.day)} — {s.label ?? 'Malus'}
              </span>
              <span className="tabular-nums">
                {s.kind === 'warning' ? 'avertissement' : eur(-s.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(row.modelCa).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(row.modelCa)
            .sort(([, a], [, b]) => b - a)
            .map(([name, ca]) => (
              <Badge key={name} className={modelColor(name)}>
                {name} · {eur(ca)}
              </Badge>
            ))}
        </div>
      )}

      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <span>Net à payer</span>
        <span className="tabular-nums">{eur(p.net)}</span>
      </div>

      {canPay &&
        mondays.map((m) => (
          <ComptaEntryForm
            key={m}
            chatterId={row.id}
            weekStart={m}
            weekLabel={frDayShort(m)}
            isSetter={row.isSetter}
            initial={
              row.weekEntries[m] ?? { bonus: 0, malus: 0, handoffs: 0, fixeSetter: 0, note: null }
            }
          />
        ))}
    </div>
  )
}
