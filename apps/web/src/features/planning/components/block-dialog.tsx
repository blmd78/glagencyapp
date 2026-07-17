'use client'

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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { saveBlock } from '../actions'
import { blockForm, type BlockForm } from '../schema'
import { SECTION_LABELS, type PlanningBlock } from '../types'

/** Couleurs d'accent proposées (mêmes pastilles que les fiches VA). */
const COLORS = ['#f59e0b', '#22d3ee', '#6366f1', '#22c55e', '#e1306c', '#0ea5e9', '#a855f7', '#ef4444']

const emptyForm: BlockForm = {
  section: 'matin',
  timeStart: '09:30',
  timeEnd: '10:00',
  title: '',
  badge: '',
  color: COLORS[5],
  bulletsText: '',
}

const toForm = (b: PlanningBlock): BlockForm => ({
  section: b.section,
  timeStart: b.timeStart,
  timeEnd: b.timeEnd,
  title: b.title,
  badge: b.badge,
  color: b.color,
  bulletsText: b.bullets.join('\n'),
})

/** Dialog admin : création/édition d'un bloc horaire (RHF + zod, schéma partagé). */
export function BlockDialog({
  profileId,
  block,
  open,
  onClose,
}: {
  profileId: string
  /** null = création. */
  block: PlanningBlock | null
  open: boolean
  onClose: () => void
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BlockForm>({
    resolver: zodResolver(blockForm),
    values: block ? toForm(block) : emptyForm,
  })

  const submit = handleSubmit(async (values) => {
    const res = await saveBlock({
      id: block?.id ?? null,
      profileId,
      section: values.section,
      timeStart: values.timeStart,
      timeEnd: values.timeEnd,
      title: values.title,
      badge: values.badge.toUpperCase(),
      color: values.color,
      bullets: values.bulletsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(block ? 'Bloc modifié' : 'Bloc ajouté')
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{block ? 'Modifier le bloc' : 'Nouveau bloc'}</DialogTitle>
          <DialogDescription>
            Un créneau du planning : horaires, contenu et catégorie (badge coloré).
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
            <Input id="b-title" placeholder="Formation setters — Session 1" disabled={isSubmitting} {...register('title')} />
            {errors.title && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.title.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="b-badge">Badge (catégorie)</Label>
              <Input id="b-badge" placeholder="SETTERS" disabled={isSubmitting} {...register('badge')} />
              <p className="text-xs text-muted-foreground">
                Sert aussi à la répartition du temps en bas de page.
              </p>
              {errors.badge && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.badge.message}</p>
              )}
            </div>
            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <Label>Couleur</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
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
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-bullets">Contenu (une puce par ligne)</Label>
            <Textarea
              id="b-bullets"
              rows={4}
              placeholder={'Voc live avec les setters du shift : review de chats en direct\nTravailler l’enchaînement accroche → qualification → vente'}
              disabled={isSubmitting}
              {...register('bulletsText')}
            />
            <p className="text-xs text-muted-foreground">
              Le texte avant « : » s’affiche en gras (« Lead : détail »).
            </p>
            {errors.bulletsText && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.bulletsText.message}</p>
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
