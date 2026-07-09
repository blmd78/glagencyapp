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
import type { SpenderRow } from '../types'

/** « aujourd'hui » / « hier » / « il y a N j » — fraîcheur de la conversation. */
function daysAgo(iso: string | null): { label: string; days: number | null } {
  if (!iso) return { label: '—', days: null }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return { label: "aujourd'hui", days: 0 }
  if (days === 1) return { label: 'hier', days: 1 }
  return { label: `il y a ${days} j`, days }
}

const columns: ColumnDef<SpenderRow>[] = [
  {
    accessorKey: 'username',
    header: ({ column }) => <Sortable column={column} label="Fan" />,
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
    accessorKey: 'ca',
    header: ({ column }) => <Sortable column={column} label="CA net" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
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
      const { label, days } = daysAgo(row.original.lastMessageAt)
      const stale = days !== null && days >= 15
      return (
        <div className="flex items-center gap-2">
          <span className={cn('tabular-nums', stale ? 'font-medium text-amber-600' : 'text-muted-foreground')}>
            {label}
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
]

const FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'a-relancer', label: 'À relancer (nous, ≥ 15 j)' },
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
    if (view === 'a-relancer')
      rows = rows.filter((s) => s.lastMessageIsMine === true && daysAgo(s.lastMessageAt).days! >= 15)
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
      initialSorting={[{ id: 'ca', desc: true }]}
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
