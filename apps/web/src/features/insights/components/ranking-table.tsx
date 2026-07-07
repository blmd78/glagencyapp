'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { frDayShort } from '@glagency/core'
import { DataTable } from '@/components/data-table/data-table'
import { eur, num } from '@/lib/format'
import type { RankingData, RankingRow } from '../types'

export type RankMetric = 'ca' | 'presence' | 'propose' | 'conv' | 'react'

interface MetricDef {
  label: string
  get: (r: RankingRow) => number | null
  fmt: (v: number) => string
  dir: 'asc' | 'desc'
}

const METRICS: Record<RankMetric, MetricDef> = {
  ca: { label: 'CA', get: (r) => r.ca, fmt: (v) => eur(v), dir: 'desc' },
  presence: {
    label: 'Présence',
    get: (r) => r.presenceH,
    fmt: (v) => `${Math.round(v)} h`,
    dir: 'desc',
  },
  propose: { label: 'Média proposé', get: (r) => r.propose, fmt: (v) => num(v), dir: 'desc' },
  conv: {
    label: 'Taux de conversion',
    get: (r) => r.convPct,
    fmt: (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`,
    dir: 'desc',
  },
  react: { label: 'Réactivité', get: (r) => r.reactSec, fmt: (v) => `${v} s`, dir: 'asc' },
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`)

/**
 * Tableau de classement global des chatteurs pour une métrique — bâti sur le `DataTable`
 * partagé (pagination/recherche identiques au reste de l'app). Données pré-triées selon la
 * métrique (valeur nulle en bas) ; le rang = index global (médailles sur le top 3).
 */
export function RankingTable({ ranking, metric }: { ranking: RankingData; metric: RankMetric }) {
  const m = METRICS[metric]

  // Pré-tri par métrique (valeur nulle → en bas, quel que soit le sens).
  const sorted = [...ranking.rows].sort((a, b) => {
    const va = m.get(a)
    const vb = m.get(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return m.dir === 'desc' ? vb - va : va - vb
  })

  const columns: ColumnDef<RankingRow>[] = [
    {
      id: 'rang',
      header: 'Rang',
      cell: ({ row }) => (m.get(row.original) == null ? '—' : medal(row.index)),
      meta: { align: 'center' },
    },
    {
      accessorKey: 'chatterName',
      header: 'Chatteur',
      cell: ({ row }) => <span className="font-medium">{row.original.chatterName}</span>,
    },
    {
      id: 'value',
      header: m.label,
      cell: ({ row }) => {
        const v = m.get(row.original)
        return (
          <span className="font-semibold tabular-nums">{v == null ? '—' : m.fmt(v)}</span>
        )
      },
      meta: { align: 'right' },
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Classement — {m.label}</h3>
        {ranking.weekStart && (
          <span className="text-xs text-muted-foreground">
            Semaine du {frDayShort(ranking.weekStart)}
          </span>
        )}
      </div>
      <DataTable
        data={sorted}
        columns={columns}
        filterColumnId="chatterName"
        filterPlaceholder="Rechercher un chatteur…"
        countLabel={(n) => `${n} chatteur(s)`}
        getRowId={(r) => r.chatterId}
      />
    </div>
  )
}
