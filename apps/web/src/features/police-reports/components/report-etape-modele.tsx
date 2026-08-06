'use client'

// Étape 1 du dialog de saisie (« le modèle ») : choix du modèle + chiffres du soir + alerte.
// Extraite de `report-form.tsx` (règle « > 300 lignes → split », guidelines-standard-feature §1)
// — le form parent garde le stepper, l'étape 2 (chatters) et la soumission. `onModelChange`
// remonte le choix du modèle : c'est le PARENT qui recharge la fiche du soir (reset).

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import type { ReportInput, ReportFormValues } from '../schema'
import type { ReportOption } from '../types'

export function ReportEtapeModele({
  control,
  register,
  errors,
  models,
  disabled,
  onModelChange,
}: {
  control: Control<ReportFormValues, unknown, ReportInput>
  register: UseFormRegister<ReportFormValues>
  errors: FieldErrors<ReportFormValues>
  models: ReportOption[]
  disabled?: boolean
  /** Modèle choisi → le parent recharge la fiche du soir (le reset pose aussi `creatorId`). */
  onModelChange: (creatorId: string) => void
}) {
  // 'use no memo' : formState de RHF est un Proxy à abonnement — mémoïsé par le React
  // Compiler, isSubmitting/errors gèlent (règle projet, mémoire forms-zod-rhf).
  'use no memo'
  return (
    <>
      {/* Modèle (le jour vient de l'en-tête, plus de champ date ici) */}
      <div className="flex flex-col gap-2 sm:w-72">
        <Label>Modèle</Label>
        <Controller
          control={control}
          name="creatorId"
          render={({ field }) => (
            <Combobox
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              value={field.value ?? ''}
              onChange={onModelChange}
              placeholder="Choisir un modèle…"
              searchPlaceholder="Rechercher un modèle…"
              disabled={disabled}
              aria-invalid={!!errors.creatorId}
              aria-describedby={errors.creatorId ? 'creatorId-error' : undefined}
            />
          )}
        />
        {errors.creatorId && (
          <p id="creatorId-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.creatorId.message}
          </p>
        )}
      </div>

      {/* Chiffres du modèle (saisis à la main : 0 = « rien à signaler ») */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-ca">CA du jour</Label>
          <Input
            id="report-ca"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={!!errors.ca}
            aria-describedby={errors.ca ? 'report-ca-error' : undefined}
            {...register('ca')}
          />
          {errors.ca && (
            <p id="report-ca-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.ca.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-non-traitees">Non traitées</Label>
          <Input
            id="report-non-traitees"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={!!errors.nonTraitees}
            aria-describedby={errors.nonTraitees ? 'report-non-traitees-error' : undefined}
            {...register('nonTraitees')}
          />
          {errors.nonTraitees && (
            <p
              id="report-non-traitees-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {errors.nonTraitees.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-absents">Absents</Label>
          <Input
            id="report-absents"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={!!errors.absents}
            aria-describedby={errors.absents ? 'report-absents-error' : undefined}
            {...register('absents')}
          />
          {errors.absents && (
            <p
              id="report-absents-error"
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {errors.absents.message}
            </p>
          )}
        </div>
      </div>

      {/* Alerte du soir (optionnel) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="report-alerte">Alerte (optionnel)</Label>
        <Textarea
          id="report-alerte"
          rows={3}
          placeholder="Un point à remonter sur le modèle ce soir…"
          disabled={disabled}
          aria-invalid={!!errors.alerte}
          aria-describedby={errors.alerte ? 'report-alerte-error' : undefined}
          {...register('alerte')}
        />
        {errors.alerte && (
          <p id="report-alerte-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.alerte.message}
          </p>
        )}
      </div>
    </>
  )
}
