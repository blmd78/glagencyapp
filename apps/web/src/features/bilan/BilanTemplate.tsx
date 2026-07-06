'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { frDayShort as frDay } from '@glagency/core'
import { LoadingDots } from '@/components/loading-dots'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KpiGrid } from '@/components/kpi-card'
import { ModelBilanCard } from './components/model-bilan-card'
import type { BilanData } from './types'

/** Template Bilan hebdomadaire : sélecteur de semaine, 4 KPI, une carte par modèle. */
export function BilanTemplate({ data }: { data: BilanData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const selectWeek = (start: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('week', start)
    startTransition(() => router.push(`?${next.toString()}`))
  }

  const kpis = [
    {
      key: 'ca',
      label: 'CA total semaine',
      value: `${Math.round(data.totalCa).toLocaleString('fr-FR')} €`,
      deltaPct: null,
      trendLabel: '',
      hint: '',
    },
    {
      key: 'subs',
      label: 'Nouveaux abonnés',
      value: data.totalNewSubs.toLocaleString('fr-FR'),
      deltaPct: null,
      trendLabel: '',
      hint: '',
    },
    {
      key: 'ltv',
      label: 'LTV moyenne',
      value: data.avgLtv != null ? `${data.avgLtv.toLocaleString('fr-FR')} €/sub` : '—',
      deltaPct: null,
      trendLabel: '',
      hint: 'hors comptes privés',
    },
    {
      key: 'ref',
      label: 'Période de référence',
      value: `${frDay(data.week.start)} au ${frDay(data.week.end)}`,
      deltaPct: null,
      trendLabel: '',
      hint: `S-1 : ${frDay(data.prevWeek.start)} au ${frDay(data.prevWeek.end)} · M-1 (S-4) : ${frDay(data.lastMonthWeek.start)} au ${frDay(data.lastMonthWeek.end)}`,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bilan hebdomadaire</h1>
          <p className="text-sm text-muted-foreground">Par modèle · comparé à S-1 et au mois dernier (S-4)</p>
        </div>
        <div className="ml-auto">
          <Select value={data.week.start} onValueChange={selectWeek} disabled={pending}>
            <SelectTrigger className="h-9 w-56 text-sm tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.weeks.map((w) => (
                <SelectItem key={w.start} value={w.start} className="text-sm tabular-nums">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative flex flex-col gap-6">
        {pending && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-24">
            <LoadingDots />
          </div>
        )}
        <div className={pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
      <KpiGrid kpis={kpis} />
      </div>

      <div className={pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
      {data.models.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune donnée sur cette semaine.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.models.filter((m) => !m.excluded).map((m) => (
              <ModelBilanCard key={m.id} m={m} />
            ))}
          </div>
          {data.models.some((m) => m.excluded) && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Comptes privés — inclus dans le CA total, hors LTV moyenne
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.models.filter((m) => m.excluded).map((m) => (
                  <ModelBilanCard key={m.id} m={m} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>
      </div>
    </div>
  )
}
