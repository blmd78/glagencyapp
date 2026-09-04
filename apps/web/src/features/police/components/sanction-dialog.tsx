'use client'

import { useState, type ReactNode } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { todayParis } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { DayPicker } from '@/components/day-picker'
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
import { addPoliceWarning, addPoliceMalus, updatePoliceEntry } from '../actions'
import { controlFormSchema, type ControlForm } from '../schema'
import { POLICE_ERRORS } from '@/lib/types/police-errors'
import { SHIFTS, type PoliceData, type PoliceEntry } from '../types'

/**
 * LE dialog de sanction — création (« Ajouter une sanction », vierge) ET édition (le crayon
 * d'une sous-ligne rouvre CE formulaire pré-rempli — demande Benoit 2026-08-17, remplace
 * l'ancien popover montant+note). RHF + Zod, schéma partagé avec le serveur. Date de la faute
 * (datepicker, défaut aujourd'hui), chatteur + type d'erreur, puis un champ montant : vide →
 * avertissement ; renseigné → malus (le bouton suit — en édition, ça RECLASSE l'entrée).
 * Le dialog se FERME à l'enregistrement, et s'ouvre toujours sur SES valeurs (reset à
 * l'ouverture — une saisie abandonnée à la croix ne réapparaît pas).
 */
const formDefaults = (entry?: PoliceEntry, prefill?: SanctionPrefill): ControlForm =>
  entry
    ? {
        day: entry.occurredOn,
        chatterId: entry.chatterId,
        errorKey: entry.errorKey ?? '',
        shift: entry.shift ?? '',
        amount: entry.kind === 'malus' ? String(entry.amountEur) : '',
        note: entry.note ?? '',
      }
    : {
        day: prefill?.day ?? todayParis(),
        chatterId: prefill?.chatterId ?? '',
        errorKey: prefill?.errorKey ?? '',
        shift: prefill?.shift ?? '',
        // JAMAIS de montant pré-rempli : le relevé constate une couverture, il ne chiffre
        // rien. Le montant reste ENTIÈREMENT humain (spec §5.5) — une valeur suggérée
        // deviendrait la valeur par défaut de toutes les retenues.
        amount: '',
        note: '',
      }

/**
 * Valeurs proposées à l'ouverture, quand la sanction est amorcée depuis un autre écran (le
 * Relevé d'équipe). Ce ne sont QUE des valeurs par défaut : le formulaire, ses gardes et son
 * Zod restent le seul chemin d'écriture, et tout reste modifiable avant l'envoi.
 */
export interface SanctionPrefill {
  day: string
  chatterId: string
  shift?: string
  errorKey?: string
}

export function SanctionDialog({
  data,
  entry,
  trigger,
  prefill,
  openOnMount = false,
}: {
  data: PoliceData
  /** Entrée à ÉDITER — absente, le dialog crée. */
  entry?: PoliceEntry
  /** Bouton d'ouverture (le `+` de la page, ou le crayon d'une sous-ligne). */
  trigger: ReactNode
  /** Valeurs proposées en création — arrivées d'un autre écran (cf. `SanctionPrefill`). */
  prefill?: SanctionPrefill
  /** Ouvre le dialog au montage : le lien « Signaler » du Relevé arrive ici tout ouvert. */
  openOnMount?: boolean
}) {
  // 'use no memo' : formState de RHF est un Proxy à abonnement — mémoïsé par le React
  // Compiler, isSubmitting/errors gèlent (règle projet, mémoire forms-zod-rhf).
  'use no memo'
  const [open, setOpen] = useState(openOnMount)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ControlForm>({
    resolver: zodResolver(controlFormSchema),
    defaultValues: formDefaults(entry, prefill),
  })

  // Réouverture toujours sur SES valeurs (vierge en création, l'entrée en édition) : une saisie
  // abandonnée (croix, ESC, clic dehors) ne doit pas réapparaître. Le reset vit à l'OUVERTURE —
  // le seul moment qui couvre tous les chemins de fermeture (même patron que la fiche membre).
  const onOpenChange = (next: boolean) => {
    // Pas de fermeture (croix/ESC/clic dehors) pendant l'envoi — même garde que le Rapport.
    if (!next && isSubmitting) return
    setOpen(next)
    if (next) reset(formDefaults(entry, prefill))
  }

  // useWatch (pas watch) : compatible React Compiler (watch lit ref.current au render).
  const chatterId = useWatch({ control, name: 'chatterId' })
  const amount = useWatch({ control, name: 'amount' })
  const day = useWatch({ control, name: 'day' })
  const amountEur = amount?.trim() ? Number(amount.replace(',', '.')) : 0
  const isMalus = amountEur > 0
  const recentWarns = chatterId ? (data.warningsByChatter[chatterId] ?? 0) : null
  // Date HORS de la période affichée (`?from&to` du header) : la sanction s'enregistrera mais
  // n'apparaîtra pas dans la liste en dessous — sans ce signal, l'utilisateur croit à un échec
  // et re-soumet (audit 2026-08-17 : risque de malus en double sur la paie). Comparaison
  // lexicographique = chronologique pour des `YYYY-MM-DD`.
  const outsidePeriod = day < data.period.from || day > data.period.to

  const onSubmit = handleSubmit(async (values) => {
    const amt = values.amount?.trim() ? Number(values.amount.replace(',', '.')) : 0
    const common = {
      day: values.day,
      chatterId: values.chatterId,
      errorKey: values.errorKey,
      shift: values.shift || undefined,
    }
    const res = entry
      ? await updatePoliceEntry({
          id: entry.id,
          ...common,
          amountEur: amt,
          note: values.note?.trim() || undefined,
        })
      : amt > 0
        ? await addPoliceMalus({ ...common, amountEur: amt, note: values.note?.trim() || undefined })
        : await addPoliceWarning(common)
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(
      entry ? 'Sanction modifiée' : amt > 0 ? 'Malus enregistré' : 'Avertissement ajouté',
      {
        // Hors période affichée : dire OÙ la sanction est partie, sinon « rien n'apparaît » se
        // lit comme un échec (cf. `outsidePeriod` plus haut).
        description:
          values.day < data.period.from || values.day > data.period.to
            ? 'Datée hors de la période affichée — change la période en haut à droite pour la voir.'
            : undefined,
      },
    )
    // Enregistré → la modal se ferme (le toast confirme ; rouvrir = repartir du bon état).
    reset(formDefaults(entry, prefill))
    setOpen(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? `Modifier la sanction — ${entry.chatterName}` : 'Nouvelle sanction'}</DialogTitle>
          <DialogDescription>Sans montant, c’est un simple avertissement.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* La date de la faute d'abord (défaut aujourd'hui) — bornée à la même fenêtre que le
              serveur, le calendrier n'offre pas d'autre choix (une date d'origine plus ancienne
              reste soumise telle quelle en édition). */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Controller name="day" control={control} render={({ field }) => <DayPicker field={field} />} />
            {outsidePeriod && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Hors de la période affichée ({data.period.label}) — la sanction s’enregistrera
                mais ne s’affichera pas en dessous.
              </p>
            )}
            {errors.day && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.day.message}</p>
            )}
          </div>

          {/* Puis le chatteur — l'aide-décision (avert. récents) s'affiche dès le choix. */}
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
            {entry
              ? isMalus
                ? `Enregistrer (malus ${eur2max(amountEur)})`
                : 'Enregistrer (avertissement)'
              : isMalus
                ? `Infliger le malus (${eur2max(amountEur)})`
                : 'Ajouter l’avertissement'}
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  )
}
