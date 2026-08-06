'use client'

import { useState } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { eur2max } from '@/lib/format'
import { addPoliceWarning, addPoliceMalus } from '../actions'
import { controlFormSchema, type ControlForm } from '../schema'
import { POLICE_ERRORS } from '@/lib/types/police-errors'
import { SHIFTS, type PoliceData } from '../types'

/**
 * Saisie d'un contrôle en DIALOG (« Ajouter une sanction ») — la page ne garde que l'historique,
 * la saisie s'ouvre à la demande (demande Benoit 2026-08-06). RHF + Zod, schéma partagé avec le
 * serveur. Chatteur + type d'erreur, puis un champ montant : vide → avertissement ; renseigné →
 * malus (le bouton suit). Le dialog se FERME à l'enregistrement, et s'ouvre toujours VIERGE
 * (reset à l'ouverture — une saisie abandonnée à la croix ne réapparaît pas).
 */
const CONTROL_DEFAULTS: ControlForm = { chatterId: '', errorKey: '', shift: '', amount: '', note: '' }

export function ControlPanel({ data }: { data: PoliceData }) {
  // 'use no memo' : formState de RHF est un Proxy à abonnement — mémoïsé par le React
  // Compiler, isSubmitting/errors gèlent (règle projet, mémoire forms-zod-rhf).
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ControlForm>({
    resolver: zodResolver(controlFormSchema),
    defaultValues: CONTROL_DEFAULTS,
  })

  // Réouverture toujours VIERGE : la saisie abandonnée (croix, ESC, clic dehors) ne doit pas
  // réapparaître. Le reset vit à l'OUVERTURE — le seul moment qui couvre tous les chemins de
  // fermeture (même patron que la fiche membre).
  const onOpenChange = (next: boolean) => {
    // Pas de fermeture (croix/ESC/clic dehors) pendant l'envoi — même garde que le Rapport.
    if (!next && isSubmitting) return
    setOpen(next)
    if (next) reset(CONTROL_DEFAULTS)
  }

  // useWatch (pas watch) : compatible React Compiler (watch lit ref.current au render).
  const chatterId = useWatch({ control, name: 'chatterId' })
  const amount = useWatch({ control, name: 'amount' })
  const amountEur = amount?.trim() ? Number(amount.replace(',', '.')) : 0
  const isMalus = amountEur > 0
  const recentWarns = chatterId ? (data.warningsByChatter[chatterId] ?? 0) : null

  const onSubmit = handleSubmit(async (values) => {
    const amt = values.amount?.trim() ? Number(values.amount.replace(',', '.')) : 0
    const res =
      amt > 0
        ? await addPoliceMalus({
            day: data.day,
            chatterId: values.chatterId,
            errorKey: values.errorKey,
            amountEur: amt,
            note: values.note?.trim() || undefined,
            shift: values.shift || undefined,
          })
        : await addPoliceWarning({
            day: data.day,
            chatterId: values.chatterId,
            errorKey: values.errorKey,
            shift: values.shift || undefined,
          })
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(amt > 0 ? 'Malus enregistré' : 'Avertissement ajouté')
    // Enregistré → la modal se ferme, vidée (le toast confirme ; rouvrir = repartir de zéro).
    reset(CONTROL_DEFAULTS)
    setOpen(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-1.5">
          <Plus className="size-4" />
          Ajouter une sanction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle sanction</DialogTitle>
          <DialogDescription>
            {data.dayLabel} — sans montant, c’est un simple avertissement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* Le chatteur d'abord — l'aide-décision (avert. récents) s'affiche dès le choix. */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Chatter</Label>
            <Controller
              name="chatterId"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={data.chatterOptions.map((c) => ({ value: c.id, label: c.name }))}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Choisir un chatter…"
                  searchPlaceholder="Rechercher un chatter…"
                />
              )}
            />
            {recentWarns != null && (
              <p className="text-xs">
                {recentWarns > 0 ? (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {recentWarns} avert. sur 30 jours
                  </span>
                ) : (
                  <span className="text-muted-foreground">Aucun avert. récent</span>
                )}
              </p>
            )}
            {errors.chatterId && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.chatterId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Shift</Label>
              <Controller
                name="shift"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 text-sm capitalize">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Type d’erreur</Label>
              <Controller
                name="errorKey"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {POLICE_ERRORS.map((e) => (
                        <SelectItem key={e.key} value={e.key} className="text-sm">
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.errorKey && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.errorKey.message}</p>
              )}
            </div>
          </div>

          {/* La décision : vide → avertissement ; un montant → malus (le bouton suit). */}
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Malus €</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                placeholder="vide = avert."
                className="h-9 text-sm"
                {...register('amount')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Motif</Label>
              <Input
                placeholder={isMalus ? 'Raison du malus…' : 'Réservé au malus'}
                disabled={!isMalus}
                className="h-9 text-sm"
                {...register('note')}
              />
            </div>
          </div>

          {errors.amount && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
          {errors.root && (
            <p className="text-xs text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}

          <ActionButton
            type="submit"
            pending={isSubmitting}
            variant={isMalus ? 'destructive' : 'default'}
          >
            {isMalus ? `Infliger le malus (${eur2max(amountEur)})` : 'Ajouter l’avertissement'}
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  )
}
