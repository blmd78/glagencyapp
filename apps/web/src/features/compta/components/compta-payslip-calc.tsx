'use client'

import { Fragment } from 'react'
import { addDays, frDateNumeric, frDayShort, type PayPeriod } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur2, round2 } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import { ComptaPayDialog } from './compta-pay-dialog'
import type { ComptaRow } from '../types'

/**
 * Titre de BLOC de la fiche (« Ajustements », « Saisies hebdomadaires »…). Reprise EXACTE de
 * l'échelle que portaient déjà les en-têtes de formulaire de la feature
 * (`compta-entry-form.tsx`, `compta-settings-form.tsx`) — aucune échelle nouvelle introduite.
 */
export const SECTION_HEAD = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'

/**
 * Titre de COLONNE — un cran plus discret que le titre de bloc. C'est cet écart-là qui fait la
 * hiérarchie : deux niveaux, pas six blocs au même volume. Partagé avec l'en-tête des saisies
 * (`compta-entry-form.tsx`), qui doit parler la même langue que la ventilation.
 */
export const COL_HEAD = 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'

/**
 * Une ligne de calcul : libellé à gauche, montant aligné à droite en tabulaire. Le SIGNE est
 * porté par l'appelant (`-p.malus`) — malus et sanctions sont stockés POSITIFS, ce sont des
 * composantes que `computePayslip` soustrait.
 */
function Line({ label, amount, red }: { label: string; amount: number; red?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span>{label}</span>
      <span className={red ? 'tabular-nums text-red-700 dark:text-red-400' : 'tabular-nums'}>
        {eur2(amount)}
      </span>
    </div>
  )
}

/**
 * Ventilation du CA par modèle — UNE LIGNE PAR MODÈLE, avec la commission prise sur ce modèle
 * (demande du propriétaire, 2026-07-27, en remplacement de la rangée de badges « Modèle · CA »).
 *
 * Elle n'invente aucun calcul : `computePayslip` applique DÉJÀ le taux modèle par modèle
 * (`packages/core/src/compta/payslip.ts`) — cet écran ne fait qu'exposer ce qui se calculait
 * sans être montré.
 *
 * ⚠️ LES LIGNES DOIVENT FAIRE LE TOTAL. C'est ce qui a fait passer `computePayslip` à un
 * arrondi PAR MODÈLE (`Σ round2(ca × taux)` et non `round2(Σ ca × taux)`) le 2026-07-27 : sinon
 * les commissions affichées s'écartaient du total d'un ou deux centimes. Corollaire : le total
 * affiché ici est `payslip.base` LUI-MÊME, jamais une somme refaite côté client — deux calculs
 * finiraient par diverger.
 *
 * Le total de CA est `payslip.ca` pour la même raison. `chatter_creator_daily.ca` est un
 * `numeric(12,2)` (vérifié sur information_schema, UAT, 0 ligne à plus de 2 décimales), donc les
 * CA par modèle sont exacts au centime et leurs lignes somment exactement au total.
 *
 * Cette grille EST la base de la fiche : sa colonne « Commission » totalise `payslip.base`.
 * C'est pour ça que la ligne « Commission — X € × Y % » a disparu le 2026-07-27 — elle
 * affichait les deux mêmes nombres (`payslip.ca`, `payslip.base`) à un deuxième endroit, deux
 * blocs plus loin.
 *
 * Plus de variante « mode fixe » depuis la tâche 16 : la commission est TOUJOURS la base, le
 * fixe éventuel s'y ajoute en ligne d'ajustement. La branche qui masquait cette colonne
 * décrivait un mode que personne ne pratiquait.
 */
