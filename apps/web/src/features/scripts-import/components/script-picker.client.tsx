'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { CollapsibleSection } from '@/components/collapsible-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { prepareImport, prepareStatus } from '../actions'
import { prepareImportSchema } from '../schema'
import type { CreatorOption, NotionWorkspaceView, ScriptFolder } from '../services/get-scripts-import'
import { waitPrepared } from '../wait-prepared'

/**
 * Choix du script : pour chaque espace Notion connecté, les scripts dont la modèle est reconnue
 * (dossier parent ou fin du titre « … · Prénom », cf. `organizeNotionPages`) d'abord, puis toutes les
 * autres pages partagées, repliées. La modèle présélectionnée reste modifiable.
 */
export function ScriptPicker({ workspaces, creators }: { workspaces: NotionWorkspaceView[]; creators: CreatorOption[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scripts du Notion</CardTitle>
        <CardDescription>
          « Préparer » lit le script et le convertit (1 à 2 min) : rien n&apos;est envoyé à MyPuls avant ta relecture.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {creators.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune modèle ne t&apos;est assignée : demande à un admin.</p>
        )}
        {workspaces.map((w) => (
          <WorkspaceBlock key={w.id} workspace={w} creators={creators} titled={workspaces.length > 1} />
        ))}
        {creators.length > 0 && <PasteLink creators={creators} />}
      </CardContent>
    </Card>
  )
}

function WorkspaceBlock({ workspace: w, creators, titled }: { workspace: NotionWorkspaceView; creators: CreatorOption[]; titled: boolean }) {
  const othersCount = w.others.reduce((n, f) => n + f.scripts.length, 0)
  return (
    <div className="flex flex-col gap-4">
      {titled && <h3 className="text-sm font-medium text-muted-foreground">{w.workspaceName}</h3>}
      {w.error ? (
        <p className="text-sm text-destructive">Lecture Notion impossible : {w.error}</p>
      ) : w.recognized.length === 0 && othersCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune page partagée avec le CRM dans cet espace : dans Notion, Partager → Connexions → GL Agency CRM.
        </p>
      ) : (
        w.recognized.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun script reconnu (dossier au nom de la modèle, ou titre « … · Prénom ») : choisis la modèle à la main dans « Autres
            pages ».
          </p>
        )
      )}
      {w.truncated && <p className="text-sm text-muted-foreground">Plus de 1 000 pages partagées : la liste est incomplète.</p>}
      {w.recognized.map((f) => (
        <FolderBlock key={f.id} folder={f} creators={creators} connectionId={w.id} />
      ))}
      {othersCount > 0 && (
        <CollapsibleSection
          contentClassName="flex flex-col gap-4 p-3"
          trigger={
            <>
              Autres pages
              <span className="text-sm font-normal text-muted-foreground">({othersCount})</span>
            </>
          }
        >
          {w.others.map((f) => (
            <FolderBlock key={f.id} folder={f} creators={creators} connectionId={w.id} />
          ))}
        </CollapsibleSection>
      )}
    </div>
  )
}

/**
 * Réponse de « Préparer » coupée (connexion perdue à 60 s, test réel du 2026-10-08) : la préparation
 * continue côté serveur. On relit sa clé (`waitPrepared`) et on ouvre le rapport dès qu'il est prêt —
 * le bouton reste occupé pendant l'attente. Rien n'est relancé, rien n'est écrit chez MyPuls.
 */
async function afterCut(requestId: string, router: ReturnType<typeof useRouter>) {
  toast.info('Réponse coupée : la préparation continue, le rapport s’ouvre dès qu’il est prêt.')
  const outcome = await waitPrepared(async () => {
    const res = await prepareStatus({ requestId })
    if (!res.success) throw new Error(res.error)
    return res.data
  })
  if (outcome.status === 'done') {
    toast.success('Script préparé : relis le rapport.')
    return router.push(`/chatter/import-scripts?import=${outcome.importId}`)
  }
  toast.error(
    outcome.status === 'failed'
      ? 'La préparation n’a pas abouti — relance « Préparer ».'
      : 'Préparation toujours en cours — regarde l’historique dans un moment.',
  )
  router.refresh()
}

