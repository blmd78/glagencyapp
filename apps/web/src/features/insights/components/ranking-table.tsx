'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { frDayShort } from '@glagency/core'
import { DataTable } from '@/components/data-table/data-table'
import { eur, num } from '@/lib/format'
import type { RankingData, RankingRow } from '../types'

export type RankMetric = 'general' | 'ca' | 'presence' | 'propose' | 'conv' | 'react'

/** Les 5 critères combinés par le classement « Général ». */
const BASE_METRICS = ['ca', 'presence', 'propose', 'conv', 'react'] as const
type BaseMetric = (typeof BASE_METRICS)[number]

const SHORT_LABEL: Record<BaseMetric, string> = {
  ca: 'CA',
  presence: 'Prés.',
  propose: 'Prop.',
  conv: 'Conv.',
  react: 'Réact.',
}

const ord = (n: number) => (n === 1 ? '1er' : `${n}e`)

interface MetricDef {
  label: string
  get: (r: RankingRow) => number | null
  fmt: (v: number) => string
  dir: 'asc' | 'desc'
}

const METRICS: Record<BaseMetric, MetricDef> = {
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
 * Rangs d'une métrique (classement « competition » : ex æquo = même rang).
 * Sans donnée = dernier (N), conformément à la règle du classement Général.
 */
function ranksFor(rows: RankingRow[], def: MetricDef): Map<string, number> {
  const withVal = rows
    .filter((r) => def.get(r) != null)
    .sort((a, b) => (def.dir === 'desc' ? def.get(b)! - def.get(a)! : def.get(a)! - def.get(b)!))
  const map = new Map<string, number>()
  let prevVal: number | null = null
  let prevRank = 0
  withVal.forEach((r, i) => {
    const v = def.get(r)!
    const rank = prevVal !== null && v === prevVal ? prevRank : i + 1
    map.set(r.chatterId, rank)
    prevVal = v
    prevRank = rank
  })
  for (const r of rows) if (!map.has(r.chatterId)) map.set(r.chatterId, rows.length)
  return map
}

/**
 * Tableau de classement global des chatteurs — par métrique, ou « Général » = rang moyen
 * sur les 5 critères (le plus bas gagne ; détail des rangs au survol). Bâti sur le
 * `DataTable` partagé (pagination/recherche identiques au reste de l'app).
 */
export function RankingTable({ ranking, metric }: { ranking: RankingData; metric: RankMetric }) {
  // « Général » : rang moyen sur les 5 critères + détail par chatteur (tooltip).
  const general = (() => {
    if (metric !== 'general') return null
    const rankMaps = BASE_METRICS.map((k) => [k, ranksFor(ranking.rows, METRICS[k])] as const)
    const score = new Map<string, number>()
    const detail = new Map<string, string>()
    for (const r of ranking.rows) {
      const ranks = rankMaps.map(([, m]) => m.get(r.chatterId)!)
      score.set(r.chatterId, ranks.reduce((a, b) => a + b, 0) / ranks.length)
      detail.set(
        r.chatterId,
        rankMaps.map(([k, m]) => `${SHORT_LABEL[k]} ${ord(m.get(r.chatterId)!)}`).join(' · '),
      )
    }
    return { score, detail }
  })()

  const m: MetricDef =
    metric === 'general'
      ? {
          label: 'Rang moyen',
          get: (r) => general!.score.get(r.chatterId) ?? null,
          fmt: (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }),
          dir: 'asc',
        }
      : METRICS[metric]

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
          <span
            className="font-semibold tabular-nums"
            title={general?.detail.get(row.original.chatterId)}
          >
            {v == null ? '—' : m.fmt(v)}
          </span>
        )
      },
      meta: { align: 'right' },
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Classement —{' '}
          {metric === 'general' ? 'Général (rang moyen sur les 5 critères)' : m.label}
        </h3>
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
