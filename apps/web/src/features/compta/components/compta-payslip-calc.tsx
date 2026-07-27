'use client'

import { Fragment } from 'react'
import { addDays, frDateNumeric, frDayShort, type Fortnight } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { eur, eur2, round2 } from '@/lib/format'
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
        {eur(amount)}
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
 * En mode `percent`, cette grille EST la base de la fiche : sa colonne « Commission » totalise
 * `payslip.base`. C'est pour ça que la ligne « Commission — X € × Y % » a disparu le
 * 2026-07-27 — elle affichait les deux mêmes nombres (`payslip.ca`, `payslip.base`) à un
 * deuxième endroit, deux blocs plus loin.
 *
 * En mode `fixed`, la colonne commission N'EXISTE PAS : la base vaut `fixedAmount × weekCount`
 * et le CA n'y entre pas (spec §4). Afficher un pourcentage du CA y serait un chiffre qui ne
 * correspond à rien — la ventilation y reste une INFORMATION, dite comme telle par sa légende.
 */
function ModelBreakdown({ models, row }: { models: [string, number][]; row: ComptaRow }) {
  const percent = row.mode === 'percent'
  const total = 'border-t pt-1.5 font-medium'

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={
          percent
            ? 'grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1.5 text-sm'
            : 'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 text-sm'
        }
      >
        <span className={COL_HEAD}>Modèle</span>
        <span className={`${COL_HEAD} text-right`}>CA</span>
        {percent && <span className={`${COL_HEAD} text-right`}>Commission ({row.rate} %)</span>}

        {models.map(([name, ca]) => (
          <Fragment key={name}>
            <span className="min-w-0">
              {/* Badge coloré conservé : c'est l'identification visuelle des modèles partout
                  ailleurs dans l'app (`modelColor`), aucun style nouveau introduit ici. */}
              <Badge className={modelColor(name)}>{name}</Badge>
            </span>
            <span className="text-right tabular-nums">{eur2(ca)}</span>
            {percent && (
              <span className="text-right tabular-nums">{eur2(round2((ca * row.rate) / 100))}</span>
            )}
          </Fragment>
        ))}

        <span className={total}>Total</span>
        <span className={`${total} text-right tabular-nums`}>{eur2(row.payslip.ca)}</span>
        {percent && (
          <span className={`${total} text-right tabular-nums`}>{eur2(row.payslip.base)}</span>
        )}
      </div>

      {!percent && (
        <p className="text-xs text-muted-foreground">
          Pour information : en mode fixe, le CA n&apos;est pas commissionné.
        </p>
      )}
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
              {s.kind === 'warning' ? 'avertissement' : eur(-s.amount)}
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
  fortnight,
  mondays,
  canPay,
  fortnightElapsed,
}: {
  row: ComptaRow
  fortnight: Fortnight
  mondays: string[]
  canPay: boolean
  fortnightElapsed: boolean
}) {
  const p = row.payslip
  const percent = row.mode === 'percent'
  const models = Object.entries(row.modelCa).sort(([, a], [, b]) => b - a)

  // Une composante nulle ne fait PAS de ligne (règle déjà en place avant la refonte) : le titre
  // « Ajustements » ne doit donc apparaître que si au moins une ligne le suit.
  const hasAdjustments =
    row.isSetter ||
    p.bonus !== 0 ||
    p.malus !== 0 ||
    row.handoffs > 0 ||
    p.prime !== 0 ||
    row.sanctions.length > 0

  return (
    <div className="flex flex-col gap-4">
      {percent ? (
        models.length > 0 ? (
          <ModelBreakdown models={models} row={row} />
        ) : (
          // Sans aucun modèle la ventilation ne rend rien : la base sortirait de l'écran.
          // C'est le SEUL cas où l'ancienne ligne « Commission — X € × Y % » survit.
          <div className="flex flex-col gap-1">
            <Line label={`Commission — ${eur(p.ca)} × ${row.rate} %`} amount={p.base} />
            <p className="text-xs text-muted-foreground">
              Aucun CA sur la quinzaine — rien à ventiler par modèle.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Le calcul réel est `fixedAmount × weekCount` (cf. payslip.ts) — afficher
              « × plage de dates » multipliait un montant par un intervalle, ce qui ne veut
              rien dire. `mondays.length` EST le nombre de semaines rattachées. */}
          <Line
            label={`Fixe hebdomadaire — ${eur(row.fixedAmount)} × ${mondays.length} semaine${mondays.length > 1 ? 's' : ''}`}
            amount={p.base}
          />
          {models.length > 0 && <ModelBreakdown models={models} row={row} />}
        </>
      )}

      {hasAdjustments && (
        <div className="flex flex-col gap-1.5">
          <span className={SECTION_HEAD}>Ajustements</span>
          {row.isSetter && <Line label="Fixe setter" amount={p.setter} />}
          {p.bonus !== 0 && <Line label="Bonus" amount={p.bonus} />}
          {p.malus !== 0 && <Line label="Malus saisis" amount={-p.malus} red />}
          {row.handoffs > 0 && (
            <Line label={`Handoffs — ${row.handoffs} × 0,60 €`} amount={p.handoffsAmount} />
          )}
          {p.prime !== 0 && <Line label="Prime nouveau chatteur" amount={p.prime} />}
          {row.sanctions.length > 0 && (
            <SanctionLines sanctions={row.sanctions} amount={p.sanctions} />
          )}
        </div>
      )}

      <div className="border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-semibold">Net à payer</span>
          <div className="flex items-center gap-4">
            <span className="text-base font-semibold tabular-nums">{eur(p.net)}</span>
            {canPay && fortnightElapsed && !row.paid && (
              <ComptaPayDialog row={row} fortnight={fortnight} />
            )}
          </div>
        </div>
        {/* Quinzaine EN COURS : dire pourquoi il n'y a pas de bouton. Sans ça, l'écran par
            défaut — le sélecteur ouvre toujours la quinzaine courante — est un cul-de-sac
            silencieux pour l'admin, qui cherche un bouton absent sans savoir qu'il attend la
            fin de la période. `payFortnight` refuse de figer des jours non révolus (un CA
            encore incomplet serait versé définitivement, et le bandeau de retard ne le
            signalerait jamais puisqu'il se déduit de la couverture). */}
        {canPay && !fortnightElapsed && !row.paid && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Quinzaine en cours — le paiement s&apos;ouvre à partir du{' '}
            {frDateNumeric(addDays(fortnight.to, 1))}, quand le CA de la période est complet.
          </p>
        )}
        {row.paid && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Payé le {row.paidOn ? frDateNumeric(row.paidOn) : '—'} — {eur(row.paidAmount ?? 0)}
            {/* Écart possible avec le « Net à payer » ci-dessus : celui-ci est recalculé
                aujourd'hui, celui-là est l'instantané figé au virement. C'est l'instantané
                qui fait foi. */}
          </p>
        )}
      </div>
    </div>
  )
}