function ModelBreakdown({ models, row }: { models: [string, number][]; row: ComptaRow }) {
  const total = 'border-t pt-1.5 font-medium'

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 text-sm">
      <span className={COL_HEAD}>Modèle</span>
      <span className={`${COL_HEAD} text-right`}>CA</span>
      <span className={`${COL_HEAD} text-right`}>Commission ({row.rate} %)</span>

      {models.map(([name, ca]) => (
        <Fragment key={name}>
          <span className="min-w-0">
            {/* Badge coloré conservé : c'est l'identification visuelle des modèles partout
                ailleurs dans l'app (`modelColor`), aucun style nouveau introduit ici. */}
            <Badge className={modelColor(name)}>{name}</Badge>
          </span>
          <span className="text-right tabular-nums">{eur2(ca)}</span>
          <span className="text-right tabular-nums">{eur2(round2((ca * row.rate) / 100))}</span>
        </Fragment>
      ))}

      <span className={total}>Total</span>
      <span className={`${total} text-right tabular-nums`}>{eur2(row.payslip.ca)}</span>
      <span className={`${total} text-right tabular-nums`}>{eur2(row.payslip.base)}</span>
    </div>
  )
}

/**
 * Sanctions Police — le TOTAL sur une ligne d'ajustement comme les autres, puis chaque entrée
 * avec son motif, en retrait.
 *
 * Le motif reste à l'écran (c'est une retenue sur salaire, elle doit être justifiée), mais le
 * bloc encadré rouge a sauté le 2026-07-27 : il criait plus fort que le net, qui est la
 * conclusion de la fiche. Le rouge survit là où il informe — sur le montant retenu.
 */
