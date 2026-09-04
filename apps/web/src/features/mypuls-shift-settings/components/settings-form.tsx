'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { frDateTimeParis } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { FieldError } from '@/components/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveShiftSettings } from '../actions'
import { shiftSettingsForm, type ShiftSettingsFormValues, type ShiftSettingsInput } from '../schema'
import type { ShiftSettings } from '../types'

const toForm = (s: ShiftSettings): ShiftSettingsFormValues => ({
  idleMinutes: String(s.idleMinutes),
  breakMinutes: String(s.breakMinutes),
  coverageThreshold: String(s.coverageThreshold),
})

/**
 * Les trois réglages de mesure. Admin seulement — le formulaire n'est même pas rendu aux
 * autres, qui lisent les valeurs (`SettingsReadOnly`).
 *
 * `'use no memo'` obligatoire : le React Compiler casse le `formState` de RHF (règle projet).
 */
export function SettingsForm({ settings }: { settings: ShiftSettings }) {
  'use no memo'
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ShiftSettingsFormValues, unknown, ShiftSettingsInput>({
    resolver: zodResolver(shiftSettingsForm),
    defaultValues: toForm(settings),
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveShiftSettings(values)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Réglages enregistrés — ils s’appliqueront au prochain relevé')
    reset(toForm({ ...settings, ...values }))
  })

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="idleMinutes">Pause détectée après (min)</Label>
          <Input
            id="idleMinutes"
            type="number"
            min={1}
            max={30}
            disabled={isSubmitting}
            aria-invalid={!!errors.idleMinutes}
            {...register('idleMinutes')}
          />
          <p className="text-xs text-muted-foreground">
            LE paramètre qui décide du temps mesuré. Mesuré chez nous : le passer de 3 à 10
            ajoute 115 minutes médianes par chatteur et par jour (maximum relevé : +402).
          </p>
          <FieldError message={errors.idleMinutes?.message} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="breakMinutes">Regroupement en vacations (min)</Label>
          <Input
            id="breakMinutes"
            type="number"
            min={1}
            max={480}
            disabled={isSubmitting}
            aria-invalid={!!errors.breakMinutes}
            {...register('breakMinutes')}
          />
          <p className="text-xs text-muted-foreground">
            Trou au-delà duquel deux segments comptent pour deux vacations. Affichage
            uniquement : vérifié sur 137 chatteurs, il ne déplace aucun temps mesuré.
          </p>
          <FieldError message={errors.breakMinutes?.message} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="coverageThreshold">Poste tenu à partir de (%)</Label>
          <Input
            id="coverageThreshold"
            type="number"
            min={1}
            max={100}
            disabled={isSubmitting}
            aria-invalid={!!errors.coverageThreshold}
            {...register('coverageThreshold')}
          />
          <p className="text-xs text-muted-foreground">
            Couverture du créneau en dessous de laquelle le relevé propose un signalement. 80 %
            est la valeur qu’affiche MyPuls.
          </p>
          <FieldError message={errors.coverageThreshold?.message} />
        </div>
      </div>

      <p className="text-sm text-amber-700 dark:text-amber-400">
        Ces valeurs alimentent des signalements, donc des retenues sur paie. Elles ne sont pas
        rétroactives : les relevés déjà enregistrés gardent celles qui ont servi. Pour rejouer
        l’historique, il faut relancer le rattrapage.
      </p>

      <div className="flex items-center gap-3">
        <ActionButton type="submit" pending={isSubmitting} disabled={!isDirty}>
          Enregistrer
        </ActionButton>
        <span className="text-xs text-muted-foreground">
          Dernière modification {frDateTimeParis(settings.updatedAt)}
        </span>
      </div>
      <FieldError message={errors.root?.message} />
    </form>
  )
}

/** Les mêmes valeurs, en lecture — pour qui a la page sans être admin. */
export function SettingsReadOnly({ settings }: { settings: ShiftSettings }) {
  const rows = [
    ['Pause détectée après', `${settings.idleMinutes} min`],
    ['Regroupement en vacations', `${settings.breakMinutes} min`],
    ['Poste tenu à partir de', `${settings.coverageThreshold} %`],
  ]
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
