'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { prepareImport } from '../actions'
import type { CreatorOption, ScriptFolder } from '../services/get-scripts-import'

/**
 * Choix du script dans le Notion d'agence : les dossiers reconnus (modèle de ton périmètre) d'abord,
 * puis « Autres dossiers ». La modèle est présélectionnée d'après le dossier, toujours modifiable.
 */
export function ScriptPicker({ folders, creators }: { folders: ScriptFolder[]; creators: CreatorOption[] }) {
  const known = folders.filter((f) => f.creatorId)
  const others = folders.filter((f) => !f.creatorId)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scripts du Notion</CardTitle>
        <CardDescription>
          « Préparer » lit le script et le convertit (1 à 2 min) : rien n&apos;est envoyé à MyPuls avant ta relecture.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {folders.length === 0 && <p className="text-sm text-muted-foreground">Aucun dossier sous la page racine.</p>}
        {creators.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune modèle ne t&apos;est assignée : demande à un admin.</p>
        )}
        {known.map((f) => (
          <FolderBlock key={f.id} folder={f} creators={creators} />
        ))}
        {others.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-muted-foreground">Autres dossiers</h3>
            {others.map((f) => (
              <FolderBlock key={f.id} folder={f} creators={creators} />
            ))}
          </div>
        )}
        {creators.length > 0 && <PasteLink creators={creators} />}
      </CardContent>
    </Card>
  )
}

/** « Préparer » partagé par la liste et le lien collé : lecture, conversion, puis le rapport. */
function usePrepare() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const prepare = (notionPageId: string, creatorId: string) =>
    start(async () => {
      try {
        const res = await prepareImport({ notionPageId, creatorId })
        if (!res.success) return void toast.error(res.error)
        toast.success('Script préparé : relis le rapport.')
        router.push(`/chatter/import-scripts?import=${res.data.importId}`)
      } catch {
        // Échec de transport (durée maximale, connexion coupée) : rien n'est écrit chez MyPuls ;
        // la préparation a pu aboutir côté serveur — l'historique le dira.
        toast.error('Préparation coupée avant la réponse — regarde l’historique, sinon relance.')
        router.refresh()
      }
    })
  return { pending, prepare }
}

/** Secours : un script rangé ailleurs (sous-dossier…) se prépare par son lien Notion. */
function PasteLink({ creators }: { creators: CreatorOption[] }) {
  const { pending, prepare } = usePrepare()
  const [link, setLink] = useState('')
  const [creatorId, setCreatorId] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Script rangé ailleurs ? Colle son lien Notion</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-64 flex-1"
          placeholder="https://www.notion.so/…"
          aria-label="Lien Notion du script"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Select value={creatorId} onValueChange={setCreatorId}>
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
        <Button size="sm" disabled={!link.trim() || !creatorId || pending} onClick={() => prepare(link, creatorId)}>
          {pending && <Spinner />}
          Préparer
        </Button>
      </div>
    </div>
  )
}

function FolderBlock({ folder, creators }: { folder: ScriptFolder; creators: CreatorOption[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{folder.title}</h4>
      {folder.scripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun script.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {folder.scripts.map((s) => (
            <ScriptRow key={s.id} script={s} defaultCreator={folder.creatorId} creators={creators} />
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
}: {
  script: { id: string; title: string }
  defaultCreator: string | null
  creators: CreatorOption[]
}) {
  const { pending, prepare: run } = usePrepare()
  const [creatorId, setCreatorId] = useState(defaultCreator ?? '')
  const prepare = () => run(script.id, creatorId)
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
