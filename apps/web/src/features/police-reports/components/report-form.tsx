'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { frWeekdayLong } from '@glagency/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Stepper } from '@/components/ui/stepper'
import { ActionButton } from '@/components/action-button'
import { upsertPoliceReport } from '../actions'
import { reportInput, type ReportInput, type ReportFormValues } from '../schema'
import type { PoliceReport, ReportOption } from '../types'
import { ReportEtapeModele } from './report-etape-modele'
import { ReportLinesEditor } from './report-lines-editor'

// Champs de l'en-tête réellement rendus : un `fieldErrors` serveur sur l'un d'eux est reposé sur
// son champ ; le reste (ex. `lines` imbriqué, ou `day` qui vient de l'en-tête et n'a plus de champ)
// retombe sur le message global (leçon audit Membres : jamais d'erreur posée sur un champ invisible).
const HEADER_FIELDS = ['creatorId', 'ca', 'nonTraitees', 'absents', 'alerte'] as const
const isHeaderField = (field: string): field is (typeof HEADER_FIELDS)[number] =>
  (HEADER_FIELDS as readonly string[]).includes(field)

/**
 * Saisie du rapport du soir en DIALOG (« Ajouter un rapport ») — homogène avec le Tracker
 * sanctions (demande Benoit 2026-08-06) : la page ne garde que l'historique, la saisie s'ouvre
 * à la demande. Un modèle (le JOUR vient de l'en-tête, plus de champ date), les chiffres du
 * modèle saisis à la main, puis le suivi chatteur par chatteur. Upsert sur (auteur, modèle,
 * jour) → choisir un modèle déjà saisi RECHARGE sa fiche (pré-remplissage depuis `reports`) au
 * lieu de risquer un écrasement à blanc. Le dialog se FERME à l'enregistrement et s'ouvre
 * toujours VIERGE (règle app-wide du 2026-08-06 : une saisie abandonnée ne réapparaît pas).
 * Schéma zod PARTAGÉ avec le serveur ; un `Combobox`/`Select` passe par `Controller`.
 */
