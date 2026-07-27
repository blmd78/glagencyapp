'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { frDateNumeric } from '@glagency/core'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ActionButton } from '@/components/action-button'
import { eur2 } from '@/lib/format'
import { saveComptaSettings, savePrime } from '../actions'
import {
  settingsInput,
  primeInput,
  type SettingsInput,
  type SettingsFormValues,
  type PrimeInput,
  type PrimeFormValues,
} from '../schema'
import type { ComptaRow } from '../types'

/**
 * Réglages de rémunération d'un membre — ADMIN seul (`canConfigure`). Sans cet écran, la
 * colonne gardait ses défauts pour tout le monde : 10 % en `percent`, `is_setter` faux (donc le
 * champ « Fixe setter » de la saisie hebdo jamais monté) et le mode `fixed` inatteignable.
 *
 * Même patron que `compta-entry-form.tsx` : `'use no memo'` (le React Compiler casse
 * `formState`), `zodResolver`, et le triple générique `useForm<Input, unknown, Output>` — les
 * champs `z.coerce.number()` ont un type d'ENTRÉE `unknown`, donc input ≠ output.
 */
export function ComptaSettingsForm({ row }: { row: ComptaRow }) {
  'use no memo'

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues, unknown, SettingsInput>({
    resolver: zodResolver(settingsInput),
    defaultValues: {
      chatterId: row.id,
      mode: row.mode,
      rate: row.rate,
      fixedAmount: row.fixedAmount,
      isSetter: row.isSetter,
    },
  })

  // Le champ `rate` n'a de sens qu'en `percent`, `fixedAmount` qu'en `fixed` : on masque celui
  // qui ne s'applique pas plutôt que d'afficher un champ inerte. RHF conserve la valeur d'un
  // champ démonté (`shouldUnregister` vaut false par défaut), donc le schéma reste satisfait.
  const mode = useWatch({ control, name: 'mode' })

  const submit = handleSubmit(async (values) => {
    const res = await saveComptaSettings(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Réglages enregistrés')
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Réglages de paie
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`mode-${row.id}`}>Mode</Label>
          {/* Un Select Radix dans RHF passe par Controller, jamais register
              (docs/guidelines-standard-feature.md §5, « Pièges »). */}
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger id={`mode-${row.id}`} aria-label="Mode de rémunération">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">% du CA</SelectItem>
                  <SelectItem value="fixed">Fixe hebdo</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {mode === 'percent' ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`rate-${row.id}`}>Taux %</Label>
            <Input id={`rate-${row.id}`} type="number" step="0.01" {...register('rate')} />
            {errors.rate && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.rate.message}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor={`fixed-${row.id}`}>Fixe hebdo €</Label>
            <Input id={`fixed-${row.id}`} type="number" step="0.01" {...register('fixedAmount')} />
            {errors.fixedAmount && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.fixedAmount.message}</p>
            )}
          </div>
        )}

        <Controller
          control={control}
          name="isSetter"
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2 self-end rounded-md border px-2.5 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5">
              <Checkbox
                checked={field.value}
                // `onCheckedChange` peut valoir `'indeterminate'` : comparer à `true` garde un
                // booléen strict, que `z.boolean()` exige.
                onCheckedChange={(c) => field.onChange(c === true)}
                disabled={isSubmitting}
              />
              <span>Setter</span>
            </label>
          )}
        />
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

/**
 * Prime « nouveau chatteur » — ADMIN seul. La spec §2 la veut MANUELLE : rien ne la déclenche,
 * l'admin la crée quand il l'a décidée. Elle s'ajoute ensuite à la fiche de toute quinzaine
 * échue tant qu'elle n'a pas été versée (spec §4).
 *
 * Une prime déjà versée n'est plus éditable : `status`/`paid_at` sont la trace du virement, et
 * `payFortnight` les a posés. `savePrime` refuse aussi ce cas côté serveur.
 */
export function ComptaPrimeForm({ row }: { row: ComptaRow }) {
  if (row.prime?.status === 'paid') {
    return (
      <p className="rounded-md border p-3 text-xs text-muted-foreground">
        Prime nouveau chatteur — {eur2(row.prime.amount)} déjà versée
        {row.prime.paidAt ? ` le ${frDateNumeric(row.prime.paidAt)}` : ''}.
      </p>
    )
  }
  return <PrimeEditor row={row} />
}

/** Séparé de `ComptaPrimeForm` pour que ses hooks soient appelés sans condition. */
function PrimeEditor({ row }: { row: ComptaRow }) {
  'use no memo'

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PrimeFormValues, unknown, PrimeInput>({
    resolver: zodResolver(primeInput),
    defaultValues: {
      chatterId: row.id,
      // 100 € = le défaut de la colonne `compta_primes.amount`, repris ici pour que le montant
      // usuel n'ait pas à être ressaisi à chaque création.
      amount: row.prime?.amount ?? 100,
      status: row.prime?.status === 'skipped' ? 'skipped' : 'due',
    },
  })

  const submit = handleSubmit(async (values) => {
    const res = await savePrime(values)
    if (!res.success) {
      setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Prime enregistrée')
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Prime nouveau chatteur
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`prime-amount-${row.id}`}>Montant €</Label>
          <Input
            id={`prime-amount-${row.id}`}
            type="number"
            step="0.01"
            {...register('amount')}
          />
          {errors.amount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`prime-status-${row.id}`}>Statut</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger id={`prime-status-${row.id}`} aria-label="Statut de la prime">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">À verser</SelectItem>
                  <SelectItem value="skipped">Renoncée</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
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
