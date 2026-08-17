'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ModuleFormValues, ModuleInput } from '../schema'
import { FieldError } from './field-error'

/**
 * Sections du module (`useFieldArray` sur `sections`) — un regroupement des cas (GLA
 * sous_categories), pas un niveau de navigation. `existingId` (null = nouvelle section, son
 * `code` est généré du titre côté action) voyage dans les valeurs RHF sans input DOM. Supprimer une section ne supprime pas ses cas : ils
 * redeviennent « sans section » (FK on delete set null).
 */
export function ModuleFormSections({
  control,
  register,
  errors,
  disabled,
}: {
  control: Control<ModuleFormValues, unknown, ModuleInput>
  register: UseFormRegister<ModuleFormValues>
  errors: FieldErrors<ModuleFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'sections' })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Sections</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ existingId: null, title: '', emoji: '', description: '' })}>
          <Plus className="size-4" /> Ajouter une section
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Regroupent les cas dans la page du module. Supprimer une section ne supprime pas ses cas : ils redeviennent « sans section ».
      </p>
      <FieldError message={errors.sections?.message ?? errors.sections?.root?.message} />
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune section — les cas sont listés à plat.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[3rem_1fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`sec-${i}-emoji`} className="text-xs">Emoji</Label>
                  <Input id={`sec-${i}-emoji`} placeholder="📇" disabled={disabled} aria-invalid={!!errors.sections?.[i]?.emoji} {...register(`sections.${i}.emoji`)} />
                  <FieldError message={errors.sections?.[i]?.emoji?.message} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`sec-${i}-title`} className="text-xs">Titre</Label>
                  <Input id={`sec-${i}-title`} placeholder="Extraction d’info (KYC)" disabled={disabled} aria-invalid={!!errors.sections?.[i]?.title} {...register(`sections.${i}.title`)} />
                  <FieldError message={errors.sections?.[i]?.title?.message} />
                </div>
                <div className="flex items-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Supprimer la section" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`sec-${i}-desc`} className="text-xs">Description (une phrase)</Label>
                <Textarea id={`sec-${i}-desc`} rows={2} disabled={disabled} {...register(`sections.${i}.description`)} />
                <FieldError message={errors.sections?.[i]?.description?.message} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