export function ReportForm({
  models,
  reports,
  chattersByModel,
  currentProfileId,
  day,
  open,
  onOpenChange,
  initialCreatorId,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — peuplent le Combobox chatteur sans
   *  appel serveur au changement de modèle. */
  chattersByModel: Record<string, ReportOption[]>
  /** Rédacteur courant. La fiche est keyée (auteur, modèle, jour) : le pré-remplissage doit
   *  matcher SON rapport, jamais celui d'un autre auteur du même modèle/soir (cf. useEffect). */
  currentProfileId: string
  /** Jour sélectionné dans l'en-tête (`?day=`) — fixe la date du rapport (plus de champ date). */
  day: string
  /** Ouverture PILOTÉE par le parent (reports-view) : bouton « Ajouter » OU crayon d'une ligne. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Modèle préchargé à l'ouverture (crayon → « Modifier ») — null = saisie vierge. */
  initialCreatorId?: string | null
}) {
  // 'use no memo' : formState de RHF est un Proxy à abonnement — mémoïsé par le React
  // Compiler, isSubmitting/errors gèlent (règle projet, mémoire forms-zod-rhf).
  'use no memo'
  const router = useRouter()
  // Stepper (demande Benoit) : étape 1 = LE MODÈLE (choix + chiffres du soir), étape 2 = LES
  // CHATTERS (suivi individuel). Le form est UNIQUE — changer d'étape ne perd rien.
  const [etape, setEtape] = useState<1 | 2>(1)
  // Triple générique (Input, Context, Output) : `reportInput` a des `.default()`/`.transform()`,
  // son type d'ENTRÉE diverge de `ReportInput` (la sortie) — même patron que `todo-dialog`.
  const form = useForm<ReportFormValues, unknown, ReportInput>({
    resolver: zodResolver(reportInput),
    defaultValues: {
      creatorId: '',
      day,
      ca: 0,
      nonTraitees: 0,
      absents: 0,
      alerte: '',
      lines: [],
    },
  })
  const { control, register, handleSubmit, reset, setError, trigger, formState } = form
  const { errors, isSubmitting } = formState

  // Retour à l'étape 1 à CHAQUE ouverture — ajustement d'état PENDANT le rendu (patron
  // `block-dialog`), pas dans un effet (react-hooks/set-state-in-effect).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setEtape(1)
  }

  // LA fiche d'un modèle pour ce soir : celle de MON rapport déjà chargé s'il existe (les 3
  // clés de l'upsert — auteur, modèle, jour : `reports` contient les rapports de TOUS les
  // auteurs du périmètre, sans `authorId === currentProfileId` on chargerait — puis écraserait —
  // celui d'un autre rédacteur), sinon une fiche vierge.
  const fiche = (id: string): ReportFormValues => {
    const found = reports.find(
      (r) => r.authorId === currentProfileId && r.creatorId === id && r.day === day,
    )
    return {
      creatorId: id,
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
    }
  }

  // Reset UNIQUEMENT à la TRANSITION fermé → ouvert (garde `prevOpen`, patron fiche membre) :
  // vierge par le bouton « Ajouter », préchargé par le crayon (`initialCreatorId`). L'audit
  // 2026-08-06 a remplacé ici DEUX effets qui se recouvraient — dont un keyé sur l'IDENTITÉ de
  // `reports`, qui re-resetait le formulaire (saisie comprise) à chaque revalidation serveur.
  // Le pré-remplissage au CHANGEMENT de modèle vit désormais dans le onChange du Combobox.
  const prevOpen = useRef(false)
  useEffect(() => {
    if (open && !prevOpen.current) reset(fiche(initialCreatorId ?? ''))
    prevOpen.current = open
    // `fiche` change d'identité à chaque rendu (elle capture `reports`) : la garde prevOpen fait
    // foi, les deps servent seulement à re-déclencher l'évaluation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCreatorId])

  const handleOpenChange = (next: boolean) => {
    if (!next && isSubmitting) return
    onOpenChange(next)
  }

  // useWatch (pas `watch`) : compatible React Compiler. Le modèle pilote la liste de chatteurs
  // proposée ; son CHANGEMENT recharge la fiche (onChange du Combobox, plus aucun effet).
  const creatorId = useWatch({ control, name: 'creatorId' })

  // Avancer vers l'étape 2 = étape 1 valide (mêmes règles zod que le submit) — partagé entre le
  // bouton « Continuer » et le clic sur la pastille 2 du stepper. Revenir est toujours libre.
  const versChatters = async () => {
    if (await trigger(['creatorId', 'ca', 'nonTraitees', 'absents', 'alerte'])) setEtape(2)
  }
  const onStepClick = (n: number) => {
    if (n === 1) setEtape(1)
    else void versChatters()
  }

  const chatterOptions = (chattersByModel[creatorId ?? ''] ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  // Le drapeau part dans une prop SÉPARÉE : `ComboOption` (`components/ui/combobox`) est une
  // primitive d'UI partagée, elle n'a pas à connaître les nouveaux arrivants de l'agence.
  const newByChatter = Object.fromEntries(
    (chattersByModel[creatorId ?? ''] ?? []).map((c) => [
      c.id,
      { isNew: c.isNew ?? false, arrivedAt: c.arrivedAt ?? null },
    ]),
  )

  const onSubmit = handleSubmit(async (values) => {
    const res = await upsertPoliceReport(values)
    if (res.success) {
      // Enregistré → la modal se ferme (le toast confirme ; rouvrir = repartir vierge).
      toast.success('Rapport enregistré')
      router.refresh()
      onOpenChange(false)
      return
    }
    // Erreur : reposer chaque `fieldError` sur son champ ; un champ imbriqué (lines) sans cible
    // directe remonte au global plutôt que d'être avalé silencieusement.
    let hidden: string | undefined
    for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
      const message = messages?.[0]
      if (!message) continue
      if (isHeaderField(field)) {
        setError(field, { message })
        // Le champ fautif vit à l'étape 1 : y retourner, sinon l'erreur est posée sur un
        // champ invisible (leçon audit Membres).
        setEtape(1)
      } else hidden = message
    }
    const rootMessage = hidden ?? res.error
    setError('root', { message: rootMessage })
    toast.error(rootMessage)
  })

  return (
    // Pas de DialogTrigger : l'ouverture vient du parent (bouton « Ajouter » OU crayon d'une
    // ligne de la table — reports-view).
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rapport du soir</DialogTitle>
          <DialogDescription className="capitalize">{frWeekdayLong(day)}</DialogDescription>
        </DialogHeader>
        {/* Stepper visuel (ui/stepper, maison — shadcn n'en a pas d'officiel). Pastille 2
            cliquable avec la même règle de validation que le bouton « Continuer ». */}
        <Stepper
          steps={[{ label: 'Modèle' }, { label: 'Chatters' }]}
          current={etape}
          onStepClick={onStepClick}
        />
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {etape === 1 ? (
            <div className="flex flex-col gap-4">
              <ReportEtapeModele
                control={control}
                register={register}
                errors={errors}
                models={models}
                disabled={isSubmitting}
                onModelChange={(id) => reset(fiche(id))}
              />
            <Button
              type="button"
              className="self-end"
              disabled={isSubmitting}
              onClick={() => void versChatters()}
            >
              Continuer — les chatters
            </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
            {/* Suivi chatteur par chatteur (chatteurs du modèle sélectionné) */}
            <ReportLinesEditor
              control={control}
              register={register}
              errors={errors}
              chatterOptions={chatterOptions}
              newByChatter={newByChatter}
              modelSelected={!!creatorId}
              disabled={isSubmitting}
            />

            {errors.root && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.root.message}
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => setEtape(1)}>
                ← Le modèle
              </Button>
              <ActionButton type="submit" pending={isSubmitting}>
                Enregistrer le rapport
              </ActionButton>
            </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
