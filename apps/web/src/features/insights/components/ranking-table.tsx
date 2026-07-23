'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { frDayShort } from '@glagency/core'
import { DataTable } from '@/components/data-table/data-table'
import { HeaderInfo } from '@/components/data-table/header-info'
import { eur, num, pct } from '@/lib/format'
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

/**
 * Score Général /100 : poids managériaux (le CA prime, la présence ensuite) et seuil
 * « classé » (jours actifs minimum — en dessous, les micro-actifs squattent les bons
 * percentiles réactivité/conversion avec 3 conversations sur 1 jour). Réglage validé
 * avec Benoit — ajuster ici si la règle évolue.
 */
const WEIGHTS: Record<BaseMetric, number> = { ca: 3, presence: 2, propose: 1, conv: 1, react: 1 }
const TOTAL_WEIGHT = BASE_METRICS.reduce((s, k) => s + WEIGHTS[k], 0)
const MIN_DAYS = 4

/** Règle du score Général — affichée par le ⓘ de l'en-tête de colonne « Score /100 ». */
const SCORE_INFO =
  'Note sur 100 qui combine les 5 critères de la semaine : le CA compte triple, la présence double, le reste simple. Il faut au moins 4 jours d’activité pour être classé. Survole un score pour voir le détail.'

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
    fmt: (v) => pct(v),
    dir: 'desc',
  },
  react: { label: 'Réactivité', get: (r) => r.reactSec, fmt: (v) => `${v} s`, dir: 'asc' },
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`)

/**
 * Rangs d'une métrique (classement « competition » : ex æquo = même rang).
 * Sans donnée = dernier (N) — converti en 0 point par le percentile du score Général.
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
 * Tableau de classement global des chatteurs — par métrique, ou « Général » = score /100
 * pondéré sur les 5 critères (percentile par critère parmi les classés ≥ MIN_DAYS jours
 * actifs, moyenne pondérée par WEIGHTS ; décomposition au survol — le rang s'explique par
 * ses propres composantes, sans IA). Les non-classés restent visibles en bas (« — »).
 * Bâti sur le `DataTable` partagé (pagination/recherche identiques au reste de l'app).
 */
export function RankingTable({ ranking, metric }: { ranking: RankingData; metric: RankMetric }) {
  // « Général » : score /100 pondéré + décomposition par chatteur (tooltip).
  const general = (() => {
    if (metric !== 'general') return null
    const classed = ranking.rows.filter((r) => r.days >= MIN_DAYS)
    const n = classed.length
    const rankMaps = BASE_METRICS.map((k) => [k, ranksFor(classed, METRICS[k])] as const)
    // Rang compétition (1 = meilleur) → percentile 0-100. Sans donnée : ranksFor donne N
    // → 0 point sur le critère. n ≤ 1 : pas de comparaison possible → 100.
    const pctOf = (rank: number) => (n > 1 ? ((n - rank) / (n - 1)) * 100 : 100)
    const score = new Map<string, number>()
    const detail = new Map<string, string>()
    for (const r of classed) {
      const parts = rankMaps.map(([k, m]) => [k, pctOf(m.get(r.chatterId)!)] as const)
      score.set(
        r.chatterId,
        parts.reduce((s, [k, p]) => s + WEIGHTS[k] * p, 0) / TOTAL_WEIGHT,
      )
      detail.set(
        r.chatterId,
        parts
          .map(
            ([k, p]) =>
              `${SHORT_LABEL[k]} ${Math.round(p)}${WEIGHTS[k] > 1 ? ` ×${WEIGHTS[k]}` : ''}`,
          )
          .join(' · '),
      )
    }
    for (const r of ranking.rows)
      if (!score.has(r.chatterId))
        detail.set(r.chatterId, `Non classé — ${r.days} j actif(s) (minimum ${MIN_DAYS})`)
    return { score, detail }
  })()

  const m: MetricDef =
    metric === 'general'
      ? {
          label: 'Score /100',
          get: (r) => general!.score.get(r.chatterId) ?? null,
          fmt: (v) => `${Math.round(v)}`,
          dir: 'desc',
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
      header:
        metric === 'general'
          ? () => (
              <div className="flex items-center justify-end gap-1.5">
                {m.label}
                <HeaderInfo text={SCORE_INFO} />
              </div>
            )
          : m.label,
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
          {metric === 'general' ? 'Général (score /100 · 5 critères pondérés)' : m.label}
        </h3>
        {ranking.weekStart && (
          <span className="text-xs text-muted-foreground">
            Semaine du {frDayShort(ranking.weekStart)}
          </span>
        )}
      </div>
      {/* key={metric} : REMONTE la table à chaque changement de métrique. Indispensable —
          les lignes du DataTable partagé sont mémoïsées par identité de `row.original`
          (data-table.tsx) ; or changer de métrique ne change QUE les colonnes (format,
          unité) et l'ordre, pas les refs de lignes → sans remount, les lignes déjà
          affichées gardent la valeur/médaille de l'ANCIENNE métrique (unités mélangées,
          classement faussé). Bonus : recherche et pagination repartent de zéro. */}
      <DataTable
        key={metric}
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
