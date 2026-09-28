'use client'

import { useState, type ReactNode } from 'react'
import { Controller, useController, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { todayParis } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { callAction } from '@/lib/actions-client'
import { deleteEvent, saveEvent } from '../actions'
import type { AgencyEvent } from '../month-layout'
import { AGENCY_ROLES, AGENCY_ROLE_LABELS, eventInput, type AgencyRole, type EventInput } from '../schema'
import { DateField } from './date-field.client'

const blank = (): EventInput => {
  const d = todayParis()
  return { title: '', mode: 'jour', startDate: d, endDate: d, remindOnDay: false, audience: [...AGENCY_ROLES] }
}
const fromEvent = (e: AgencyEvent): EventInput => ({
  id: e.id,
  title: e.title,
  mode: e.startDate === e.endDate ? 'jour' : 'periode',
  startDate: e.startDate,
  endDate: e.endDate,
  remindOnDay: e.remindOnDay,
  audience: e.audience,
})
const errorCls = 'text-xs text-red-600 dark:text-red-400'

/**
 * Ajouter (sans `event`) ou modifier un événement — ADMIN seul, `adminGuard` côté serveur.
 * `'use no memo'` : le React Compiler casse `formState` de RHF (cf. `compta-link-dialog.tsx`).
 */
export function EventDialog({ event, trigger }: { event?: AgencyEvent; trigger?: ReactNode }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventInput>({ resolver: zodResolver(eventInput), defaultValues: event ? fromEvent(event) : blank() })
  const mode = useWatch({ control, name: 'mode' })
  const { field: start } = useController({ control, name: 'startDate' })
  const { field: end } = useController({ control, name: 'endDate' })

  const submit = handleSubmit(async (values) => {
    const res = await callAction(saveEvent(values))
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(event ? 'Événement modifié' : 'Événement publié')
    setOpen(false)
  })

  const remove = async () => {
    if (!event) return
    const res = await callAction(deleteEvent({ id: event.id }))
    if (!res.success) return res.error
    toast.success('Événement supprimé')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Réouverture = données fraîches, jamais le brouillon ou l'erreur d'avant.
        if (o) reset(event ? fromEvent(event) : blank())
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Ajouter un événement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? 'Modifier l’événement' : 'Nouvel événement'}</DialogTitle>
          <DialogDescription>
            {event
              ? 'Une modification ne renotifie personne.'
              : 'Les rôles choisis le voient dans Agence et sont notifiés dans la cloche.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="agency-title">Nom</Label>
            <Input id="agency-title" maxLength={120} aria-invalid={!!errors.title} {...register('title')} />
            {errors.title && <p className={errorCls}>{errors.title.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <ToggleGroupItem value="jour">Jour</ToggleGroupItem>
                  <ToggleGroupItem value="periode">Période</ToggleGroupItem>
                </ToggleGroup>
              )}
            />
            <DateField
              mode={mode}
              start={start.value}
              end={end.value}
              onChange={(s, e) => {
                start.onChange(s)
                end.onChange(e)
              }}
            />
            {errors.endDate && <p className={errorCls}>{errors.endDate.message}</p>}
          </div>

          <Controller
            control={control}
            name="remindOnDay"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Rappeler le jour J
              </label>
            )}
          />

          <div className="grid gap-1.5">
            <Label>Visible par</Label>
            <Controller
              control={control}
              name="audience"
              render={({ field }) => (
                <ComboboxMultiple
                  trigger={
                    <Button type="button" variant="outline" className="h-auto min-h-9 justify-start font-normal">
                      {field.value.length === AGENCY_ROLES.length
                        ? 'Tout le monde'
                        : field.value.map((r) => AGENCY_ROLE_LABELS[r]).join(', ') || 'Choisir…'}
                    </Button>
                  }
                  options={AGENCY_ROLES.map((r) => ({ value: r, label: AGENCY_ROLE_LABELS[r] }))}
                  value={field.value}
                  onChange={(next) => field.onChange(next as AgencyRole[])}
                  placeholder="Rechercher un rôle…"
                />
              )}
            />
            {errors.audience && <p className={errorCls}>{errors.audience.message}</p>}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.message}
            </p>
          )}

          <DialogFooter className="gap-2">
            {event && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="mr-auto text-red-600">
                    <Trash2 className="size-4" />
                    Supprimer
                  </Button>
                }
                title="Supprimer cet événement ?"
                description="Il disparaît du calendrier et de la cloche de tout le monde."
                onConfirm={remove}
              />
            )}
            <ActionButton type="submit" pending={isSubmitting}>
              {event ? 'Enregistrer' : 'Publier'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
