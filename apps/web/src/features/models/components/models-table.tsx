'use client'

import { type ColumnDef, type Row } from '@tanstack/react-table'
import { ChevronRight, Info } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { eur, eur2, num, pct } from '@/lib/format'
import type { ModelRow } from '../types'

/** Petit ⓘ d'aide dans un en-tête de colonne (provider local : la table n'en a pas). */
function HeaderInfo({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="En savoir plus"
            className="text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[16rem] text-xs font-normal leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Petite jauge « part du CA » (barre + %). */
function PartBar({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round(value)}%</span>
    </div>
  )
}

const columns: ColumnDef<ModelRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Modèle" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            row.getIsExpanded() && 'rotate-90',
            !row.getCanExpand() && 'opacity-0',
          )}
        />
        <Badge variant="outline" className={cn('font-normal', modelColor(row.original.name))}>
          {row.original.name}
        </Badge>
        {row.original.isPrivate && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">privé</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'total',
    header: ({ column }) => <Sortable column={column} label="CA total" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-semibold tabular-nums">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'newSubs',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="Nouv. subs" className="justify-end" />
        <HeaderInfo text="Nouveaux abonnés (premiers abonnements) gagnés par le modèle sur la période. Source : stats d'abonnements MyPuls (dashboard)." />
      </div>
    ),
    cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{num(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'renouv',
    header: () => (
      <div className="flex items-center justify-end gap-1.5">
        <span>Renouv.</span>
        <HeaderInfo text="Nombre de renouvellements / ré-abonnements sur la période. Source : stats d'abonnements MyPuls (dashboard)." />
      </div>
    ),
    cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{num(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ventes',
    header: ({ column }) => <Sortable column={column} label="Ventes" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{num(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'caMsg',
    header: ({ column }) => <Sortable column={column} label="CA msg." className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ltv',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="LTV / sub" className="justify-end" />
        <HeaderInfo text="Revenu moyen par nouvel abonné (lifetime value). Calcul : CA total du modèle ÷ nombre de nouveaux abonnés. = 0 si le modèle n'a aucun nouvel abonné sur la période." />
      </div>
    ),
    cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{eur2(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'part',
    header: ({ column }) => (
      <div className="flex items-center justify-end gap-1.5">
        <Sortable column={column} label="Part CA" className="justify-end" />
        <HeaderInfo text="Poids du modèle dans le CA de l'agence sur la période sélectionnée. Calcul : CA du modèle ÷ CA total des modèles affichés × 100. Arrondi au plus fort reste → la colonne somme exactement à 100 %." />
      </div>
    ),
    cell: ({ getValue }) => <PartBar value={getValue() as number} />,
    meta: { align: 'right' },
  },
]

/**
 * Détail déplié : les chatteurs qui ont produit sur ce modèle.
 * « Proposé » (et donc la conv) n'existe pas au grain chatteur × modèle (MyPuls ne le
 * ventile pas) → on n'affiche que le nombre de ventes ; la conv reste au niveau chatteur.
 */
function modelSubRows(row: Row<ModelRow>) {
  return row.original.chatters.map((c) => (
    <TableRow key={`${row.id}:${c.name}`} className="bg-muted/30 hover:bg-muted/30">
      <TableCell className="pl-9 font-medium">{c.name}</TableCell>
      <TableCell className="text-right tabular-nums">{eur(c.ca)}</TableCell>
      <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
        PPV {eur(c.ppv)} · Tips {eur(c.tips)} · {c.vendu} vendu{c.vendu > 1 ? 's' : ''}
        {c.propose > 0 ? ` · conv ${pct(c.tauxConv)}` : ''}
      </TableCell>
    </TableRow>
  ))
}

export function ModelsTable({ models }: { models: ModelRow[] }) {
  return (
    <DataTable
      data={models}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par modèle…"
      initialSorting={[{ id: 'total', desc: true }]}
      pageSize={20}
      getRowCanExpand={(row) => row.original.chatters.length > 0}
      renderSubRows={modelSubRows}
      countLabel={(n) => `${n} modèle(s)`}
    />
  )
}
