'use client'

// Historique des sanctions en TABLE (patron de la page Membres : DataTable + barre de
// recherche) — remplace le feed en cartes groupées par chatteur (demande Benoit 2026-08-06).
// Plus de select chatteur : la recherche filtre par nom. Une ligne = une sanction, triable
// (récent d'abord par défaut) ; édition du malus + suppression en bout de ligne (écrivains).

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { type ColumnDef } from '@tanstack/react-table'
import { frDayShort, frTimeShort } from '@glagency/core'
import { toast } from 'sonner'
import { Trash2, TriangleAlert, Gavel, Pencil } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur2max as eur } from '@/lib/format'
import { deletePoliceEntry, updatePoliceMalus } from '../actions'
import { malusEditFormSchema, type MalusEditForm } from '../schema'
import type { PoliceEntry } from '../types'

/** Colonnes : chatter, sanction, erreur, motif, shift, date/heure, contrôleur (+ actions). */
function buildColumns(isMonth: boolean, canWrite: boolean): ColumnDef<PoliceEntry>[] {
  const columns: ColumnDef<PoliceEntry>[] = [
    {
      accessorKey: 'chatterName',
      header: ({ column }) => <Sortable column={column} label="Chatter" />,
      cell: ({ row }) => <span className="font-medium">{row.original.chatterName}</span>,
    },
    {
      id: 'sanction',
      // Tri par montant : un avertissement vaut 0 → trier fait remonter les malus.
      accessorFn: (e) => e.amountEur,
      header: ({ column }) => <Sortable column={column} label="Sanction" />,
      cell: ({ row }) => {
        const e = row.original
        const isMalus = e.kind === 'malus'
        return (
          <Badge className={STATUS_COLORS[isMalus ? 'danger' : 'warning']}>
            {isMalus ? <Gavel className="size-3" /> : <TriangleAlert className="size-3" />}
            {isMalus ? eur(e.amountEur) : 'Avert.'}
          </Badge>
        )
      },
    },
    {
      id: 'erreur',
      accessorFn: (e) => e.errorLabel ?? '',
      header: 'Erreur',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.errorLabel ?? '—'}</span>
      ),
    },
    {
      id: 'motif',
      accessorFn: (e) => e.note ?? '',
      header: 'Motif',
      cell: ({ row }) => (
        <span className="block max-w-56 truncate text-muted-foreground" title={row.original.note ?? undefined}>
          {row.original.note ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'shift',
      header: 'Shift',
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground">{row.original.shift ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <Sortable column={column} label={isMonth ? 'Date' : 'Heure'} />,
      cell: ({ row }) => {
        const e = row.original
        return (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {/* En mois : la date du jour de faute d'abord — en jour, l'heure suffit. */}
            {isMonth ? `${frDayShort(e.occurredOn)} · ` : ''}
            {frTimeShort(e.createdAt)}
          </span>
        )
      },
    },
    {
      accessorKey: 'controllerName',
      header: 'Contrôleur',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.controllerName}</span>
      ),
    },
  ]
  if (canWrite) {
    columns.push({
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => <RowActions e={row.original} />,
    })
  }
  return columns
}

/** Historique de la période (jour OU mois) — même DataTable que la page Membres. */
export function PoliceTable({
  entries,
  isMonth,
  canWrite,
}: {
  entries: PoliceEntry[]
  isMonth: boolean
  canWrite: boolean
}) {
  const columns = useMemo(() => buildColumns(isMonth, canWrite), [isMonth, canWrite])
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {isMonth ? 'Historique du mois' : 'Historique du jour'}
      </h2>
      <DataTable
        data={entries}
        columns={columns}
        filterColumnId="chatterName"
        filterPlaceholder="Rechercher un chatter…"
        initialSorting={[{ id: 'createdAt', desc: true }]}
        pageSize={20}
        getRowId={(e) => e.id}
        countLabel={(n) => `${n} sanction(s)`}
      />
    </section>
  )
}

/** Bout de ligne (écrivains) : édition du malus + suppression — mêmes règles que 0106. */
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
 *  `canWrite` via la colonne actions ; un chatteur est en lecture seule). */
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
