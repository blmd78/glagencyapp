'use client'

import { frDayShort, type Fortnight } from '@glagency/core'
import { ComptaEntryForm, ComptaEntryHeader } from './compta-entry-form'
import { ComptaPayslipCalc, SECTION_HEAD } from './compta-payslip-calc'
import type { ComptaRow } from '../types'

/**
 * Fiche de paie d'un chatteur sur une quinzaine — le détail de la formule, ligne à ligne, avec
 * les motifs de sanction en clair. Un chatteur non relié à MyPuls affiche un avertissement au
 * lieu d'un 0 € trompeur : sans lien, aucun CA n'est calculable (spec §7).
 *
 * DEUX ZONES, dans cet ordre (refonte du 2026-07-27, demande du propriétaire : « quand on
 * ouvre l'accordéon simplifie l'affichage que ce soit facile à lire simple et intuitif ») :
 *
 *   1. CE QU'ON LIT — `ComptaPayslipCalc` : la base, les ajustements, le net qui conclut avec
 *      le bouton de paiement à côté. C'était six blocs empilés au même volume visuel, le net
 *      coincé au milieu.
 *   2. CE QU'ON SAISIT — une LIGNE par semaine, en-tête de colonnes écrit une seule fois.
 *
 * CE QU'ON CONFIGURE a QUITTÉ ce panneau le même jour (« je pense qu'on peut mettre un
 * engrenage pour gérer les paramètres de chaque chatter pour simplifier l'affichage ») : mode,
 * taux, statut de setter et prime vivent derrière l'engrenage de la ligne
 * (`compta-settings-dialog.tsx`), joignable SANS déplier. Ce composant ne prend donc plus
 * `canConfigure` — c'est `makeComptaColumns` qui le porte désormais.
 *
 * Rien n'est perdu à l'écran fermé : la colonne « Commission » de la table dit le mode, le taux
 * et le statut de setter, la colonne « Prime » dit son montant et son état.
 */
export function ComptaPayslip({
  row,
  fortnight,
  mondays,
  canEnter,
  canPay,
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
  /** Quinzaine terminée — DISTINCT de `canPay` : l'un est un droit, l'autre un état de la
   *  période. `payFortnight` refuse de figer des jours non révolus ; ne pas monter un bouton
   *  qui échouerait à coup sûr. */
  fortnightElapsed: boolean
}) {
  if (row.chatterId == null) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Aucun chatteur MyPuls relié à ce membre — son CA ne peut pas être calculé. Le lien se
        pose dans <span className="font-medium text-foreground">Membres</span>.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ComptaPayslipCalc
        row={row}
        fortnight={fortnight}
        mondays={mondays}
        canPay={canPay}
        fortnightElapsed={fortnightElapsed}
      />

      {canEnter && (
        <div className="flex flex-col gap-2">
          <span className={SECTION_HEAD}>Saisies hebdomadaires</span>
          <ComptaEntryHeader isSetter={row.isSetter} />
          {mondays.map((m) => (
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
      )}
    </div>
  )
}
