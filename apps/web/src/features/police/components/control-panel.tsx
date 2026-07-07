'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addPoliceWarning, addPoliceMalus } from '../actions'
import { controlFormSchema, type ControlForm } from '../schema'
import { POLICE_ERRORS, SHIFTS, type PoliceData } from '../types'

/**
 * Saisie d'un contrôle (RHF + Zod, schéma partagé avec le serveur). Chatteur + type d'erreur,
 * puis un champ montant : vide → avertissement ; renseigné → malus. Une seule action.
 * La sélection du chatteur filtre l'historique (`onChatterChange`).
 */
export function ControlPanel({
  data,
  onChatterChange,
}: {
  data: PoliceData
  onChatterChange: (id: string) => void
}) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ControlForm>({
    resolver: zodResolver(controlFormSchema),
    defaultValues: { chatterId: '', errorKey: '', shift: '', amount: '', note: '' },
  })

  const chatterId = watch('chatterId')
  const amount = watch('amount')
  const amountEur = amount?.trim() ? Number(amount.replace(',', '.')) : 0
  const isMalus = amountEur > 0
  const recentWarns = chatterId ? (data.warningsByChatter[chatterId] ?? 0) : null

  const onSubmit = handleSubmit(async (values) => {
    const amt = values.amount?.trim() ? Number(values.amount.replace(',', '.')) : 0
    const res =
      amt > 0
        ? await addPoliceMalus({
            day: data.day,
            chatterId: values.chatterId,
            errorKey: values.errorKey,
            amountEur: amt,
            note: values.note?.trim() || undefined,
            shift: values.shift || undefined,
          })
        : await addPoliceWarning({
            day: data.day,
            chatterId: values.chatterId,
            errorKey: values.errorKey,
            shift: values.shift || undefined,
          })
    if (!res.success) {
      setError('root', { message: res.error })
      return
    }
    // On garde le chatteur + shift (saisies rapides), on vide l'erreur/le montant.
    reset({ chatterId: values.chatterId, errorKey: '', shift: values.shift ?? '', amount: '', note: '' })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border p-4">
      {/* Chatteur + shift */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Chatteur contrôlé</label>
          <Controller
            name="chatterId"
            control={control}
            render={({ field }) => (
              <Combobox
                options={data.chatterOptions.map((c) => ({ value: c.id, label: c.name }))}
                value={field.value}
                onChange={(id) => {
                  field.onChange(id)
                  onChatterChange(id)
                }}
                placeholder="Choisir un chatteur…"
                searchPlaceholder="Rechercher un chatteur…"
              />
            )}
          />
          {errors.chatterId && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.chatterId.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Shift</label>
          <Controller
            name="shift"
            control={control}
            render={({ field }) => (
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger className="h-9 w-32 text-sm capitalize">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s} value={s} className="text-sm capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        {recentWarns != null && (
          <p className="pt-6 text-xs">
            {recentWarns > 0 ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {recentWarns} avert. / 30 j
              </span>
            ) : (
              <span className="text-muted-foreground">Aucun avert. récent</span>
            )}
          </p>
        )}
      </div>

      {/* Erreur + montant (à la suite) + action */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Type d’erreur</label>
          <Controller
            name="errorKey"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {POLICE_ERRORS.map((e) => (
                    <SelectItem key={e.key} value={e.key} className="text-sm">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.errorKey && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.errorKey.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Malus € (vide = simple avert.)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            placeholder="—"
            className="h-9 w-32 text-sm"
            {...register('amount')}
          />
          {errors.amount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Motif du malus (optionnel)
          </label>
          <Input
            placeholder="Raison…"
            disabled={!isMalus}
            className="h-9 text-sm"
            {...register('note')}
          />
        </div>
        <ActionButton
          type="submit"
          pending={isSubmitting}
          variant={isMalus ? 'destructive' : 'default'}
          className="mt-5 min-w-40"
        >
          {isMalus ? `Infliger le malus (${amountEur} €)` : 'Ajouter l’avertissement'}
        </ActionButton>
      </div>

      {errors.root && <p className="text-xs text-red-600 dark:text-red-400">{errors.root.message}</p>}
    </form>
  )
}
