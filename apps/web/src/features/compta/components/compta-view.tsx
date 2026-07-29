'use client'

import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur2 } from '@/lib/format'
import { ComptaPeriodPicker, usePeriodSelect } from './compta-period-picker'
import { ComptaTable } from './compta-table'
import { ComptaPayAllDialog } from './compta-pay-all-dialog'
import type { ComptaData } from '../types'

/**
 * Vue interactive de la Compta : sélecteur de période, KPIs de la période, puis la table des
 * chatteurs, dépliable sur la fiche de paie. Le sélecteur pousse `?debut=` (le lundi de départ)
 * — la page, Server Component, se recharge sur la période choisie.
 *
 * La pile de noms (`MembersAccordion`, spec §7) a été remplacée par une data-table le
 * 2026-07-27 à la demande du propriétaire, pour la lisibilité : les huit composantes du net
 * (CA, base, bonus, malus, sanctions, prime…) se comparent d'une ligne à l'autre sans avoir à
 * déplier. `MembersAccordion` reste la grammaire du Planning et du Dashboard.
 */
export function ComptaView({
  data,
  canEnter,
  canPay,
  canConfigure,
}: {
  data: ComptaData
  canEnter: boolean
  canPay: boolean
  canConfigure: boolean
}) {
  const { pending, select } = usePeriodSelect()

  // Même population que le filtre « À payer » de la table (compta-table) : les membres non
  // reliés à MyPuls en sont EXCLUS — sans ce garde, le KPI et le bouton-filtre du même écran
  // affichaient deux comptes différents, et un non-relié avec un fixe réglé gonflait le
  // montant d'une somme que ni la vue filtrée ni le paiement groupé ne présentent.
  const due = data.rows.filter((r) => !r.paid && r.chatterId != null)
  // « Réglés » = reliés ET payés (pas `rows - due`, qui compterait les non-reliés en réglés).
  const paidCount = data.rows.filter((r) => r.chatterId != null && r.paid).length
  const kpis: Kpi[] = [
    {
      key: 'due', label: 'À payer', value: eur2(due.reduce((s, r) => s + r.payslip.net, 0)),
      deltaPct: null, trendLabel: data.period.label, hint: `${due.length} chatteur${due.length > 1 ? 's' : ''}`,
    },
    {
      // L'INSTANTANÉ (`paidAmount`), pas `payslip.net` : ce dernier est le recalcul du jour, et
      // une ré-ingestion du CA le ferait diverger des virements réellement passés — c'est
      // précisément ce que l'instantané existe pour éviter (spec §5.3).
      key: 'paid', label: 'Déjà payé', value: eur2(data.rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0)),
      deltaPct: null, trendLabel: 'Période couverte', hint: `${paidCount} réglé${paidCount > 1 ? 's' : ''}`,
    },
    {
      key: 'ca', label: 'CA de la période', value: eur2(data.rows.reduce((s, r) => s + r.payslip.ca, 0)),
      deltaPct: null, trendLabel: 'Base de commission', hint: 'tous modèles',
    },
    {
      key: 'sanctions', label: 'Sanctions', value: eur2(-data.rows.reduce((s, r) => s + r.payslip.sanctions, 0)),
      deltaPct: null, trendLabel: 'Retenues Police', hint: `${data.rows.reduce((s, r) => s + r.sanctions.length, 0)} entrée(s)`,
    },
  ]

  return (
    <div className={pending ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
      {/* Le PAIEMENT GROUPÉ vit ici, en tête de page à côté du sélecteur — pas dans une fiche
          dépliée : il règle toute la période d'un coup. Monté sous `canPay` uniquement (admin) ;
          il dit lui-même pourquoi il n'y a pas de bouton quand il n'y en a pas.
          Sélecteur partagé avec l'onglet Classement : `ComptaPeriodPicker` (`Combobox` et non
          `UrlSelect` — ce dernier est typé `param: 'day' | 'month'`, et `debut` n'en fait pas
          partie). */}
      <div className="flex flex-wrap items-center gap-3">
        {canPay && (
          <ComptaPayAllDialog
            rows={data.rows}
            period={data.period}
            periodElapsed={data.periodElapsed}
          />
        )}
        <ComptaPeriodPicker
          period={data.period}
          choices={data.choices}
          pending={pending}
          onSelect={select}
          className="ml-auto"
        />
      </div>

      <KpiGrid
        kpis={kpis}
        accents={['border-t-blue-500', 'border-t-green-500', 'border-t-violet-500', 'border-t-red-500']}
      />

      {data.overdue.length > 0 && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {data.overdue.length} période{data.overdue.length > 1 ? 's' : ''} antérieure
          {data.overdue.length > 1 ? 's' : ''} incomplètement couverte
          {data.overdue.length > 1 ? 's' : ''} : {data.overdue.map((p) => p.label).join(' · ')}
        </p>
      )}

      <ComptaTable
        rows={data.rows}
        period={data.period}
        periodElapsed={data.periodElapsed}
        linkableChatters={data.linkableChatters}
        canEnter={canEnter}
        canPay={canPay}
        canConfigure={canConfigure}
      />
    </div>
  )
}
