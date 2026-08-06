'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { saveBlock } from '../actions'
import { blockForm, type BlockForm } from '../schema'
import { DAY_SHORT, PLANNING_DAYS, SECTION_LABELS, type PlanningBlock } from '../types'
import { BlockContentFields, type Mode } from './block-content-fields'

/** Couleurs d'accent proposées (mêmes pastilles que les fiches VA). */
const COLORS = ['#f59e0b', '#22d3ee', '#6366f1', '#22c55e', '#e1306c', '#0ea5e9', '#a855f7', '#ef4444']

const linesToArray = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

const emptyForm: BlockForm = {
  section: 'matin',
  timeStart: '09:30',
  timeEnd: '10:00',
  title: '',
  color: COLORS[5],
  bulletsText: '',
  categories: [],
  days: [],
}

const toForm = (b: PlanningBlock): BlockForm => ({
  section: b.section,
  timeStart: b.timeStart,
  timeEnd: b.timeEnd,
  title: b.title,
  color: b.color,
  bulletsText: b.bullets.join('\n'),
  categories: b.categories.map((c) => ({
    subtitle: c.subtitle,
    badge: c.badge,
    bulletsText: c.bullets.join('\n'),
  })),
  days: b.days,
})

/** Dialog d'édition : création/édition d'un bloc horaire (RHF + zod, schéma partagé). */
export function BlockDialog({
  profileId,
  block,
  open,
  onClose,
  onSaved,
}: {
  profileId: string
  /** null = création. */
  block: PlanningBlock | null
  open: boolean
  onClose: () => void
  /** Enregistrement réussi — permet au parent de recharger un planning détenu en état client. */
  onSaved?: () => void
}) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BlockForm>({
    resolver: zodResolver(blockForm),
    values: block ? toForm(block) : emptyForm,
  })
  // `values` ne suffit PAS à rouvrir propre : RHF ne re-reset que si la prop `values` change
  // en profondeur — rouvrir sur le MÊME bloc (ou « Nouveau bloc », même `emptyForm`) garde la
  // saisie abandonnée à la croix/ESC. Reset explicite à chaque ouverture (audit 2026-08-06).
  useEffect(() => {
    if (open) reset(block ? toForm(block) : emptyForm)
  }, [open, block, reset])
  // Mode « tâche simple » (puces) OU « sous-tâches » (catégories). Resynchronisé à chaque
  // OUVERTURE selon le bloc (ajustement d'état pendant le rendu — PAS dans un effet) : un bloc
  // avec catégories ouvre en mode sous-tâches, sinon simple. L'état reste ICI (le submit en
  // dépend) ; la bascule et l'éditeur vivent dans `BlockContentFields`.
  const [mode, setMode] = useState<Mode>('simple')
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setMode(block && block.categories.length > 0 ? 'cat' : 'simple')
  }

  const submit = handleSubmit(async (values) => {
    const res = await saveBlock({
      id: block?.id ?? null,
      profileId,
      section: values.section,
      timeStart: values.timeStart,
      timeEnd: values.timeEnd,
      title: values.title,
      color: values.color,
      // Un seul mode enregistré : puces plates OU catégories (l'autre part vide).
      bullets: mode === 'simple' ? linesToArray(values.bulletsText) : [],
      categories:
        mode === 'cat'
          ? values.categories.map((c) => ({
              subtitle: c.subtitle.trim(),
              badge: c.badge.trim(),
              bullets: linesToArray(c.bulletsText),
            }))
          : [],
      days: values.days,
    })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(block ? 'Bloc modifié' : 'Bloc ajouté')
    onSaved?.()
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{block ? 'Modifier le bloc' : 'Nouveau bloc'}</DialogTitle>
          <DialogDescription>
            Un créneau du planning : horaires, jours et contenu (tâche simple ou sous-tâches).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Controller
              name="section"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label>Section</Label>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SECTION_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="b-start">Début</Label>
              <Input id="b-start" type="time" disabled={isSubmitting} {...register('timeStart')} />
              {errors.timeStart && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.timeStart.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-end">Fin</Label>
              <Input id="b-end" type="time" disabled={isSubmitting} {...register('timeEnd')} />
              {errors.timeEnd && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.timeEnd.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="b-title">Titre</Label>
            <Input id="b-title" placeholder="Comptabilité + Formation des équipes" disabled={isSubmitting} {...register('title')} />
            {errors.title && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.title.message}</p>
            )}
          </div>

          <Controller
            name="color"
            control={control}
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label>Couleur</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={isSubmitting}
                      aria-label={`Couleur ${c}`}
                      className={cn(
                        'size-6 rounded-full border-2',
                        field.value === c ? 'border-foreground' : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => field.onChange(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          />

          {/* Jours — vide = tous les jours ; sinon « Uniquement … » à l'affichage. */}
          <Controller
            name="days"
            control={control}
            render={({ field }) => (
              <div className="grid gap-1.5">
                <Label>Jours</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLANNING_DAYS.map((d) => {
                    const on = field.value.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d])
                        }
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          on
                            ? 'border-foreground bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vide = tous les jours. Sinon le bloc affiche « Uniquement … ».
                </p>
              </div>
            )}
          />

          {/* Mode : tâche simple (puces) OU sous-tâches (catégories) — cf. block-content-fields. */}
          <BlockContentFields
            control={control}
            register={register}
            errors={errors}
            isSubmitting={isSubmitting}
            mode={mode}
            onModeChange={setMode}
          />

          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
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
