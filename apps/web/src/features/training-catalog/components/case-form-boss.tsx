'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CaseFormValues, CaseInput } from '../schema'
import { FieldError } from './field-error'

export const emptyFan = (): CaseFormValues['fans'][number] => ({
  name: '', age: '', job: '', city: '', color: '', persona: '', openingMessage: '',
  budgetCap: '', negoThreshold: '', negoWhere: '', meetWhen: '', meetWhere: '', derails: '',
})

/**
 * Partie BOSS FINAL : chrono + 1 à 5 fans riches. Par fan : bloc VISIBLE (prénom, âge, métier,
 * ville, couleur d'onglet, caractère), son message d'ouverture, puis le bloc CACHÉ (plafond de
 * dépense, palier/mode de négo, moment/formulation de la demande de rencontre, déraillements) —
 * un texte d'aide rappelle qu'il pilote l'IA et n'est jamais montré.
 */
export function CaseFormBoss({
  control,
  register,
  errors,
  disabled,
}: {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove } = useFieldArray({ control, name: 'fans' })
  const err = (i: number, k: keyof ReturnType<typeof emptyFan>) => errors.fans?.[i]?.[k]?.message as string | undefined
  return (
    <>
      <fieldset className="grid gap-1.5 sm:max-w-xs">
        <legend className="text-sm font-medium">Chrono</legend>
        <Label htmlFor="case-reaction">Délai de réponse max (secondes)</Label>
        <Input id="case-reaction" type="number" min={10} max={600} disabled={disabled} aria-invalid={!!errors.reactionMaxS} {...register('reactionMaxS')} />
        <FieldError message={errors.reactionMaxS?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Les fans ({fields.length}/5)</legend>
          <Button type="button" variant="outline" size="sm" disabled={disabled || fields.length >= 5} onClick={() => append(emptyFan())}>
            <Plus className="size-4" /> Ajouter un fan
          </Button>
        </div>
        <FieldError message={errors.fans?.message ?? errors.fans?.root?.message} />
        <ul className="flex flex-col gap-4">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Fan {i + 1}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Retirer ce fan" disabled={disabled || fields.length <= 1} onClick={() => remove(i)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Visible du chatter</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="grid gap-1"><Label className="text-xs">Prénom</Label><Input disabled={disabled} aria-invalid={!!err(i, 'name')} {...register(`fans.${i}.name`)} /><FieldError message={err(i, 'name')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Âge</Label><Input type="number" min={18} max={99} disabled={disabled} {...register(`fans.${i}.age`)} /><FieldError message={err(i, 'age')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Métier</Label><Input disabled={disabled} {...register(`fans.${i}.job`)} /><FieldError message={err(i, 'job')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Ville</Label><Input disabled={disabled} {...register(`fans.${i}.city`)} /><FieldError message={err(i, 'city')} /></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <div className="grid gap-1"><Label className="text-xs">Couleur d’onglet</Label><Input placeholder="#ff6b9d" disabled={disabled} {...register(`fans.${i}.color`)} /><FieldError message={err(i, 'color')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Caractère (une phrase)</Label><Input disabled={disabled} aria-invalid={!!err(i, 'persona')} {...register(`fans.${i}.persona`)} /><FieldError message={err(i, 'persona')} /></div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Son premier message</Label>
                <Textarea rows={2} disabled={disabled} aria-invalid={!!err(i, 'openingMessage')} {...register(`fans.${i}.openingMessage`)} />
                <FieldError message={err(i, 'openingMessage')} />
              </div>
              <p className="text-xs text-muted-foreground">Caché — pilote l’IA, jamais montré au chatter</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1"><Label className="text-xs">Plafond de dépense (€)</Label><Input type="number" min={0} disabled={disabled} {...register(`fans.${i}.budgetCap`)} /><FieldError message={err(i, 'budgetCap')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Palier où il négocie (€)</Label><Input type="number" min={0} disabled={disabled} {...register(`fans.${i}.negoThreshold`)} /><FieldError message={err(i, 'negoThreshold')} /></div>
              </div>
              <div className="grid gap-1"><Label className="text-xs">Comment / quand il négocie</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.negoWhere`)} /><FieldError message={err(i, 'negoWhere')} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1"><Label className="text-xs">Moment de la demande de rencontre</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.meetWhen`)} /><FieldError message={err(i, 'meetWhen')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Formulation de la demande</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.meetWhere`)} /><FieldError message={err(i, 'meetWhere')} /></div>
              </div>
              <div className="grid gap-1"><Label className="text-xs">Ses déraillements</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.derails`)} /><FieldError message={err(i, 'derails')} /></div>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  )
}
