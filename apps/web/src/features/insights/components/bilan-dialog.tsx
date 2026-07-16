'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { bilanSchema, type BilanForm, type BilanFormInput } from '../schema'
import type { InsightBilan } from '../types'

export const ETAT_OPTIONS = [
  ['neutre', 'Neutre / RAS'],
  ['motive', 'Motivé / mobilisé'],
  ['fatigue', 'Fatigué / surchargé'],
  ['demotive', 'Démotivé / désengagé'],
  ['resistant', 'Résistant / défensif'],
] as const

const DUREE_OPTIONS = [
  ['5min', '5 min — vite fait'],
  ['15min', '15 min — standard'],
  ['30min', '30 min — sérieux'],
  ['1h+', '1h+ — approfondi'],
] as const

/**
 * « Aujourd'hui » en TZ NAVIGATEUR (composants locaux, pas `toISOString()` qui bascule en
 * UTC — même piège que `isoDate()`/`new Date()` nu documenté dans
 * `docs/guidelines-data-loading.md` §6, mais ici défendable : c'est une date DE FORM,
 * pré-remplissage éditable par le manager (pas un calcul métier serveur), donc son "jour"
 * local à lui — pas Europe/Paris — est la bonne référence.
 */
function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const EMPTY: InsightBilan = {
  date: todayLocal(),
  duree: '15min',
  etat: 'neutre',
  resume: '',
  actions: '',
  objectifs: '',
  sanction: '',
  nextCheck: '',
  notes: '',
}

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">optionnel</span>}
      </label>
      {children}
    </div>
  )
}

const areaCls =
  'w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Modal « bilan » de résolution (RHF + Zod, schéma partagé avec le serveur). Guide le manager
 * (résumé, actions, objectifs, sanction, checkpoint). Requis pour passer une carte en Résolu.
 */
export function BilanDialog({
  open,
  onOpenChange,
  title,
  initial,
  pending,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: InsightBilan | null
  pending: boolean
  onSave: (bilan: InsightBilan) => void
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<BilanFormInput, unknown, BilanForm>({
    resolver: zodResolver(bilanSchema),
    defaultValues: initial ?? EMPTY,
  })

  const submit = handleSubmit((values) => onSave(values))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        // Ne pas perdre un bilan en cours de frappe sur un clic hors du modal.
        onInteractOutside={(e) => {
          if (isDirty) e.preventDefault()
        }}
      >
        <DialogHeader className="space-y-1.5 px-6 pb-5 pt-6 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Bilan de résolution
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{title}</p>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="flex flex-col gap-5 px-6 pb-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Date du call">
                <Input type="date" className="h-9 text-sm" {...register('date')} />
              </Field>
              <Field label="Durée">
                <Controller
                  name="duree"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DUREE_OPTIONS.map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-sm">
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="État du chatteur">
                <Controller
                  name="etat"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ETAT_OPTIONS.map(([v, l]) => (
                          <SelectItem key={v} value={v} className="text-sm">
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            <Field label="Résumé du call">
              <textarea
                rows={3}
                className={areaCls}
                placeholder="Qu'est-ce qui s'est dit ? Les points clés discutés."
                {...register('resume')}
              />
              {errors.resume && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {errors.resume.message}
                </span>
              )}
            </Field>

            <Field label="Actions engagées par le chatteur" optional>
              <textarea
                rows={2}
                className={areaCls}
                placeholder="Ex : il va relancer 5 spenders, voice notes quotidiennes…"
                {...register('actions')}
              />
            </Field>

            <Field label="Objectifs définis — chiffré + deadline" optional>
              <textarea
                rows={2}
                className={areaCls}
                placeholder="Ex : 800 € d'ici dimanche, 30 nouveaux subs qualifiés…"
                {...register('objectifs')}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Sanction si non tenu" optional>
                <Input
                  className="h-9 text-sm"
                  placeholder="Ex : PIP, dernière chance, départ"
                  {...register('sanction')}
                />
              </Field>
              <Field label="Prochain checkpoint" optional>
                <Input type="date" className="h-9 text-sm" {...register('nextCheck')} />
              </Field>
            </div>

            <Field label="Notes, red flags, contexte" optional>
              <textarea
                rows={2}
                className={areaCls}
                placeholder="Tout ce qu'il faut retenir pour la prochaine fois (vie perso, conflits…)"
                {...register('notes')}
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 px-6 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <ActionButton type="submit" pending={pending}>
              Enregistrer le bilan
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
