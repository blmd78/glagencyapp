'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Combobox } from '@/components/ui/combobox'
import { eur } from '@/lib/format'
import { ComptaTable } from './compta-table'
import type { ComptaData } from '../types'

/**
 * Vue interactive de la Compta : sélecteur de quinzaine, KPIs de la période, puis la table des
 * chatteurs, dépliable sur la fiche de paie. Le sélecteur pousse `?month=`&`?period=` — la
 * page, Server Component, se recharge sur la quinzaine choisie.
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (value: string) => {
    const [month, period] = value.split('|')
    const params = new URLSearchParams(searchParams)
    params.set('month', month)
    params.set('period', period)
    startTransition(() => router.replace(`/chatter/compta?${params.toString()}` as Route, { scroll: false }))
  }

  const due = data.rows.filter((r) => !r.paid)
  const kpis: Kpi[] = [
    {
      key: 'due', label: 'À payer', value: eur(due.reduce((s, r) => s + r.payslip.net, 0)),
      deltaPct: null, trendLabel: data.fortnight.label, hint: `${due.length} chatteur${due.length > 1 ? 's' : ''}`,
    },
    {
      // L'INSTANTANÉ (`paidAmount`), pas `payslip.net` : ce dernier est le recalcul du jour, et
      // une ré-ingestion du CA le ferait diverger des virements réellement passés — c'est
      // précisément ce que l'instantané existe pour éviter (spec §5.3).
      key: 'paid', label: 'Déjà payé', value: eur(data.rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0)),
      deltaPct: null, trendLabel: 'Quinzaine couverte', hint: `${data.rows.length - due.length} réglé${data.rows.length - due.length > 1 ? 's' : ''}`,
    },
    {
      key: 'ca', label: 'CA de la période', value: eur(data.rows.reduce((s, r) => s + r.payslip.ca, 0)),
      deltaPct: null, trendLabel: 'Base de commission', hint: 'tous modèles',
    },
    {
      key: 'sanctions', label: 'Sanctions', value: eur(-data.rows.reduce((s, r) => s + r.payslip.sanctions, 0)),
      deltaPct: null, trendLabel: 'Retenues Police', hint: `${data.rows.reduce((s, r) => s + r.sanctions.length, 0)} entrée(s)`,
    },
  ]

  return (
    <div className={pending ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
      {/* `Combobox` et non `UrlSelect` : ce dernier est typé `param: 'day' | 'month'` et ne
          pilote qu'UN paramètre, alors qu'une quinzaine en demande deux (`month` + `period`). */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Quinzaine :</span>
        <Combobox
          value={`${data.fortnight.month}|${data.fortnight.period}`}
          onChange={select}
          disabled={pending}
          className="w-56"
          searchPlaceholder="Rechercher une quinzaine…"
          options={data.choices.map((f) => ({ value: `${f.month}|${f.period}`, label: f.label }))}
        />
      </div>

      <KpiGrid
        kpis={kpis}
        accents={['border-t-blue-500', 'border-t-green-500', 'border-t-violet-500', 'border-t-red-500']}
      />

      {data.overdue.length > 0 && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {data.overdue.length} quinzaine{data.overdue.length > 1 ? 's' : ''} antérieure
          {data.overdue.length > 1 ? 's' : ''} incomplètement couverte
          {data.overdue.length > 1 ? 's' : ''} : {data.overdue.map((f) => f.label).join(' · ')}
        </p>
      )}

      <ComptaTable
        rows={data.rows}
        fortnight={data.fortnight}
        fortnightElapsed={data.fortnightElapsed}
        linkableChatters={data.linkableChatters}
        canEnter={canEnter}
        canPay={canPay}
        canConfigure={canConfigure}
      />
    </div>
  )
}
