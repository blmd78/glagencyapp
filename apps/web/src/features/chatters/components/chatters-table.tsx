'use client'

import { useMemo, useState } from 'react'
import { type ColumnDef, type Row } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/data-table/data-table'
import { HeaderInfo } from '@/components/data-table/header-info'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, pct } from '@/lib/format'
import type { ChatterRow } from '../types'

// Couleurs de statut partagées (recette badge shadcn) : lib/status-color.ts.

// Dépliable dès qu'il y a des lignes modèle (y compris à 0) ou un reliquat non ventilé.
const canExpand = (c: ChatterRow) => c.models.length > 0 || c.caUnattributed > 0

const columns: ColumnDef<ChatterRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Chatteur" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            row.getIsExpanded() && 'rotate-90',
            !row.getCanExpand() && 'opacity-0',
          )}
        />
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'models',
    header: 'Modèles',
    cell: ({ row }) => {
      // Raccord avec la période filtrée : uniquement les modèles où il a fait de
      // l'argent sur la plage (pas d'assignation statique — table figée au 01/07).
      const names = row.original.models.map((m) => m.model)
      if (names.length === 0)
        return <span className="text-muted-foreground">—</span>
      const shown = names.slice(0, 4)
      const extra = names.length - shown.length
      return (
        <div className="flex flex-wrap gap-1">
          {shown.map((n) => (
            <Badge key={n} className={modelColor(n)}>
              {n}
            </Badge>
          ))}
          {extra > 0 && (
            <Badge variant="secondary" className="text-muted-foreground">
              +{extra}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'ca',
    header: ({ column }) => <Sortable column={column} label="CA" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'com',
    header: 'Com.',
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return <span className="tabular-nums text-muted-foreground">{v === null ? '—' : eur(v)}</span>
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ppv',
    header: ({ column }) => <Sortable column={column} label="PPV" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tips',
    header: ({ column }) => <Sortable column={column} label="Tips" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    id: 'pv',
    header: 'Prop./Vendu',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.propose === null
          ? row.original.vendu
          : `${row.original.propose} / ${row.original.vendu}`}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tauxConv',
    header: ({ column }) => <Sortable column={column} label="Conv." className="justify-end" />,
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return <span className="tabular-nums">{v === null ? '—' : pct(v)}</span>
    },
    meta: { align: 'right' },
  },
  {
    id: 'presence',
    header: () => (
      <div className="flex items-center justify-end gap-1.5">
        <span>Présence</span>
        <HeaderInfo text="Heures cumulées sur la période : actives / inactives. Actif = en train de chatter ; inactif (idle) = connecté sans activité. Source : page money-team MyPuls." />
      </div>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {row.original.presenceActiveH === null || row.original.presenceIdleH === null
          ? '—'
          : `${Math.round(row.original.presenceActiveH)}h / ${Math.round(row.original.presenceIdleH)}h`}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'reactiviteS',
    header: () => (
      <div className="flex items-center justify-end gap-1.5">
        <span>Réact.</span>
        <HeaderInfo text="Temps de réponse moyen aux fans, en secondes (moyenne des jours de la période). Plus bas = mieux. Source : page money-team MyPuls." />
      </div>
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">
        {getValue() != null ? `${getValue()}s` : '—'}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => (
      <Badge
        className={(getValue() as boolean) ? STATUS_COLORS.positive : STATUS_COLORS.neutral}
      >
        {(getValue() as boolean) ? 'Actif' : 'Fantôme'}
      </Badge>
    ),
    meta: { align: 'center' },
  },
]

/** Détail déplié : une ligne par modèle où le chatteur a produit + reliquat non ventilé. */
function chatterSubRows(row: Row<ChatterRow>) {
  return (
    <>
      {row.original.models.map((m) => (
        <TableRow key={`${row.id}:${m.creatorId}`} className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8">
            <Badge className={modelColor(m.model)}>{m.model}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.ca)}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {m.com === null ? '—' : eur(m.com)}
          </TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.ppv)}</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.tips)}</TableCell>
          {/* « Proposé » n'existe pas au grain chatteur × modèle (non ventilé par MyPuls) :
              on n'affiche que le vendu, et rien en conv (donnée inexistante à ce niveau). */}
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? `${m.propose} / ${m.vendu}` : m.vendu}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? pct(m.tauxConv) : ''}
          </TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      ))}
      {row.original.caUnattributed > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8 italic text-amber-600">
            Non ventilé (identité à résoudre)
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="text-right italic tabular-nums text-amber-600">
            {eur(row.original.caUnattributed)}
          </TableCell>
          <TableCell colSpan={8} className="text-muted-foreground">—</TableCell>
        </TableRow>
      )}
    </>
  )
}

export function ChattersTable({ chatters }: { chatters: ChatterRow[] }) {
  const [modelId, setModelId] = useState('all')

  // Options du sélecteur : les comptes OF présents dans les données de la période
  // (dédupliqués par creator_id — deux comptes peuvent partager un nom).
  const modelOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const c of chatters) for (const m of c.models) byId.set(m.creatorId, m.model)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [chatters])

  const filtered = useMemo(
    () =>
      modelId === 'all'
        ? chatters
        : chatters.filter((c) => c.models.some((m) => m.creatorId === modelId)),
    [chatters, modelId],
  )

  return (
    <DataTable
      data={filtered}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par chatteur…"
      initialSorting={[{ id: 'ca', desc: true }]}
      getRowId={(c) => c.id}
      getRowCanExpand={(row) => canExpand(row.original)}
      renderSubRows={chatterSubRows}
      countLabel={(n) => `${n} chatteur(s)`}
      toolbar={
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tous les modèles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modèles</SelectItem>
            {modelOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}
