'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2, TriangleAlert, Gavel, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deletePoliceEntry, updatePoliceMalus } from '../actions'
import { malusEditFormSchema, type MalusEditForm } from '../schema'
import type { PoliceData, PoliceEntry } from '../types'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const eur = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`

interface Group {
  chatterId: string
  chatterName: string
  entries: PoliceEntry[]
  warnCount: number
  malusTotal: number
}

/** Journal du jour GROUPÉ par chatteur (blocs triés par activité récente) + KPIs. */
export function PoliceFeed({
  data,
  isAdmin,
  filterChatterId,
  onClearFilter,
}: {
  data: PoliceData
  isAdmin: boolean
  filterChatterId?: string
  onClearFilter?: () => void
}) {
  const remove = async (id: string) => {
    await deletePoliceEntry({ id })
  }

  // data.entries est déjà trié du plus récent au plus ancien → l'ordre de première
  // apparition d'un chatteur = son activité la plus récente.
  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const e of data.entries) {
      let g = map.get(e.chatterId)
      if (!g) {
        g = { chatterId: e.chatterId, chatterName: e.chatterName, entries: [], warnCount: 0, malusTotal: 0 }
        map.set(e.chatterId, g)
      }
      g.entries.push(e)
      if (e.kind === 'malus') g.malusTotal += e.amountEur
      else g.warnCount += 1
    }
    return [...map.values()]
  }, [data.entries])

  const shown = filterChatterId ? groups.filter((g) => g.chatterId === filterChatterId) : groups
  const filterName = filterChatterId
    ? (data.chatterOptions.find((c) => c.id === filterChatterId)?.name ??
      groups.find((g) => g.chatterId === filterChatterId)?.chatterName ??
      '?')
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border">
        <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold">
          <span>Historique du jour</span>
          {filterName && onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/70"
            >
              filtré : {filterName}
              <X className="size-3" />
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {filterName ? `Aucune entrée pour ${filterName} ce jour.` : 'Aucune entrée ce jour.'}
          </p>
        ) : (
          <ul className="divide-y">
            {shown.map((g) => (
              <li key={g.chatterId} className="px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-semibold">{g.chatterName}</span>
                  {g.warnCount > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {g.warnCount} avert.
                    </span>
                  )}
                  {g.malusTotal > 0 && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                      malus {eur(g.malusTotal)}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.entries.map((e) => (
                    <EntryRow key={e.id} e={e} isAdmin={isAdmin} onRemove={() => remove(e.id)} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EntryRow({
  e,
  isAdmin,
  onRemove,
}: {
  e: PoliceEntry
  isAdmin: boolean
  onRemove: () => void
}) {
  const isMalus = e.kind === 'malus'
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
          isMalus
            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        )}
      >
        {isMalus ? <Gavel className="size-3" /> : <TriangleAlert className="size-3" />}
        {isMalus ? eur(e.amountEur) : 'Avert.'}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {isMalus
          ? [e.errorLabel, e.note].filter(Boolean).join(' · ') || '—'
          : (e.errorLabel ?? '')}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {e.shift ? `${e.shift} · ` : ''}
        {e.controllerName} · {time(e.createdAt)}
      </span>
      {isMalus && <MalusEdit e={e} />}
      {isAdmin && (
        <ConfirmDialog
          onConfirm={onRemove}
          title="Supprimer cette entrée ?"
          description={`Supprimer définitivement ${isMalus ? 'ce malus' : "cet avertissement"} de ${e.chatterName} ? Cette action est irréversible.`}
          trigger={
            <button
              type="button"
              title="Supprimer"
              className="text-muted-foreground/60 transition-colors hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
            </button>
          }
        />
      )}
    </li>
  )
}

/** Édition inline d'un malus (montant + note) — accessible à tout accès `police`. */
function MalusEdit({ e }: { e: PoliceEntry }) {
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
      return
    }
    setOpen(false)
  })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) reset({ amount: String(e.amountEur), note: e.note ?? '' })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Modifier le malus"
          className="text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <form onSubmit={save} className="flex flex-col gap-2">
          <span className="text-xs font-medium">Modifier le malus — {e.chatterName}</span>
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
