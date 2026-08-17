'use client'

// Historique agrégé PAR CHATTEUR (demande Benoit 2026-08-17) : une ligne = un chatteur sur la
// période, totaux en face (sanctions, avertissements, malus €), dépliable en détail ligne par
// ligne — même patron accordéon que la page Chatters (chevron + `renderSubRows` du DataTable
// partagé). L'édition du malus et la suppression vivent sur les lignes de DÉTAIL (écrivains).

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type ColumnDef, type Row } from '@tanstack/react-table'
import { frDayShort, frTimeShort } from '@glagency/core'
import { toast } from 'sonner'
import { ChevronRight, Trash2, TriangleAlert, Gavel, Pencil } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { STATUS_COLORS } from '@/lib/status-color'
import { cn } from '@/lib/utils'
import { eur2max as eur } from '@/lib/format'
import { deletePoliceEntry, updatePoliceMalus } from '../actions'
import { malusEditFormSchema, type MalusEditForm } from '../schema'
import type { PoliceEntry } from '../types'

/** Une ligne d'agrégat : un chatteur, ses totaux de la période, son détail (déplié). */
interface ChatterGroup {
  chatterId: string
  chatterName: string
  /** Détail de la période, plus récent d'abord (jour de faute, puis heure de saisie). */
  entries: PoliceEntry[]
  warnings: number
  totalMalus: number
  /** Clé de tri de la dernière sanction (`occurredOn createdAt`) — lexicographique = chronologique. */
  lastKey: string
}

/** Clé de tri chronologique d'une entrée : jour de FAUTE d'abord (une sanction antidatée via le
 *  datepicker se classe à SA date), heure de saisie en départage. */
const entryKey = (e: PoliceEntry) => `${e.occurredOn} ${e.createdAt}`

/** Agrège les entrées (déjà filtrées par la recherche) par chatteur. */
function groupByChatter(entries: PoliceEntry[]): ChatterGroup[] {
  const byId = new Map<string, ChatterGroup>()
  for (const e of entries) {
    const g = byId.get(e.chatterId) ?? {
      chatterId: e.chatterId,
      chatterName: e.chatterName,
      entries: [],
      warnings: 0,
      totalMalus: 0,
      lastKey: '',
    }
    g.entries.push(e)
    if (e.kind === 'warning') g.warnings += 1
    else g.totalMalus += e.amountEur
    byId.set(e.chatterId, g)
  }
  for (const g of byId.values()) {
    g.entries.sort((a, b) => (entryKey(a) < entryKey(b) ? 1 : -1))
    g.lastKey = entryKey(g.entries[0])
  }
  return [...byId.values()]
}

/** Colonnes d'agrégat : chatter (chevron), nb sanctions, nb avert., total malus, dernière. */
function buildColumns(canWrite: boolean): ColumnDef<ChatterGroup>[] {
  const columns: ColumnDef<ChatterGroup>[] = [
    {
      accessorKey: 'chatterName',
      header: ({ column }) => <Sortable column={column} label="Chatter" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              row.getIsExpanded() && 'rotate-90',
            )}
          />
          <span className="font-medium">{row.original.chatterName}</span>
        </div>
      ),
    },
    {
      id: 'count',
      accessorFn: (g) => g.entries.length,
      header: ({ column }) => <Sortable column={column} label="Sanctions" />,
      cell: ({ row }) => <span className="tabular-nums">{row.original.entries.length}</span>,
    },
    {
      id: 'warnings',
      accessorFn: (g) => g.warnings,
      header: ({ column }) => <Sortable column={column} label="Avert." />,
      cell: ({ row }) =>
        row.original.warnings > 0 ? (
          <Badge className={STATUS_COLORS.warning}>
            <TriangleAlert className="size-3" />
            {row.original.warnings}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'totalMalus',
      accessorFn: (g) => g.totalMalus,
      header: ({ column }) => <Sortable column={column} label="Total malus" />,
      cell: ({ row }) =>
        row.original.totalMalus > 0 ? (
          <Badge className={STATUS_COLORS.danger}>
            <Gavel className="size-3" />
            {eur(row.original.totalMalus)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'lastAt',
      accessorFn: (g) => g.lastKey,
      header: ({ column }) => <Sortable column={column} label="Dernière" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {frDayShort(row.original.entries[0].occurredOn)}
        </span>
      ),
    },
  ]
  // Colonne actions VIDE sur l'agrégat (les actions vivent dans le détail) — présente pour que
  // les en-têtes et les cellules des sous-lignes restent alignés quand on peut écrire.
  if (canWrite) columns.push({ id: 'actions', header: '', cell: () => null })
  return columns
}

