'use client'

import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CaseFormValues, CaseInput } from '../schema'
import { FieldError } from './field-error'

/**
 * Partie DÉFI SIMULTANÉ : délai de réponse max + exactement 5 conversations (chacune rejoue un
 * cas SOLO du module sous un autre prénom). Les 5 lignes sont toujours affichées (le parent
 * garantit `slots.length === 5` au passage en défi).
 */
export function CaseFormArena({
  control,
  register,
  errors,
  disabled,
  soloOptions,
}: {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
  /** Cas solo du module (value = id, label = titre). */
  soloOptions: ComboOption[]
}) {
  'use no memo'
  const { fields } = useFieldArray({ control, name: 'slots' })
  return (
    <>
      <fieldset className="grid gap-1.5 sm:max-w-xs">
        <legend className="text-sm font-medium">Chrono</legend>
        <Label htmlFor="case-reaction">Délai de réponse max (secondes)</Label>
        <Input id="case-reaction" type="number" min={10} max={600} disabled={disabled} aria-invalid={!!errors.reactionMaxS} {...register('reactionMaxS')} />
        <p className="text-xs text-muted-foreground">Au-delà, la conversation est perdue (GLA : 120 s).</p>
        <FieldError message={errors.reactionMaxS?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Les 5 conversations</legend>
        <FieldError message={errors.slots?.message ?? errors.slots?.root?.message} />
        <ul className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <li key={f.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[2rem_1fr_10rem]">
              <span className="pt-2 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
              <div className="grid gap-1">
                <Controller
                  name={`slots.${i}.refCaseId`}
                  control={control}
                  render={({ field }) => (
                    <Combobox
                      options={soloOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Cas solo rejoué…"
                      searchPlaceholder="Rechercher un cas…"
                      disabled={disabled}
                      aria-invalid={!!errors.slots?.[i]?.refCaseId}
                    />
                  )}
                />
                <FieldError message={errors.slots?.[i]?.refCaseId?.message} />
              </div>
              <div className="grid gap-1">
                <Input placeholder="Prénom affiché" aria-label={`Prénom affiché de la conversation ${i + 1}`} disabled={disabled} aria-invalid={!!errors.slots?.[i]?.displayName} {...register(`slots.${i}.displayName`)} />
                <FieldError message={errors.slots?.[i]?.displayName?.message} />
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  )
}
