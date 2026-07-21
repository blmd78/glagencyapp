'use client'

import { useMemo } from 'react'
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
import { ThumbsUp, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import type { ReportInput, ReportFormValues } from '../schema'

/**
 * Éditeur des lignes chatteur (`useFieldArray` sur `lines`). Pas de bouton « ajouter » : on choisit
 * un chatteur dans le sélecteur en tête (« Ajouter un chatteur suivi… ») et il s'ajoute aussitôt en
 * carte ; les chatteurs déjà suivis disparaissent du sélecteur (pas de doublon possible). Chaque
 * carte = le nom du chatteur (fixe) + ses deux notes « a marché » / « à régler » CÔTE À CÔTE.
 * Un modèle doit être choisi pour proposer ses chatteurs. `control`/`register`/`errors` viennent du
 * form parent (un seul `useForm`, schéma partagé).
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

  // Nom d'un chatteur depuis son id : le sélecteur renvoie l'id, la carte affiche le nom.
  const nameById = useMemo(
    () => new Map(chatterOptions.map((o) => [o.value, o.label])),
    [chatterOptions],
  )
  // Sélecteur = seulement les chatteurs pas encore suivis (déjà en carte). `fields[i].chatterId`
  // est posé à l'ajout et n'est jamais réédité → fiable pour dédupliquer.
  const used = new Set(fields.map((f) => f.chatterId))
  const available = chatterOptions.filter((o) => !used.has(o.value))

  return (
    <div className="flex flex-col gap-3">
      <Label>Suivi par chatteur</Label>

      {!modelSelected ? (
        <p className="text-sm text-muted-foreground">Choisis d’abord un modèle.</p>
      ) : (
        <>
          {/* Ajout INTÉGRÉ : choisir un chatteur l'ajoute directement (pas de bouton séparé). Le
              Combobox reste sur `value=""` → il réaffiche son placeholder après chaque ajout. */}
          <Combobox
            className="w-full sm:w-72"
            options={available}
            value=""
            onChange={(id) => {
              if (id) append({ chatterId: id, aMarche: '', aRegler: '' })
            }}
            placeholder={
              available.length ? 'Ajouter un chatteur suivi…' : 'Tous les chatteurs sont ajoutés'
            }
            searchPlaceholder="Rechercher un chatteur…"
            disabled={disabled || available.length === 0}
          />

          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun chatteur suivi pour l’instant.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {fields.map((f, index) => (
                <li key={f.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
                  {/* Nom du chatteur (fixe) + retirer. L'id voyage en champ caché → soumission. */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      <span className="text-muted-foreground">Chatteur</span>{' '}
                      <span className="font-medium">{nameById.get(f.chatterId) ?? '—'}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label="Retirer ce chatteur"
                      disabled={disabled}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <input type="hidden" {...register(`lines.${index}.chatterId`)} />

                  {/* Les deux notes CÔTE À CÔTE (même ligne). */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`lines-${index}-a-marche`} className="flex items-center gap-1.5">
                        <ThumbsUp className="size-3.5" /> A marché
                      </Label>
                      <Textarea
                        id={`lines-${index}-a-marche`}
                        rows={3}
                        placeholder="Ce qui a marché…"
                        disabled={disabled}
                        {...register(`lines.${index}.aMarche`)}
                      />
                      {errors.lines?.[index]?.aMarche && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {errors.lines[index]?.aMarche?.message}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`lines-${index}-a-regler`} className="flex items-center gap-1.5">
                        <Wrench className="size-3.5" /> À régler
                      </Label>
                      <Textarea
                        id={`lines-${index}-a-regler`}
                        rows={3}
                        placeholder="Ce qu’il reste à régler…"
                        disabled={disabled}
                        {...register(`lines.${index}.aRegler`)}
                      />
                      {errors.lines?.[index]?.aRegler && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {errors.lines[index]?.aRegler?.message}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
