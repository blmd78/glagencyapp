'use client'

import {
  Controller,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import type { ReportInput, ReportFormValues } from '../schema'

/**
 * Éditeur des lignes chatteur : `useFieldArray` sur `lines`, une ligne = une CARTE par chatteur
 * (Combobox chatteur du modèle sélectionné + deux notes « 👍 a marché » / « 🔧 à régler »). Tant
 * qu'aucun modèle n'est choisi, l'ajout est désactivé (pas de carte orpheline). Le
 * `control`/`register`/`errors` du formulaire parent sont transmis (un seul `useForm`, schéma
 * partagé).
 */
export function ReportLinesEditor({
  control,
  register,
  errors,
  chatterOptions,
  modelSelected,
  disabled,
}: {
  control: Control<ReportFormValues, unknown, ReportInput>
  register: UseFormRegister<ReportFormValues>
  errors: FieldErrors<ReportFormValues>
  chatterOptions: ComboOption[]
  /** Un modèle est-il sélectionné ? (sinon pas de chatteurs proposables). */
  modelSelected: boolean
  disabled?: boolean
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Suivi par chatteur</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || !modelSelected}
          onClick={() => append({ chatterId: '', aMarche: '', aRegler: '' })}
        >
          <Plus className="size-4" />
          Ajouter un chatteur
        </Button>
      </div>

      {!modelSelected ? (
        <p className="text-sm text-muted-foreground">Choisis d’abord un modèle.</p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun chatteur suivi pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((f, index) => (
            // Une carte par chatteur : bordure fonctionnelle, en-tête (chatteur + retirer) puis
            // les deux notes empilées, chacune pleine largeur de la carte.
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
              {/* En-tête de carte : Combobox chatteur à gauche, corbeille à droite */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Controller
                    control={control}
                    name={`lines.${index}.chatterId`}
                    render={({ field }) => (
                      <Combobox
                        options={chatterOptions}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Choisir un chatteur…"
                        searchPlaceholder="Rechercher un chatteur…"
                        disabled={disabled}
                      />
                    )}
                  />
                  {errors.lines?.[index]?.chatterId && (
                    <p className="text-sm text-destructive">
                      {errors.lines[index]?.chatterId?.message}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground"
                  aria-label="Retirer ce chatteur"
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {/* Deux notes : ce qui a marché / ce qu'il reste à régler */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`lines-${index}-a-marche`}>👍 A marché</Label>
                  <Textarea
                    id={`lines-${index}-a-marche`}
                    rows={2}
                    placeholder="Ce qui a marché pour ce chatteur…"
                    disabled={disabled}
                    {...register(`lines.${index}.aMarche`)}
                  />
                  {errors.lines?.[index]?.aMarche && (
                    <p className="text-sm text-destructive">
                      {errors.lines[index]?.aMarche?.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`lines-${index}-a-regler`}>🔧 À régler</Label>
                  <Textarea
                    id={`lines-${index}-a-regler`}
                    rows={2}
                    placeholder="Ce qu’il reste à régler…"
                    disabled={disabled}
                    {...register(`lines.${index}.aRegler`)}
                  />
                  {errors.lines?.[index]?.aRegler && (
                    <p className="text-sm text-destructive">
                      {errors.lines[index]?.aRegler?.message}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
