'use client'

// Section « Contenu » du dialog de bloc — extraite de `block-dialog.tsx` (règle « > 300 lignes
// → split par responsabilité ») : bascule tâche simple / sous-tâches, puces plates et éditeur
// de catégories (`useFieldArray` sur le MÊME `control` que le form parent). Comportement
// identique ; le parent garde l'état `mode` (son submit en dépend) et la resynchronisation à
// l'ouverture.

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { BlockForm } from '../schema'

export type Mode = 'simple' | 'cat'

export function BlockContentFields({
  control,
  register,
  errors,
  isSubmitting,
  mode,
  onModeChange,
}: {
  control: Control<BlockForm>
  register: UseFormRegister<BlockForm>
  errors: FieldErrors<BlockForm>
  isSubmitting: boolean
  mode: Mode
  onModeChange: (m: Mode) => void
}) {
  // Même règle que le parent : composant qui manipule les API react-hook-form.
  'use no memo'
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'categories' })

  const switchMode = (m: Mode) => {
    onModeChange(m)
    // On garde les données du mode actif cohérentes : vide de catégories en mode simple,
    // au moins une catégorie en mode sous-tâches (le sous-titre est obligatoire).
    if (m === 'simple') replace([])
    else if (fields.length === 0) replace([{ subtitle: '', badge: '', bulletsText: '' }])
  }

  return (
    <div className="grid gap-2">
      <Label>Contenu</Label>
      <div className="inline-flex w-fit rounded-md border p-0.5 text-sm">
        {(
          [
            ['simple', 'Tâche simple'],
            ['cat', 'Sous-tâches'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            disabled={isSubmitting}
            onClick={() => switchMode(m)}
            className={cn(
              'rounded px-3 py-1 font-medium transition-colors',
              mode === m ? 'bg-foreground text-background' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'simple' ? (
        <div className="grid gap-1.5">
          <Textarea
            rows={4}
            placeholder={'Une puce par ligne'}
            disabled={isSubmitting}
            {...register('bulletsText')}
          />
          <p className="text-xs text-muted-foreground">
            Une puce par ligne. Le texte avant « : » s’affiche en gras.
          </p>
          {errors.bulletsText && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.bulletsText.message}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Sous-tâche {i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-red-600 hover:text-red-700"
                  disabled={isSubmitting || fields.length <= 1}
                  onClick={() => remove(i)}
                  aria-label="Retirer la sous-tâche"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Sous-titre (ex. COMPTABILITÉ)"
                  disabled={isSubmitting}
                  {...register(`categories.${i}.subtitle`)}
                />
                <Input
                  placeholder="Badge (ex. obligatoire)"
                  disabled={isSubmitting}
                  {...register(`categories.${i}.badge`)}
                />
              </div>
              {errors.categories?.[i]?.subtitle && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.categories[i]?.subtitle?.message}
                </p>
              )}
              <Textarea
                rows={3}
                placeholder={'Une puce par ligne'}
                disabled={isSubmitting}
                {...register(`categories.${i}.bulletsText`)}
              />
              {errors.categories?.[i]?.bulletsText && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.categories[i]?.bulletsText?.message}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={isSubmitting || fields.length >= 6}
            onClick={() => append({ subtitle: '', badge: '', bulletsText: '' })}
          >
            <Plus className="size-3.5" /> Ajouter une sous-tâche
          </Button>
        </div>
      )}
    </div>
  )
}
