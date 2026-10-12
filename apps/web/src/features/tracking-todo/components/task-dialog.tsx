'use client'

import { useTransition } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { updateTask } from '../actions'
import { taskForm, type TaskFormValues } from '../schema'
import type { TodoTask } from '../types'
import { URGENCY_LABEL } from '../urgency'
import { UrgencyPicker } from './urgency-picker'

/** La tâche ouverte, et le jour où elle se trouve (une `TodoTask` ne porte pas sa date). */
export interface OpenTask {
  task: TodoTask
  date: string
  /** « lundi 12/10 » — l'en-tête de sa colonne (`TodoDay`), tel quel. */
  dayTitle: string
  category: string
}

/**
 * La pop-up d'une tâche (#160) : la carte n'affiche que le titre, le reste se lit ici — et se
 * modifie quand on peut ORGANISER la semaine (titre, description, urgence, jour). Sinon, lecture
 * seule : la description n'est visible nulle part ailleurs.
 *
 * `.trk` sur le contenu : la pop-up est rendue dans un portail, hors de la page du tracker, et
 * reprendrait sinon la palette claire du CRM.
 */
export function TaskDialog({
  open,
  ownerId,
  canOrganize,
  onClose,
}: {
  open: OpenTask | null
  ownerId: string
  /** ORGANISER — modifier. Le titulaire ou son encadrement (`assertCanOrganize`). */
  canOrganize: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open !== null} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="trk tdlg">
        {open ? (
          <>
            <DialogHeader>
              <DialogTitle>{canOrganize ? 'Modifier la tâche' : 'La tâche'}</DialogTitle>
              <DialogDescription>
                {open.dayTitle}
                {open.category ? ` · ${open.category}` : ''}
                {open.task.virtual ? ' · récurrente' : ''}
              </DialogDescription>
            </DialogHeader>
            {/* Clé = la tâche : le formulaire repart de SES valeurs à chaque ouverture, au lieu de
                garder le brouillon de la précédente (piège des `defaultValues`, guidelines § 5). */}
            {canOrganize ? (
              <TaskForm key={open.task.id} open={open} ownerId={ownerId} onDone={onClose} />
            ) : (
              <TaskDetails open={open} onClose={onClose} />
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TaskForm({ open, ownerId, onDone }: { open: OpenTask; ownerId: string; onDone: () => void }) {
  'use no memo'

  const [pending, startTransition] = useTransition()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskForm),
    defaultValues: {
      label: open.task.label,
      description: open.task.description,
      urgency: open.task.urgency,
      date: open.date,
    },
  })

  const save = handleSubmit((values) => {
    startTransition(async () => {
      const res = await updateTask({ ownerId, taskId: open.task.id, ...values })
      if (!res.success) {
        setError('root', { message: res.error ?? 'Erreur inattendue' })
        return
      }
      toast.success('Tâche enregistrée')
      onDone()
    })
  })

  return (
    <form className="tform" onSubmit={save} noValidate>
      {open.task.virtual ? (
        // Ce que le serveur fera : seule l'occurrence du jour change (décision du 2026-10-12).
        <p className="cnt">Tâche récurrente : seule celle de ce jour sera modifiée, pas l’habitude.</p>
      ) : null}
      <div className="field">
        <label htmlFor="tdl-title">Titre</label>
        <input id="tdl-title" autoFocus {...register('label')} />
        {errors.label ? <p className="msg ko">{errors.label.message}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="tdl-desc">Description</label>
        <textarea id="tdl-desc" rows={5} placeholder="Facultative" {...register('description')} />
        {errors.description ? <p className="msg ko">{errors.description.message}</p> : null}
      </div>
      <div className="field">
        <label>Urgence</label>
        <Controller
          control={control}
          name="urgency"
          render={({ field }) => <UrgencyPicker value={field.value} onChange={field.onChange} />}
        />
      </div>
      <div className="field">
        <label htmlFor="tdl-date">Jour</label>
        <input id="tdl-date" type="date" {...register('date')} />
        {errors.date ? <p className="msg ko">{errors.date.message}</p> : null}
      </div>
      {errors.root ? (
        <p className="msg ko" role="alert">
          {errors.root.message}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <ActionButton type="submit" size="sm" pending={pending}>
          Enregistrer
        </ActionButton>
      </DialogFooter>
    </form>
  )
}

function TaskDetails({ open, onClose }: { open: OpenTask; onClose: () => void }) {
  return (
    <div className="tform">
      <p className="tdl-title">
        <span className={`udot u-${open.task.urgency}`} aria-hidden />
        {open.task.label}
      </p>
      <p className="cnt">Urgence : {URGENCY_LABEL[open.task.urgency]}</p>
      {open.task.description ? (
        <p className="tdl-desc">{open.task.description}</p>
      ) : (
        <p className="bnone">Pas de description.</p>
      )}
      <DialogFooter>
        <Button type="button" size="sm" onClick={onClose}>
          Fermer
        </Button>
      </DialogFooter>
    </div>
  )
}
