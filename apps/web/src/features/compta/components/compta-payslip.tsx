'use client'

import { frDayShort, type Fortnight } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import { ComptaEntryForm } from './compta-entry-form'
import { ComptaPayDialog } from './compta-pay-dialog'
import { ComptaSettingsForm, ComptaPrimeForm } from './compta-settings-form'
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
  fortnight,
  mondays,
  canEnter,
  canPay,
  canConfigure,
  fortnightElapsed,
}: {
  row: ComptaRow
  /** Quinzaine affichée — identifie le paiement `(month, period)` et fournit ses `covered_days`. */
  fortnight: Fortnight
  /** Lundis des semaines rattachées — un formulaire de saisie par semaine (tâche 8). */
  mondays: string[]
  /** Droit de SAISIE (manager/sous-manager sur ses rattachés, ou admin) — spec §6, distinct de
   *  `canPay` (admin seul). Conditionne `ComptaEntryForm`. */
  canEnter: boolean
  /** Droit de PAIEMENT (admin seul) — spec §6. Masquer le bouton n'est qu'optimiste :
   *  `adminGuard` et la RLS 0085 (`compta_payments_admin_write`) sont le verrou réel. */
  canPay: boolean
  /** Droit de RÉGLAGE (taux, mode, setter, prime) — admin seul, spec §6. Booléen DISTINCT de
   *  `canPay` bien que dérivé du même rôle aujourd'hui : régler un taux et exécuter un virement
   *  sont deux gestes différents. Verrous réels : `adminGuard` + RLS `*_admin_write`. */
  canConfigure: boolean
  /** Quinzaine terminée — DISTINCT de `canPay` : l'un est un droit, l'autre un état de la
   *  période. `payFortnight` refuse de figer des jours non révolus ; ne pas monter un bouton
   *  qui échouerait à coup sûr. */
  fortnightElapsed: boolean
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

      {row.paid && (
        <p className="text-xs text-muted-foreground">
          Payé le {row.paidOn} — {eur(row.paidAmount ?? 0)}
          {/* Écart possible avec le « Net à payer » ci-dessus : celui-ci est recalculé
              aujourd'hui, celui-là est l'instantané figé au virement. C'est l'instantané
              qui fait foi. */}
        </p>
      )}

      {canPay && fortnightElapsed && !row.paid && (
        <ComptaPayDialog row={row} fortnight={fortnight} />
      )}

      {/* Réglages AVANT les saisies : c'est `is_setter` qui décide de la présence du champ
          « Fixe setter » dans le formulaire hebdomadaire juste en dessous. */}
      {canConfigure && (
        <>
          <ComptaSettingsForm row={row} />
          <ComptaPrimeForm row={row} />
        </>
      )}

      {canEnter &&
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