/** « Préparer » partagé par la liste et le lien collé : lecture, conversion, puis le rapport. */
function usePrepare() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const prepare = (notionPageId: string, creatorId: string, connectionId: string) =>
    start(async () => {
      // Une clé par clic : les copies de cette requête (renvoi du navigateur) ne relancent pas la conversion.
      const requestId = crypto.randomUUID()
      try {
        const res = await prepareImport({ notionPageId, creatorId, connectionId, requestId })
        if (!res.success) return void toast.error(res.error)
        toast.success('Script préparé : relis le rapport.')
        router.push(`/chatter/import-scripts?import=${res.data.importId}`)
      } catch {
        await afterCut(requestId, router)
      }
    })
  return { pending, prepare }
}
/**
 * Lien collé (secours : page non listée) — cherché dans chaque espace connecté. Formulaire RHF
 * (`compta-link-dialog.tsx` pour le patron) : variante saisie de `prepareImportInput` (sans `requestId`, ajouté
 * au clic), qui normalise le lien en id de page. `'use no memo'` : le React Compiler casse `formState` de RHF.
 * Triple générique : le schéma transforme le lien (entrée ≠ sortie).
 */
function PasteLink({ creators }: { creators: CreatorOption[] }) {
  'use no memo'
  const router = useRouter()
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof prepareImportSchema>, unknown, z.output<typeof prepareImportSchema>>({
    resolver: zodResolver(prepareImportSchema),
    defaultValues: { notionPageId: '', creatorId: '' },
  })
  // `useWatch` et non `watch()` (react-hooks/incompatible-library) — même choix que compta-link-dialog.
  const creatorId = useWatch({ control, name: 'creatorId' })

  const submit = handleSubmit(async (values) => {
    const requestId = crypto.randomUUID()
    try {
      const res = await prepareImport({ ...values, requestId })
      if (!res.success) {
        const field = res.fieldErrors?.notionPageId?.[0]
        if (field) setError('notionPageId', { message: field })
        setError('root', { message: res.error })
        toast.error(res.error)
        return
      }
      toast.success('Script préparé : relis le rapport.')
      router.push(`/chatter/import-scripts?import=${res.data.importId}`)
    } catch {
      await afterCut(requestId, router)
    }
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Script rangé ailleurs ? Colle son lien Notion</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-64 flex-1"
          placeholder="https://www.notion.so/…"
          aria-label="Lien Notion du script"
          aria-invalid={!!errors.notionPageId}
          disabled={isSubmitting}
          {...register('notionPageId')}
        />
        <Controller
          control={control}
          name="creatorId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
              <SelectTrigger className="w-48" aria-label="Modèle pour le lien collé">
                <SelectValue placeholder="Modèle" />
              </SelectTrigger>
              <SelectContent>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <ActionButton type="submit" size="sm" pending={isSubmitting} disabled={!creatorId}>
          Préparer
        </ActionButton>
      </div>
      {errors.notionPageId && <p className="text-xs text-red-600 dark:text-red-400">{errors.notionPageId.message}</p>}
      {errors.root && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errors.root.message}
        </p>
      )}
    </form>
  )
}

function FolderBlock({ folder, creators, connectionId }: { folder: ScriptFolder; creators: CreatorOption[]; connectionId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{folder.title}</h4>
      {folder.scripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun script.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {folder.scripts.map((s) => (
            <ScriptRow key={s.id} script={s} defaultCreator={folder.creatorId} creators={creators} connectionId={connectionId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ScriptRow({
  script,
  defaultCreator,
  creators,
  connectionId,
}: {
  script: { id: string; title: string }
  defaultCreator: string | null
  creators: CreatorOption[]
  connectionId: string
}) {
  const { pending, prepare: run } = usePrepare()
  const [creatorId, setCreatorId] = useState(defaultCreator ?? '')
  const prepare = () => run(script.id, creatorId, connectionId)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-sm">{script.title || 'Sans titre'}</span>
      <div className="flex items-center gap-2">
        <Select value={creatorId} onValueChange={setCreatorId}>
          <SelectTrigger className="w-48" aria-label={`Modèle pour ${script.title}`}>
            <SelectValue placeholder="Modèle" />
          </SelectTrigger>
          <SelectContent>
            {creators.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!creatorId || pending} onClick={prepare}>
          {pending && <Spinner />}
          Préparer
        </Button>
      </div>
    </li>
  )
}
