'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ModuleFormValues, ModuleInput } from '../schema'

/**
 * Axes du barème (`useFieldArray` sur `axes`) : clé technique (ce que l'IA renvoie), nom (ce que
 * le chatter lit), description (la question posée à l'IA). Aucun minimum : le Boss final n'a pas
 * d'axe (noté par étape). Supprimer un axe est autorisé (les sessions futures garderont leur
 * instantané). `existingId` (null = nouvel axe, diff côté action) voyage dans les valeurs RHF sans
 * input DOM — pas de champ `id` : `useFieldArray` réserve cette clé pour sa propre `key`.
 */
export function ModuleFormAxes({
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
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'axes' })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Axes de notation</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ existingId: null, key: '', name: '', description: '' })}>
          <Plus className="size-4" /> Ajouter un axe
        </Button>
      </div>
      <FieldError message={errors.axes?.message ?? errors.axes?.root?.message} />
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun axe — le module ne sera pas notable par axe.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`axe-${i}-key`} className="text-xs">Clé</Label>
                  <Input id={`axe-${i}-key`} placeholder="naturel" disabled={disabled} aria-invalid={!!errors.axes?.[i]?.key} {...register(`axes.${i}.key`)} />
                  <FieldError message={errors.axes?.[i]?.key?.message} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`axe-${i}-name`} className="text-xs">Nom affiché</Label>
                  <Input id={`axe-${i}-name`} placeholder="Naturel / fluidité" disabled={disabled} aria-invalid={!!errors.axes?.[i]?.name} {...register(`axes.${i}.name`)} />
                  <FieldError message={errors.axes?.[i]?.name?.message} />
                </div>
                <div className="flex items-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Supprimer l’axe" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`axe-${i}-desc`} className="text-xs">Description (la question posée à l’IA)</Label>
                <Textarea id={`axe-${i}-desc`} rows={2} disabled={disabled} aria-invalid={!!errors.axes?.[i]?.description} {...register(`axes.${i}.description`)} />
                <FieldError message={errors.axes?.[i]?.description?.message} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