/** Détail déplié : une sous-ligne par sanction (badge, erreur, motif, shift, date, actions). */
function policeSubRows(row: Row<ChatterGroup>, canWrite: boolean) {
  return row.original.entries.map((e) => {
    const isMalus = e.kind === 'malus'
    return (
      <TableRow key={e.id} className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="pl-8">
          <Badge className={STATUS_COLORS[isMalus ? 'danger' : 'warning']}>
            {isMalus ? <Gavel className="size-3" /> : <TriangleAlert className="size-3" />}
            {isMalus ? eur(e.amountEur) : 'Avert.'}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">{e.errorLabel ?? '—'}</TableCell>
        <TableCell>
          <span className="block max-w-40 truncate text-muted-foreground" title={e.note ?? undefined}>
            {e.note ?? '—'}
          </span>
        </TableCell>
        <TableCell className="capitalize text-muted-foreground">
          {e.shift ?? '—'}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {frDayShort(e.occurredOn)} · {frTimeShort(e.createdAt)} · {e.controllerName}
        </TableCell>
        {canWrite && (
          <TableCell className="text-right">
            <RowActions e={e} />
          </TableCell>
        )}
      </TableRow>
    )
  })
}

/** Historique de la période (datepicker global), agrégé par chatteur et dépliable. La recherche
 *  est CONTRÔLÉE par le parent (`PoliceView`) : les entrées arrivent déjà filtrées, pour que les
 *  KPIs au-dessus racontent la même chose que la table (même input, mêmes classes — patron
 *  « recherche client contrôlée » documenté sur DataTable). */
export function PoliceTable({
  entries,
  canWrite,
  search,
  onSearchChange,
}: {
  entries: PoliceEntry[]
  canWrite: boolean
  search: string
  onSearchChange: (next: string) => void
}) {
  const groups = useMemo(() => groupByChatter(entries), [entries])
  const columns = useMemo(() => buildColumns(canWrite), [canWrite])
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Historique de la période</h2>
      <DataTable
        data={groups}
        columns={columns}
        search={search}
        onSearchChange={onSearchChange}
        filterPlaceholder="Rechercher un chatter…"
        initialSorting={[{ id: 'totalMalus', desc: true }]}
        pageSize={20}
        getRowId={(g) => g.chatterId}
        getRowCanExpand={() => true}
        renderSubRows={(row) => policeSubRows(row, canWrite)}
        countLabel={(n) => `${n} chatter(s)`}
      />
    </section>
  )
}

/** Bout de sous-ligne (écrivains) : édition du malus + suppression — mêmes règles que 0106. */
function RowActions({ e }: { e: PoliceEntry }) {
  const isMalus = e.kind === 'malus'
  // Échec → l'erreur reste DANS le ConfirmDialog (retour string) — plus de toast doublon
  // (l'audit a relevé le même message affiché deux fois). Succès → toast.
  const remove = async () => {
    const res = await deletePoliceEntry({ id: e.id })
    if (!res.success) return res.error
    toast.success('Entrée supprimée')
  }
  return (
    <div className="flex items-center justify-end">
      {isMalus && <MalusEdit e={e} />}
      <ConfirmDialog
        onConfirm={remove}
        title="Supprimer cette entrée ?"
        description={`Supprimer définitivement ${isMalus ? 'ce malus' : 'cet avertissement'} de ${e.chatterName} ? Cette action est irréversible.`}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Supprimer"
            className="size-7 text-red-600 hover:text-red-700"
          >
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
    </div>
  )
}

/** Édition inline d'un malus (montant + note) — accès `police` en ÉCRITURE (gaté par
 *  `canWrite` via la colonne actions des sous-lignes ; un chatteur est en lecture seule). */
function MalusEdit({ e }: { e: PoliceEntry }) {
  // 'use no memo' : formState de RHF est un Proxy à abonnement — mémoïsé par le React
  // Compiler, isSubmitting/errors gèlent (règle projet, mémoire forms-zod-rhf).
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MalusEditForm>({
    resolver: zodResolver(malusEditFormSchema),
    defaultValues: { amount: String(e.amountEur), note: e.note ?? '' },
  })

  const save = handleSubmit(async (values) => {
    const res = await updatePoliceMalus({
      id: e.id,
      amountEur: Number(values.amount.replace(',', '.')),
      note: values.note?.trim() || undefined,
    })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Malus modifié')
    setOpen(false)
  })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) reset({ amount: String(e.amountEur), note: e.note ?? '' })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Modifier le malus"
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <form onSubmit={save} className="flex flex-col gap-2">
          <Label>Modifier le malus — {e.chatterName}</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              placeholder="Montant €"
              className="h-8 w-24 text-sm"
              {...register('amount')}
            />
            <Input placeholder="Raison" className="h-8 flex-1 text-sm" {...register('note')} />
          </div>
          {errors.amount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
          {errors.root && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}
          <ActionButton type="submit" size="sm" pending={isSubmitting} className="self-end">
            Enregistrer
          </ActionButton>
        </form>
      </PopoverContent>
    </Popover>
  )
}
