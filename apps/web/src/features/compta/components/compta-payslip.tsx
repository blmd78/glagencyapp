'use client'

import { frDayShort, type PayPeriod } from '@glagency/core'
import { ComptaEntryForm } from './compta-entry-form'
import { ComptaEntryHeader } from './compta-entry-grid'
import { ComptaPayslipCalc, SECTION_HEAD } from './compta-payslip-calc'
import type { ComptaRow } from '../types'

/**
 * Fiche de paie d'un chatteur sur une période — le détail de la formule, ligne à ligne, avec
 * les motifs de sanction en clair. Un chatteur non relié à MyPuls affiche un avertissement au
 * lieu d'un 0 € trompeur : sans lien, aucun CA n'est calculable (spec §7).
 *
 * DEUX ZONES, dans cet ordre (refonte du 2026-07-27, demande du propriétaire : « quand on
 * ouvre l'accordéon simplifie l'affichage que ce soit facile à lire simple et intuitif ») :
 *
 *   1. CE QU'ON SAISIT — une LIGNE par semaine, en-tête de colonnes écrit une seule fois.
 *   2. CE QU'ON LIT — `ComptaPayslipCalc` : la base, les ajustements, le net qui conclut avec
 *      le bouton de paiement à côté. C'était six blocs empilés au même volume visuel, le net
 *      coincé au milieu.
 *
 * La saisie passe DEVANT le calcul (demande du propriétaire, « il faudrait remonter saisie
 * hebdomadaire en haut ») : on déplie une ligne pour SAISIR, le calcul est la conséquence
 * qu'on lit ensuite. L'ordre suit le geste, pas la logique de la formule. Le net reste la
 * conclusion visuelle du panneau, en bas — c'est aussi là que se trouve le bouton de paiement.
 *
 * CE QU'ON CONFIGURE a QUITTÉ ce panneau le même jour (« je pense qu'on peut mettre un
 * engrenage pour gérer les paramètres de chaque chatter pour simplifier l'affichage »), puis a
 * quitté la Compta tout court le 2026-07-28 (« je pense que tout va dans membre, tu mets un tab
 * dans le dialog direct ») : taux, fixe et prime vivent dans l'onglet Compta du dialog de
 * MEMBRES, où la colonne « Rémunération » renvoie. Ce composant ne prend donc plus
 * `canConfigure`.
 *
 * Rien n'est perdu à l'écran fermé : la colonne « Rémunération » de la table dit le taux et le
 * fixe, la colonne « Prime » dit son montant et son état.
 */
export function ComptaPayslip({
  row,
  period,
  mondays,
  canEnter,
  canPay,
  periodElapsed,
}: {
  row: ComptaRow
  /** Période affichée — son `start` identifie le paiement (`period_start`, 0088) et ses 14
   *  jours en sont les `covered_days`. */
  period: PayPeriod
  /** Les 2 lundis de la période — un formulaire de saisie par semaine (tâche 8). */
  mondays: string[]
  /** Droit de SAISIE (manager/sous-manager sur ses rattachés, ou admin) — spec §6, distinct de
   *  `canPay` (admin seul). Conditionne `ComptaEntryForm`. */
  canEnter: boolean
  /** Droit de PAIEMENT (admin seul) — spec §6. Masquer le bouton n'est qu'optimiste :
   *  `adminGuard` et la RLS 0085 (`compta_payments_admin_write`) sont le verrou réel. */
  canPay: boolean
  /** Période terminée — DISTINCT de `canPay` : l'un est un droit, l'autre un état de la
   *  période. `payPeriod` refuse de figer des jours non révolus ; ne pas monter un bouton
   *  qui échouerait à coup sûr. */
  periodElapsed: boolean
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
      {canEnter && (
        <div className="flex flex-col gap-2">
          {/* La ligne « Période entière » (report + prime du mois, `ComptaPeriodForm`) qui
              suivait les semaines a été RETIRÉE le 2026-07-28 avec ses deux concepts (décision
              de Benoit) : il ne reste que la saisie hebdomadaire. */}
          <span className={SECTION_HEAD}>Saisies</span>
          <ComptaEntryHeader />
          {mondays.map((m) => (
            <ComptaEntryForm
              key={m}
              chatterId={row.id}
              weekStart={m}
              weekLabel={frDayShort(m)}
              initial={row.weekEntries[m] ?? { bonus: 0, malus: 0, handoffs: 0, note: null }}
            />
          ))}
        </div>
      )}

      <ComptaPayslipCalc row={row} period={period} canPay={canPay} periodElapsed={periodElapsed} />
    </div>
  )
}
