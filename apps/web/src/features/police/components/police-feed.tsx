'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { frDayShort, frTimeShort } from '@glagency/core'
import { toast } from 'sonner'
import { Trash2, TriangleAlert, Gavel, Pencil, X } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur2max as eur } from '@/lib/format'
import { deletePoliceEntry, updatePoliceMalus } from '../actions'
import { malusEditFormSchema, type MalusEditForm } from '../schema'
import type { PoliceData, PoliceEntry } from '../types'

interface Group {
  chatterId: string
  chatterName: string
  entries: PoliceEntry[]
  warnCount: number
  malusTotal: number
}

/** Journal de la période (jour OU mois selon `data.vue`) GROUPÉ par chatteur (blocs triés par
 *  activité récente) + KPIs. En mois : cumul des sanctions du mois par chatteur. */
export function PoliceFeed({
  data,
  isAdmin,
  canWrite,
  filterChatterId,
  onClearFilter,
}: {
  data: PoliceData
  isAdmin: boolean
  canWrite: boolean
  filterChatterId?: string
  onClearFilter?: () => void
}) {
  const remove = async (id: string) => {
    const res = await deletePoliceEntry({ id })
    if (!res.success) {
      toast.error(res.error)
      return res.error
    }
    toast.success('Entrée supprimée')
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

  // Libellés selon le mode : mois = cumul du mois par chatteur, jour = journal du jour.
  const isMonth = data.vue === 'mois'
  const periodNoun = isMonth ? 'ce mois' : 'ce jour'

  return (
    <div className="flex flex-col gap-4">
      {/* Titre de section + pastille de filtre — HORS cadre (zéro filet, signature DA de l'app). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {isMonth ? 'Historique du mois' : 'Historique du jour'}
        </h2>
        {filterName && onClearFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilter}
            className="gap-1 text-muted-foreground"
          >
            filtré : {filterName}
            <X className="size-3" />
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filterName ? `Aucune entrée pour ${filterName} ${periodNoun}.` : `Aucune entrée ${periodNoun}.`}
        </p>
      ) : (
        // Cartes empilées : une carte par chatteur, hiérarchie par gap + typo (aucun filet interne).
        <div className="flex flex-col gap-4">
          {shown.map((g) => (
            <article key={g.chatterId} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  <span className="text-muted-foreground">Chatteur</span>{' '}
                  <span className="font-medium">{g.chatterName}</span>
                </span>
                {g.warnCount > 0 && (
                  <Badge className={STATUS_COLORS.warning}>{g.warnCount} avert.</Badge>
                )}
                {g.malusTotal > 0 && (
                  <Badge className={STATUS_COLORS.danger}>malus {eur(g.malusTotal)}</Badge>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {g.entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    e={e}
                    isMonth={isMonth}
                    isAdmin={isAdmin}
                    canWrite={canWrite}
                    onRemove={() => remove(e.id)}
                  />
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function EntryRow({
  e,
  isMonth,
  isAdmin,
  canWrite,
  onRemove,
}: {
  e: PoliceEntry
  /** Mode mois : on préfixe la méta par la date du jour de faute (sinon on ne distingue pas les jours). */
  isMonth: boolean
  isAdmin: boolean
  canWrite: boolean
  onRemove: () => void | string | Promise<void | string>
}) {
  const isMalus = e.kind === 'malus'
  return (
    <li className="flex items-center gap-2 text-sm">
      <Badge className={STATUS_COLORS[isMalus ? 'danger' : 'warning']}>
        {isMalus ? <Gavel className="size-3" /> : <TriangleAlert className="size-3" />}
        {isMalus ? eur(e.amountEur) : 'Avert.'}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {isMalus
          ? [e.errorLabel, e.note].filter(Boolean).join(' · ') || '—'
          : (e.errorLabel ?? '')}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {/* En mois : date courte du jour de faute en tête (« 12/07 · … ») — en jour, on ne montre que l'heure. */}
        {isMonth ? `${frDayShort(e.occurredOn)} · ` : ''}
        {e.shift ? `${e.shift} · ` : ''}
        {e.controllerName} · {frTimeShort(e.createdAt)}
      </span>
      {/* Édition inline du malus : accès `police` en ÉCRITURE (admin/manager) — masquée pour un chatteur. */}
      {isMalus && canWrite && <MalusEdit e={e} />}
      {isAdmin && (
        <ConfirmDialog
          onConfirm={onRemove}
          title="Supprimer cette entrée ?"
          description={`Supprimer définitivement ${isMalus ? 'ce malus' : "cet avertissement"} de ${e.chatterName} ? Cette action est irréversible.`}
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
      )}
    </li>
  )
}

/** Édition inline d'un malus (montant + note) — accès `police` en ÉCRITURE (admin/manager ;
 *  gaté par `canWrite` chez l'appelant, un chatteur est en lecture seule). */
function MalusEdit({ e }: { e: PoliceEntry }) {
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