function SanctionLines({ sanctions, amount }: { sanctions: ComptaRow['sanctions']; amount: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Line label="Sanctions Police" amount={-amount} red />
      <div className="flex flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
        {sanctions.map((s, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span>
              {frDayShort(s.day)} — {s.label ?? 'Malus'}
            </span>
            <span className="tabular-nums">
              {s.kind === 'warning' ? 'avertissement' : eur2(-s.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ZONE 1 de la fiche — CE QU'ON LIT : d'où vient la base, ce qui s'y ajoute ou s'en retire, et
 * le net qui CONCLUT, bouton de paiement à côté de lui.
 *
 * Ordre voulu par le propriétaire (2026-07-27, « simplifie l'affichage ») : le net était
 * enterré au milieu de la pile, entre la ventilation et les formulaires.
 */
export function ComptaPayslipCalc({
  row,
  period,
  canPay,
  periodElapsed,
}: {
  row: ComptaRow
  period: PayPeriod
  canPay: boolean
  periodElapsed: boolean
}) {
  const p = row.payslip
  const models = Object.entries(row.modelCa).sort(([, a], [, b]) => b - a)

  // Une composante nulle ne fait PAS de ligne (règle déjà en place avant la refonte) : le titre
  // « Ajustements » ne doit donc apparaître que si au moins une ligne le suit.
  const hasAdjustments =
    p.setter !== 0 ||
    p.bonus !== 0 ||
    p.malus !== 0 ||
    row.handoffs > 0 ||
    p.prime !== 0 ||
    row.sanctions.length > 0 ||
    p.carryover !== 0 ||
    p.setterPrime !== 0 ||
    p.monthlyPrime !== 0

  return (
    <div className="flex flex-col gap-4">
      {models.length > 0 ? (
        <ModelBreakdown models={models} row={row} />
      ) : (
        // Sans aucun modèle la ventilation ne rend rien : la base sortirait de l'écran.
        // C'est le SEUL cas où l'ancienne ligne « Commission — X € × Y % » survit.
        <div className="flex flex-col gap-1">
          <Line label={`Commission — ${eur2(p.ca)} × ${row.rate} %`} amount={p.base} />
          <p className="text-xs text-muted-foreground">
            Aucun CA sur la période — rien à ventiler par modèle.
          </p>
        </div>
      )}

      {hasAdjustments && (
        <div className="flex flex-col gap-1.5">
          <span className={SECTION_HEAD}>Ajustements</span>
          {/* Libellé NU depuis la tâche 19. Il disait auparavant lequel des deux montants
              s'appliquait (« ajusté (réglage : 75 €) ») — il n'y en a plus qu'un, celui de
              du réglage de Membres, et la colonne « Rémunération » de la table l'affiche déjà. */}
          {p.setter !== 0 && <Line label="Fixe setter" amount={p.setter} />}
          {p.bonus !== 0 && <Line label="Bonus" amount={p.bonus} />}
          {p.malus !== 0 && <Line label="Malus saisis" amount={-p.malus} red />}
          {row.handoffs > 0 && (
            <Line label={`Handoffs — ${row.handoffs} × 0,60 €`} amount={p.handoffsAmount} />
          )}
          {p.prime !== 0 && <Line label="Prime nouveau chatteur" amount={p.prime} />}
          {/* ── LES TROIS LIGNES DU LOT FINAL ────────────────────────────────────────────
              Chacune sur SA ligne, comme les autres composantes : la fiche doit se relire
              comme la feuille, ligne à ligne, et le net s'additionner exactement à partir de
              ce qui est affiché (`computePayslip` arrondit chaque composante avant la somme).
              Le REPORT est le seul montant signé de la fiche — en rouge quand il est négatif,
              comme les malus, parce que c'est bien une retenue sur ce qui sera versé. La PRIME
              SETTER porte son RANG dans le libellé : sans lui, c'est un montant sans
              provenance, et le rang est précisément ce que le chatteur voudra vérifier. */}
          {p.carryover !== 0 && (
            <Line
              label="Report période précédente"
              amount={p.carryover}
              red={p.carryover < 0}
            />
          )}
          {p.setterPrime !== 0 && (
            <Line
              label={
                row.setterRank
                  ? `Prime setter — rang ${row.setterRank.rank} (${row.setterRank.handoffs} handoffs)`
                  : 'Prime setter'
              }
              amount={p.setterPrime}
            />
          )}
          {p.monthlyPrime !== 0 && <Line label="Prime du mois (top 3)" amount={p.monthlyPrime} />}
          {row.sanctions.length > 0 && (
            <SanctionLines sanctions={row.sanctions} amount={p.sanctions} />
          )}
        </div>
      )}

      {/* UNE PRIME DU MOIS SAISIE QUI N'ENTRE PAS DANS CE NET — le seul écart possible entre le
          champ rempli juste au-dessus et le calcul, et il porte de l'argent. La prime du mois est
          MENSUELLE : versée une fois, elle ne se re-verse pas sur une autre période du même mois
          (`coverage.monthlyPrimePaid`, garde jumelle de celle de la prime d'embauche). Le taire
          ferait apparaître un montant saisi et une ligne absente, sans un mot.
          Affiché ici, dans la ZONE DE LECTURE, et pas seulement sous la saisie : un encadrant
          sans droit de saisie (`canEnter` faux) ne voit pas le formulaire du tout. */}
      {row.periodEntry.top3Prime > 0 && p.monthlyPrime === 0 && (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
          Prime du mois saisie ({eur2(row.periodEntry.top3Prime)}) mais déjà versée à ce chatteur
          pour ce mois-ci — elle n&apos;entre pas dans ce net, elle ne se verse qu&apos;une fois par
          mois.
        </p>
      )}

      <div className="border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-semibold">Net à payer</span>
          <div className="flex items-center gap-4">
            <span className="text-base font-semibold tabular-nums">{eur2(p.net)}</span>
            {canPay && periodElapsed && !row.paid && (
              <ComptaPayDialog row={row} period={period} />
            )}
          </div>
        </div>
        {/* Période EN COURS : dire pourquoi il n'y a pas de bouton. Sans ça, l'écran par
            défaut — le sélecteur ouvre toujours la période courante — est un cul-de-sac
            silencieux pour l'admin, qui cherche un bouton absent sans savoir qu'il attend la
            fin de la période. `payPeriod` refuse de figer des jours non révolus (un CA
            encore incomplet serait versé définitivement, et le bandeau de retard ne le
            signalerait jamais puisqu'il se déduit de la couverture). */}
        {canPay && !periodElapsed && !row.paid && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Période en cours — le paiement s&apos;ouvre à partir du{' '}
            {frDateNumeric(addDays(period.end, 1))}, quand le CA de la période est complet.
          </p>
        )}
        {row.paid && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Payé le {row.paidOn ? frDateNumeric(row.paidOn) : '—'} — {eur2(row.paidAmount ?? 0)}
            {/* Écart possible avec le « Net à payer » ci-dessus : celui-ci est recalculé
                aujourd'hui, celui-là est l'instantané figé au virement. C'est l'instantané
                qui fait foi. */}
          </p>
        )}
      </div>
    </div>
  )
}
