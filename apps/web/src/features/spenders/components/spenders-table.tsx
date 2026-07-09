'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { HeaderInfo } from '@/components/data-table/header-info'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur } from '@/lib/format'
import { daysSince, isARelancer, RELANCE_SEUIL_JOURS, type SpenderRow } from '../types'

/** « aujourd'hui » / « hier » / « il y a N j » — fraîcheur de la conversation. */
function daysLabel(iso: string | null): string {
  const days = daysSince(iso)
  if (days === null) return '—'
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

const columns: ColumnDef<SpenderRow>[] = [
  {
    accessorKey: 'username',
    header: ({ column }) => (
      <div className="flex items-center gap-1.5">
        <Sortable column={column} label="Fan" />
        <HeaderInfo text="Point bleu = message non lu dans la conversation MyPuls (quelqu'un doit aller lire/répondre)." />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">{row.original.username}</span>
        {row.original.hasUnread && (
          <span className="size-2 shrink-0 rounded-full bg-blue-500" title="Message non lu" />
        )}
      </div>
    ),
  },
  {
    accessorKey: 'model',
    header: 'Modèle',
    cell: ({ getValue }) => <Badge className={modelColor(getValue() as string)}>{getValue() as string}</Badge>,
  },
  {
    id: 'chatter',
    accessorFn: (r) => r.chatterName ?? r.assignedLabel ?? '',
    header: ({ column }) => <Sortable column={column} label="Chatteur" />,
    cell: ({ row }) => {
      const name = row.original.chatterName ?? row.original.assignedLabel
      if (!name) return <span className="text-xs italic text-muted-foreground">non assigné</span>
      return (
        <div className="flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {row.original.chatterTeam && (
            <Badge
              className={
                row.original.chatterTeam === 'rouge'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              }
            >
              {row.original.chatterTeam === 'rouge' ? 'Rouge' : 'Bleue'}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'caPeriode',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="CA période" className="justify-end" />
        <HeaderInfo text="CA net dépensé sur la période sélectionnée en haut à droite (transactions datées). Le classement par défaut suit cette colonne." />
      </div>
    ),
    cell: ({ getValue }) => {
      const v = getValue() as number
      return v > 0 ? (
        <span className="font-medium tabular-nums">{eur(v)}</span>
      ) : (
        <span className="tabular-nums text-muted-foreground">—</span>
      )
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ca',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="CA total" className="justify-end" />
        <HeaderInfo text="CA net vie entière du fan, tel que MyPuls le connaît — indépendant de la période." />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    id: 'lastMessage',
    accessorFn: (r) => r.lastMessageAt ?? '',
    header: ({ column }) => (
      <div className="flex items-center gap-1.5">
        <Sortable column={column} label="Dernier message" />
        <HeaderInfo text="Date du dernier message de la conversation MyPuls, et qui l'a envoyé. « nous, sans réponse » = candidat à la relance Snap." />
      </div>
    ),
    cell: ({ row }) => {
      const stale = isARelancer(row.original)
      return (
        <div className="flex items-center gap-2">
          <span className={cn('tabular-nums', stale ? 'font-medium text-amber-600' : 'text-muted-foreground')}>
            {daysLabel(row.original.lastMessageAt)}
          </span>
          {row.original.lastMessageIsMine !== null && (
            <span className="text-xs text-muted-foreground">
              {row.original.lastMessageIsMine ? '(nous, sans réponse)' : '(lui)'}
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ getValue }) => {
      const s = getValue() as string | null
      if (!s) return <span className="text-muted-foreground">—</span>
      const active = s === 'Abonné'
      return (
        <Badge className={cn('text-xs', active ? STATUS_COLORS.positive : STATUS_COLORS.neutral)}>
          {s}
        </Badge>
      )
    },
    meta: { align: 'center' },
  },
]

const FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'a-relancer', label: `À relancer (nous, ≥ ${RELANCE_SEUIL_JOURS} j)` },
  { value: 'a-repondre', label: 'À répondre (lui)' },
  { value: 'orphelins', label: 'Non assignés' },
] as const

export function SpendersTable({ spenders }: { spenders: SpenderRow[] }) {
  const [model, setModel] = useState('all')
  const [view, setView] = useState<(typeof FILTERS)[number]['value']>('all')

  const modelOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const s of spenders) byId.set(s.creatorId, s.model)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [spenders])

  const filtered = useMemo(() => {
    let rows = model === 'all' ? spenders : spenders.filter((s) => s.creatorId === model)
    if (view === 'a-relancer') rows = rows.filter(isARelancer)
    if (view === 'a-repondre') rows = rows.filter((s) => s.lastMessageIsMine === false)
    if (view === 'orphelins') rows = rows.filter((s) => !s.chatterName && !s.assignedLabel)
    return rows
  }, [spenders, model, view])

  return (
    <DataTable
      data={filtered}
      columns={columns}
      filterColumnId="username"
      filterPlaceholder="Filtrer par fan…"
      initialSorting={[{ id: 'caPeriode', desc: true }]}
      getRowId={(s) => `${s.creatorId}:${s.fanId}`}
      countLabel={(n) => `${n} spender(s)`}
      toolbar={
        <>
          <Combobox
            value={model}
            onChange={setModel}
            className="w-44"
            searchPlaceholder="Rechercher un modèle…"
            options={[
              { value: 'all', label: 'Tous les modèles' },
              ...modelOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
          <Combobox
            value={view}
            onChange={(v) => setView(v as typeof view)}
            className="w-52"
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </>
      }
    />
  )
}
