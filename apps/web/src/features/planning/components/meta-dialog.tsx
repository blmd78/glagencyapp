'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
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
import { savePlanningMeta } from '../actions'
import { metaForm, parseAnnexes, type MetaForm } from '../schema'
import type { PlanningData } from '../types'

const toForm = (d: PlanningData): MetaForm => ({
  priorityTitle: d.priorityTitle,
  priorityBody: d.priorityBody,
  priorityForbidden: d.priorityForbidden,
  priorityAllowed: d.priorityAllowed,
  pauseNote: d.pauseNote,
  annexesText: d.annexes.map((a) => (a.detail ? `${a.title} : ${a.detail}` : a.title)).join('\n'),
  annexNote: d.annexNote,
})

/** Dialog d'édition : encart priorité, note de pause et tâches annexes du planning. */
export function MetaDialog({
  data,
  open,
  onClose,
}: {
  data: PlanningData
  open: boolean
  onClose: () => void
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MetaForm>({ resolver: zodResolver(metaForm), values: toForm(data) })

  const submit = handleSubmit(async (values) => {
    const res = await savePlanningMeta({
      profileId: data.profileId,
      priorityTitle: values.priorityTitle,
      priorityBody: values.priorityBody,
      priorityForbidden: values.priorityForbidden,
      priorityAllowed: values.priorityAllowed,
      pauseNote: values.pauseNote,
      annexNote: values.annexNote,
      // « Titre : détail » (séparateur AVEC espaces — un ':' d'URL/d'heure ne coupe pas).
      annexes: parseAnnexes(values.annexesText),
    })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success('Priorité & annexes enregistrées')
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Priorité & tâches annexes</DialogTitle>
          <DialogDescription>
            L’encart « priorité n°1 » en tête de planning, la note de pause et les tâches en
            continu. Un champ vide n’est pas affiché.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="m-ptitle">Priorité — titre</Label>
              <Input id="m-ptitle" placeholder="Formation setters." disabled={isSubmitting} {...register('priorityTitle')} />
              {errors.priorityTitle && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.priorityTitle.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-allowed">Mention « permis »</Label>
              <Input id="m-allowed" placeholder="Tout le reste est permis." disabled={isSubmitting} {...register('priorityAllowed')} />
              {errors.priorityAllowed && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.priorityAllowed.message}</p>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-pbody">Priorité — texte</Label>
            <Textarea id="m-pbody" rows={3} disabled={isSubmitting} {...register('priorityBody')} />
            {errors.priorityBody && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.priorityBody.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-forbidden">Interdits</Label>
            <Input id="m-forbidden" placeholder="scam / mensonge · proposer une rencontre" disabled={isSubmitting} {...register('priorityForbidden')} />
            {errors.priorityForbidden && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.priorityForbidden.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-pause">Note de pause</Label>
            <Input id="m-pause" placeholder="Restez disponibles sur vos téléphones en cas d’urgence" disabled={isSubmitting} {...register('pauseNote')} />
            {errors.pauseNote && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.pauseNote.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-annexes">Tâches annexes (une par ligne, « Titre : détail »)</Label>
            <Textarea
              id="m-annexes"
              rows={4}
              placeholder={'Gestion modèle : demandes de médias, retours, groupe modèle\nEmplois du temps : shifts confirmés, remplacements gérés'}
              disabled={isSubmitting}
              {...register('annexesText')}
            />
            {errors.annexesText && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.annexesText.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-anote">Note des tâches annexes</Label>
            <Input id="m-anote" placeholder="Ces tâches se gèrent en parallèle…" disabled={isSubmitting} {...register('annexNote')} />
            {errors.annexNote && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.annexNote.message}</p>
            )}
          </div>
          {errors.root && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={isSubmitting}>
              Enregistrer
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
