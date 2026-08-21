'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QI_BANK_MAX, type ConfigFormValues, type ConfigInput } from '../schema'

type BankControl = Control<ConfigFormValues, unknown, ConfigInput>
type BankErrors = FieldErrors<ConfigFormValues>
type BankRegister = UseFormRegister<ConfigFormValues>

/** Variante vide prête à remplir — 4 options, bonne réponse sur la première. */
const emptyVariant = () => ({ q: '', opts: ['', '', '', ''], a: '0' })
/** Emplacement vide : un thème à nommer et une première variante. */
const emptySlot = () => ({ slot: '', variants: [emptyVariant()] })

/**
 * Banque de questions du QI : de 1 à 20 EMPLACEMENTS, chacun avec une ou plusieurs VARIANTES. À
 * chaque tentative, une variante est tirée au hasard par emplacement : plusieurs variantes = deux
 * candidats côte à côte n'ont pas le même questionnaire.
 *
 * Le nombre d'emplacements est libre parce que le barème est une PROPORTION : la logique pèse
 * 30 points du verdict quel que soit N, chaque question valant 30/N. Une tentative déjà commencée
 * garde SON N (la longueur de sa clé de correction) — ajouter ou retirer une question ici ne
 * perturbe pas un candidat en train de jouer.
 *
 * Pas de confirmation sur « retirer » : c'est un formulaire, rien n'est perdu tant que
 * « Enregistrer » n'est pas cliqué (recharger la page rend la banque en base).
 *
 * La bonne réponse est un radio par variante — elle ne descend JAMAIS au client du test (le tirage
 * l'extrait côté serveur, `pickQiQuestions`).
 */
export function QiBankEditor({
  control,
  register,
  errors,
  disabled,
}: {
  control: BankControl
  register: BankRegister
  errors: BankErrors
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove } = useFieldArray({ control, name: 'qiBank' })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Banque de questions ({fields.length} {fields.length > 1 ? 'emplacements' : 'emplacement'})</Label>
        <p className="text-xs text-muted-foreground">
          Une variante tirée au hasard par emplacement à chaque tentative. La bonne réponse reste côté serveur.
        </p>
      </div>
      <FieldError message={errors.qiBank?.message ?? errors.qiBank?.root?.message} />
      {fields.map((f, i) => (
        <QiSlotEditor
          key={f.id}
          index={i}
          control={control}
          register={register}
          errors={errors}
          disabled={disabled}
          onRemove={() => remove(i)}
          // Une banque vide ne pourrait plus tirer la moindre question : le dernier emplacement
          // n'est pas retirable (le schéma le refuserait de toute façon, autant l'éviter).
          canRemove={fields.length > 1}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled || fields.length >= QI_BANK_MAX}
        onClick={() => append(emptySlot())}
      >
        <Plus className="size-4" /> Ajouter une question
      </Button>
    </div>
  )
}

/** Un emplacement : son nom (thème) + ses variantes (`useFieldArray` imbriqué). */
function QiSlotEditor({
  index,
  control,
  register,
  errors,
  disabled,
  onRemove,
  canRemove,
}: {
  index: number
  control: BankControl
  register: BankRegister
  errors: BankErrors
  disabled?: boolean
  onRemove: () => void
  /** `false` sur le dernier emplacement : le bouton reste visible, désactivé (comme les variantes). */
  canRemove: boolean
}) {
  'use no memo'
  const { fields, append, remove } = useFieldArray({ control, name: `qiBank.${index}.variants` })
  const slotErrors = errors.qiBank?.[index]

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor={`qi-${index}-slot`} className="text-xs">
            Emplacement {index + 1} — thème
          </Label>
          <Input
            id={`qi-${index}-slot`}
            placeholder="Suite logique"
            disabled={disabled}
            aria-invalid={!!slotErrors?.slot}
            {...register(`qiBank.${index}.slot`)}
          />
          <FieldError message={slotErrors?.slot?.message} />
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append(emptyVariant())}>
            <Plus className="size-4" /> Variante
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={`Retirer l’emplacement ${index + 1}`}
            disabled={disabled || !canRemove}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <FieldError message={slotErrors?.variants?.message ?? slotErrors?.variants?.root?.message} />

      <ul className="flex flex-col gap-3">
        {fields.map((f, j) => {
          const variantErrors = slotErrors?.variants?.[j]
          return (
            <li key={f.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1">
                  <Label htmlFor={`qi-${index}-${j}-q`} className="text-xs">
                    Question
                  </Label>
                  <Input
                    id={`qi-${index}-${j}-q`}
                    disabled={disabled}
                    aria-invalid={!!variantErrors?.q}
                    {...register(`qiBank.${index}.variants.${j}.q`)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label={`Supprimer la variante ${j + 1}`}
                  disabled={disabled || fields.length <= 1}
                  onClick={() => remove(j)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <FieldError message={variantErrors?.q?.message} />
              <p className="text-xs text-muted-foreground">4 options — coche la bonne réponse.</p>
              {/* Lignes au patron « questionnaire » (même langage que le test côté candidat,
                  step-qi) : radio DANS la ligne bordée, fond `muted` sur la bonne réponse —
                  `has-[:checked]` fait tout en CSS, pas d'état React. Le champ perd sa bordure
                  propre (la ligne est le cadre) ; le focus se lit sur la ligne (`focus-within`). */}
              <div className="grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="flex items-center gap-3 rounded-xl border border-input pl-3 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-[input[type=radio]:checked]:border-primary/40 has-[input[type=radio]:checked]:bg-muted"
                  >
                    <input
                      type="radio"
                      className="size-4 shrink-0 accent-foreground"
                      value={String(k)}
                      disabled={disabled}
                      aria-label={`Bonne réponse : option ${k + 1}`}
                      {...register(`qiBank.${index}.variants.${j}.a`)}
                    />
                    <Input
                      className="flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                      placeholder={`Option ${k + 1}`}
                      disabled={disabled}
                      aria-label={`Option ${k + 1}`}
                      aria-invalid={!!variantErrors?.opts?.[k]}
                      {...register(`qiBank.${index}.variants.${j}.opts.${k}`)}
                    />
                  </div>
                ))}
              </div>
              <FieldError
                message={
                  variantErrors?.opts?.message ??
                  variantErrors?.opts?.root?.message ??
                  [0, 1, 2, 3].map((k) => variantErrors?.opts?.[k]?.message).find(Boolean)
                }
              />
              <FieldError message={variantErrors?.a?.message} />
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
