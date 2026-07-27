'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'
import { mondaysIn } from '@glagency/core'
import { MembersAccordion } from '@/components/members-accordion'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { Combobox } from '@/components/ui/combobox'
import { eur } from '@/lib/format'
import { ComptaPayslip } from './compta-payslip'
import type { ComptaData } from '../types'

/**
 * Vue interactive de la Compta : sélecteur de quinzaine, KPIs de la période, puis la pile de
 * noms dépliables (même grammaire que le Planning et le Dashboard). Le sélecteur pousse
 * `?month=`&`?period=` — la page, Server Component, se recharge sur la quinzaine choisie.
 */
export function ComptaView({
  data,
  canEnter,
  canPay,
}: {
  data: ComptaData
  canEnter: boolean
  canPay: boolean
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
      key: 'paid', label: 'Déjà payé', value: eur(data.rows.filter((r) => r.paid).reduce((s, r) => s + r.payslip.net, 0)),
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

      <MembersAccordion
        items={data.rows}
        hint={(r) =>
          r.chatterId == null ? '⚠ non relié à MyPuls' : r.paid ? `payé le ${r.paidOn}` : `${eur(r.payslip.net)} à payer`
        }
      >
        {(r) => (
          <ComptaPayslip
            row={r}
            fortnight={data.fortnight}
            mondays={mondaysIn(data.fortnight)}
            canEnter={canEnter}
            canPay={canPay}
          />
        )}
      </MembersAccordion>
    </div>
  )
}
