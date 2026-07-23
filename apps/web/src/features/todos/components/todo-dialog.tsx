'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { createTodo, updateTodo } from '../actions'
import { todoCreateInput, type TodoCreateInput } from '../schema'
import { PRIORITIES, TYPES, type Todo } from '../types'

const NONE = '__none__'

/**
 * `setValueAs` est aussi appliqué par RHF à la valeur par DÉFAUT (au montage du champ, quand
 * le `ref` s'attache — donc dès l'ouverture du dialog, avant toute saisie). `description` et
 * `release` valent `null` dans `defaultValues`/`reset()` : ces helpers doivent donc être
 * robustes à `null`/`undefined`, pas seulement aux chaînes saisies, sous peine de `TypeError`
 * à l'ouverture (bug constaté : `null.trim()` sur `release`).
 */
// Chaîne vide → null, sinon valeur telle quelle (pas de trim : la description garde sa mise
// en forme/ses sauts de ligne).
const emptyToNull = (v: unknown) => (v === '' ? null : ((v ?? null) as string | null))
// RELEASE EN PAUSE — seul le champ `release` utilisait ce helper (chaîne vide/blanche → null,
// chaîne pleine → trimée). À rétablir avec lui :
// const trimmedOrNull = (v: unknown): string | null => {
//   if (typeof v !== 'string') return (v ?? null) as string | null
//   const trimmed = v.trim()
//   return trimmed === '' ? null : trimmed
// }

/** Champs du schéma réellement rendus par ce formulaire. `profileId` (porteur de la liste,
 *  jamais édité ici) et `id` (ajouté par `todoUpdateInput`, absent de `TodoCreateInput`) n'ont
 *  pas de champ associé : un `fieldErrors` sur l'un d'eux ne peut donc pas être affiché à côté
 *  d'un champ et retombe sur le message global (cf. remap dans `onSubmit`). */
const DISPLAYED_FIELDS = ['title', 'description', 'type', 'priority'] as const satisfies readonly (keyof TodoCreateInput)[]
const isDisplayedField = (field: string): field is (typeof DISPLAYED_FIELDS)[number] =>
  (DISPLAYED_FIELDS as readonly string[]).includes(field)

/**
 * Création / édition d'une tâche. Le schéma zod est PARTAGÉ avec le serveur ; les
 * `fieldErrors` renvoyés par l'action sont remappés champ par champ (un message global
 * générique ne dit pas quel champ corriger — leçon de l'audit Membres 2026-07-19).
 */
export function TodoDialog({
  profileId,
  todo,
  open,
  onOpenChange,
}: {
  profileId: string
  /** null = création. */
  todo: Todo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  'use no memo'
  // Triple générique (Input, Context, Output) : `todoCreateInput` a des champs `.default()`,
  // donc son type d'ENTRÉE diverge de `TodoCreateInput` (la sortie `z.infer`). Même patron que
  // `BilanFormInput`/`BilanForm` dans insights/schema.ts.
  const form = useForm<z.input<typeof todoCreateInput>, unknown, TodoCreateInput>({
    resolver: zodResolver(todoCreateInput),
    defaultValues: { profileId, title: '', description: null, type: null, priority: 2, release: null },
  })
  const { control, formState, handleSubmit, register, reset, setError } = form

  // Réinitialise à chaque ouverture : sans ça, rouvrir le dialog après une création réussie
  // le montrerait pré-rempli avec la tâche précédente (bug constaté sur Membres).
  useEffect(() => {
    if (!open) return
    reset({
      profileId,
      title: todo?.title ?? '',
      description: todo?.description ?? null,
      type: todo?.type ?? null,
      priority: todo?.priority ?? 2,
      release: todo?.release ?? null,
    })
  }, [open, todo, profileId, reset])

  const onSubmit = handleSubmit(async (values) => {
    const res = todo
      ? await updateTodo({ ...values, id: todo.id })
      : await createTodo(values)
    if (res.success) {
      // Pas de toast de succès : même règle que la suppression — le dialog se ferme et la
      // carte/ligne apparaît à l'écran, ça suffit à confirmer le geste sans bruit
      // supplémentaire.
      onOpenChange(false)
      return
    }
    let hiddenFieldMessage: string | undefined
    for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
      const message = messages?.[0]
      if (!message) continue
      if (isDisplayedField(field)) {
        setError(field, { message })
      } else {
        // Champ non rendu (profileId, id) : pas de champ où l'afficher — remonté au global
        // plutôt qu'avalé silencieusement.
        hiddenFieldMessage = message
      }
    }
    const rootMessage = hiddenFieldMessage ?? res.error
    setError('root', { message: rootMessage })
    toast.error(rootMessage)
  })

  // Empêche la fermeture (Échap, clic extérieur, bouton Annuler) pendant l'envoi : l'écriture
  // part quand même côté serveur, fermer donnerait l'illusion d'une annulation (même garde que
  // block-dialog.tsx et member-dialog.tsx).
  const handleOpenChange = (next: boolean) => {
    if (!next && formState.isSubmitting) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{todo ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
          <DialogDescription>
            Le type est facultatif — utile pour le suivi de développement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-title">Titre</Label>
            <Input
              id="todo-title"
              disabled={formState.isSubmitting}
              {...register('title')}
              autoFocus
            />
            {formState.errors.title && (
              <p className="text-sm text-destructive">{formState.errors.title.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-description">Description</Label>
            <Textarea
              id="todo-description"
              rows={4}
              disabled={formState.isSubmitting}
              {...register('description', { setValueAs: emptyToNull })}
            />
            {formState.errors.description && (
              <p className="text-sm text-destructive">{formState.errors.description.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Un Select Radix dans RHF passe par Controller, jamais register
                (docs/guidelines-standard-feature.md §5, « Pièges »). */}
            <div className="flex flex-col gap-2">
              <Label>Priorité</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v) as 1 | 2 | 3)}
                    disabled={formState.isSubmitting}
                  >
                    <SelectTrigger aria-label="Priorité">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    disabled={formState.isSubmitting}
                  >
                    <SelectTrigger aria-label="Type">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Aucun</SelectItem>
                      {TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* RELEASE EN PAUSE (2026-07-20) — champ retiré de la saisie. La colonne `release`
                existe toujours en base et dans le schéma (les valeurs déjà saisies sont
                conservées) ; réactivation = décommenter ce bloc, remettre la prop `releases`
                (ci-dessus et chez l'appelant) et le filtre dans `todos-view.tsx`.

            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-release">Release</Label>
              <Input
                id="todo-release"
                list="todo-releases"
                placeholder="v1.4"
                disabled={formState.isSubmitting}
                {...register('release', { setValueAs: trimmedOrNull })}
              />
              <datalist id="todo-releases">
                {releases.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {formState.errors.release && (
                <p className="text-sm text-destructive">{formState.errors.release.message}</p>
              )}
            </div>
            */}
          </div>

          {formState.errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {formState.errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Annuler
            </Button>
            <ActionButton type="submit" pending={formState.isSubmitting}>
              {todo ? 'Enregistrer' : 'Créer la tâche'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
