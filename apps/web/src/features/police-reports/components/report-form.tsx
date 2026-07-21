'use client'

import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import { ActionButton } from '@/components/action-button'
import { upsertPoliceReport } from '../actions'
import { reportInput, type ReportInput, type ReportFormValues } from '../schema'
import type { PoliceReport, ReportOption } from '../types'
import { ReportLinesEditor } from './report-lines-editor'

// Champs de l'en-tête réellement rendus : un `fieldErrors` serveur sur l'un d'eux est reposé sur
// son champ ; le reste (ex. `lines` imbriqué) retombe sur le message global (leçon audit Membres).
const HEADER_FIELDS = ['creatorId', 'day', 'ca', 'nonTraitees', 'absents', 'alerte'] as const
const isHeaderField = (field: string): field is (typeof HEADER_FIELDS)[number] =>
  (HEADER_FIELDS as readonly string[]).includes(field)

/**
 * Saisie du rapport du soir : un modèle + une date, les chiffres du modèle saisis à la main,
 * puis le suivi chatteur par chatteur. Upsert sur (auteur, modèle, jour) → ré-ouvrir la fiche du
 * soir la RECHARGE (pré-remplissage depuis `reports`) au lieu de risquer un écrasement à blanc.
 * Schéma zod PARTAGÉ avec le serveur ; un `Combobox`/`Select` passe par `Controller` (jamais
 * `register` nu).
 */
export function ReportForm({
  models,
  reports,
  chattersByModel,
  currentProfileId,
  today,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — peuplent le Combobox chatteur sans
   *  appel serveur au changement de modèle. */
  chattersByModel: Record<string, ReportOption[]>
  /** Rédacteur courant. La fiche est keyée (auteur, modèle, jour) : le pré-remplissage doit
   *  matcher SON rapport, jamais celui d'un autre auteur du même modèle/soir (cf. useEffect). */
  currentProfileId: string
  today: string
}) {
  const router = useRouter()
  // Triple générique (Input, Context, Output) : `reportInput` a des `.default()`/`.transform()`,
  // son type d'ENTRÉE diverge de `ReportInput` (la sortie) — même patron que `todo-dialog`.
  const form = useForm<ReportFormValues, unknown, ReportInput>({
    resolver: zodResolver(reportInput),
    defaultValues: {
      creatorId: '',
      day: today,
      ca: 0,
      nonTraitees: 0,
      absents: 0,
      alerte: '',
      lines: [],
    },
  })
  const { control, register, handleSubmit, reset, setError, formState } = form
  const { errors, isSubmitting } = formState

  // useWatch (pas `watch`) : compatible React Compiler. Modèle + date pilotent le
  // pré-remplissage ET la liste de chatteurs proposée.
  const creatorId = useWatch({ control, name: 'creatorId' })
  const day = useWatch({ control, name: 'day' })

  // Édition de la fiche existante : si (modèle, date) correspond à MON rapport déjà chargé,
  // pré-remplir depuis lui ; sinon, remettre à blanc. On matche sur les 3 clés de l'upsert
  // (auteur, modèle, jour) : `reports` contient les rapports de TOUS les auteurs du périmètre
  // (RLS de lecture large), donc sans `authorId === currentProfileId` on pourrait charger — puis
  // écraser à l'enregistrement — le rapport d'un autre rédacteur sur le même modèle/soir. `reset`
  // garde `creatorId`/`day` à l'identique → les `useWatch` ne changent pas → l'effet ne boucle
  // pas. Après un enregistrement, `router.refresh()` renouvelle `reports` → recharge idempotente.
  useEffect(() => {
    const found = reports.find(
      (r) => r.authorId === currentProfileId && r.creatorId === creatorId && r.day === day,
    )
    reset({
      creatorId,
      day,
      ca: found?.ca ?? 0,
      nonTraitees: found?.nonTraitees ?? 0,
      absents: found?.absents ?? 0,
      alerte: found?.alerte ?? '',
      lines: found
        ? found.lines.map((l) => ({
            chatterId: l.chatterId,
            aMarche: l.aMarche ?? '',
            aRegler: l.aRegler ?? '',
          }))
        : [],
    })
  }, [creatorId, day, reports, reset, currentProfileId])

  const chatterOptions = (chattersByModel[creatorId ?? ''] ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const onSubmit = handleSubmit(async (values) => {
    const res = await upsertPoliceReport(values)
    if (res.success) {
      toast.success('Rapport enregistré')
      router.refresh()
      return
    }
    // Erreur : reposer chaque `fieldError` sur son champ ; un champ imbriqué (lines) sans cible
    // directe remonte au global plutôt que d'être avalé silencieusement.
    let hidden: string | undefined
    for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
      const message = messages?.[0]
      if (!message) continue
      if (isHeaderField(field)) setError(field, { message })
      else hidden = message
    }
    const rootMessage = hidden ?? res.error
    setError('root', { message: rootMessage })
    toast.error(rootMessage)
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      {/* Modèle + date */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Modèle</Label>
          <Controller
            control={control}
            name="creatorId"
            render={({ field }) => (
              <Combobox
                options={models.map((m) => ({ value: m.id, label: m.name }))}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Choisir un modèle…"
                searchPlaceholder="Rechercher un modèle…"
                disabled={isSubmitting}
              />
            )}
          />
          {errors.creatorId && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.creatorId.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-day">Date</Label>
          <Input
            id="report-day"
            type="date"
            max={today}
            disabled={isSubmitting}
            className="h-9 w-full"
            {...register('day')}
          />
          {errors.day && <p className="text-sm text-red-600 dark:text-red-400">{errors.day.message}</p>}
        </div>
      </div>

      {/* Chiffres du modèle (saisis à la main : 0 = « rien à signaler ») */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-ca">CA du jour</Label>
          <Input
            id="report-ca"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={isSubmitting}
            {...register('ca')}
          />
          {errors.ca && <p className="text-sm text-red-600 dark:text-red-400">{errors.ca.message}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-non-traitees">Non traitées</Label>
          <Input
            id="report-non-traitees"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={isSubmitting}
            {...register('nonTraitees')}
          />
          {errors.nonTraitees && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.nonTraitees.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="report-absents">Absents</Label>
          <Input
            id="report-absents"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={isSubmitting}
            {...register('absents')}
          />
          {errors.absents && <p className="text-sm text-red-600 dark:text-red-400">{errors.absents.message}</p>}
        </div>
      </div>

      {/* Alerte du soir (optionnel) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="report-alerte">Alerte (optionnel)</Label>
        <Textarea
          id="report-alerte"
          rows={3}
          placeholder="Un point à remonter sur le modèle ce soir…"
          disabled={isSubmitting}
          {...register('alerte')}
        />
        {errors.alerte && <p className="text-sm text-red-600 dark:text-red-400">{errors.alerte.message}</p>}
      </div>

      {/* Suivi chatteur par chatteur (chatteurs du modèle sélectionné) */}
      <ReportLinesEditor
        control={control}
        register={register}
        errors={errors}
        chatterOptions={chatterOptions}
        modelSelected={!!creatorId}
        disabled={isSubmitting}
      />

      {errors.root && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.message}
        </p>
      )}

      <ActionButton type="submit" pending={isSubmitting} className="self-end">
        Enregistrer le rapport
      </ActionButton>
    </form>
  )
}
