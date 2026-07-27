'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionButton } from '@/components/action-button'
import { saveWeekEntry } from '../actions'
import { weekEntryInput, type WeekEntryInput, type WeekEntryFormValues } from '../schema'

/**
 * Saisie hebdomadaire (bonus, malus, handoffs, fixe setter). Une semaine appartient
 * entièrement à la quinzaine de son lundi — elle n'est jamais découpée.
 */
export function ComptaEntryForm({
  chatterId,
  weekStart,
  weekLabel,
  initial,
  isSetter,
  onSaved,
}: {
  chatterId: string
  weekStart: string
  weekLabel: string
  initial: { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  isSetter: boolean
  onSaved?: () => void
}) {
  'use no memo'

  // Triple générique (Input, Context, Output) : `weekEntryInput` a des champs `z.coerce.number()`
  // dont l'input est `unknown` → input ≠ output. Même patron que `report-form.tsx`
  // (police-reports) pour la même raison.
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WeekEntryFormValues, unknown, WeekEntryInput>({
    resolver: zodResolver(weekEntryInput),
    defaultValues: { chatterId, weekStart, ...initial },
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveWeekEntry(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Saisie enregistrée')
    onSaved?.()
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Semaine du {weekLabel}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`bonus-${weekStart}`}>Bonus €</Label>
          <Input id={`bonus-${weekStart}`} type="number" step="0.01" {...register('bonus')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`malus-${weekStart}`}>Malus €</Label>
          <Input id={`malus-${weekStart}`} type="number" step="0.01" {...register('malus')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`handoffs-${weekStart}`}>Handoffs</Label>
          <Input id={`handoffs-${weekStart}`} type="number" {...register('handoffs')} />
        </div>
        {isSetter && (
          <div className="grid gap-1.5">
            <Label htmlFor={`fixe-${weekStart}`}>Fixe setter €</Label>
            <Input id={`fixe-${weekStart}`} type="number" step="0.01" {...register('fixeSetter')} />
          </div>
        )}
      </div>
      {errors.root?.serverError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.serverError.message}
        </p>
      )}
      <ActionButton type="submit" pending={isSubmitting} className="self-end">
        Enregistrer
      </ActionButton>
    </form>
  )
}
