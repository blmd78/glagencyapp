'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { sendImport } from '../actions'
import { canSend, importStatus } from '../rules'
import type { ImportDetail } from '../services/get-scripts-import'
import { STATUS_BADGE } from './status-badge'

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

const KIND: Record<ImportDetail['sources'][number]['kind'], string> = {
  page: 'Page',
  'page liée': 'Page liée',
  'sous-page': 'Sous-page',
  pdf: 'PDF',
  'google doc': 'Google Doc',
  'google drive': 'Google Drive',
  lien: 'Lien',
  image: 'Image',
  vidéo: 'Vidéo',
  audio: 'Audio',
  fichier: 'Fichier',
  base: 'Base',
}

/** Liste du rapport : un titre, une puce par ligne — mêmes styles que les ajustements. */
function ReportList({ title, items, muted = true }: { title: string; items: string[]; muted?: boolean }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      <ul className={cn('list-disc pl-5', muted && 'text-muted-foreground')}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Rapport de l'import choisi (`?import=`) : résumé, sources lues ou non, ce que le script laisse à
 * l'équipe (vocaux, messages à écrire, déclenchements, Brief IA), ajustements, erreurs, puis « Envoyer ».
 */
export function ImportReport({ current, viewerId }: { current: ImportDetail; viewerId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const s = current.summary
  const status = importStatus(current, new Date())
  const sendable = canSend(current, viewerId)
  const read = current.sources.filter((x) => x.status === 'lu')
  const unread = current.sources.filter((x) => x.status === 'non lu')

  const send = () =>
    start(async () => {
      try {
        const res = await sendImport({ importId: current.id })
        if (!res.success) return void toast.error(res.error)
        const media = res.data.mediaNote ? ` — ${res.data.mediaNote}` : ''
        toast.success(`Script ${res.data.mypulsScriptId} créé, désactivé${media} : relis-le dans le Studio MyPuls puis active-le.`)
      } catch {
        // Échec de transport (durée maximale atteinte, connexion coupée) : l'envoi a pu avancer côté
        // serveur — on relit la ligne, le rapport dira « interrompu » et quel script vérifier.
        toast.error('Envoi coupé avant la réponse — le rapport dit où il en est.')
        router.refresh()
      }
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          {current.notionTitle}
          <Badge className={cn('text-xs', STATUS_BADGE[status])}>{status}</Badge>
        </CardTitle>
        <CardDescription>Modèle : {current.creatorName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p>
          {plural(s.messages, 'message')} · {plural(s.branches, 'embranchement')} · {s.paid} PPV · total {s.totalPrice} €
        </p>
        <p className="text-muted-foreground">
          {s.sequence
            ? 'Mode séquence : le chat déroule le script, les embranchements deviennent des boutons de réponse.'
            : 'Mode banque de messages : choisis à la main, sans ordre imposé.'}
        </p>
        {s.pendingMedia > 0 && (
          <p>
            {plural(s.pendingMedia, 'média')} nommé{s.pendingMedia > 1 ? 's' : ''} dans le script : rattaché{s.pendingMedia > 1 ? 's' : ''} à l&apos;envoi
            s&apos;il{s.pendingMedia > 1 ? 's portent' : ' porte'} ce titre dans MyM (collection du même nom que le script), sinon « 🖼️ À RATTACHER »
            dans le Studio — un vocal sans audio part à l&apos;écrit en attendant.
          </p>
        )}
        {current.sources.length > 1 && (
          <ReportList title="Lu pour la conversion" items={read.map((x) => `${KIND[x.kind]} « ${x.label} »`)} />
        )}
        <ReportList title="Non lu" muted={false} items={unread.map((x) => `${KIND[x.kind]} « ${x.label} » : ${x.reason ?? 'non lu'}`)} />
        <ReportList
          title={
            current.toCompleteWritten
              ? 'Écrits par l’IA à la place des « ✏️ À COMPLÉTER » (titre « ✍️ écrit par l’IA ») — à relire avant d’activer'
              : 'À écrire dans le Studio avant d’activer'
          }
          muted={false}
          items={current.toComplete.map((t) => `${t.where} : ${t.hint}`)}
        />
        <ReportList
          title="Vocaux : rattachés depuis MyM s’ils y portent leur titre (« VOCAL 1 »), sinon envoyés à l’écrit en attendant l’audio"
          items={current.voiceNotes.map((v) => `${v.label} : « ${v.text} »${v.direction ? ` — ${v.direction}` : ''}`)}
        />
        <ReportList
          title="Messages automatiques : en tête du script, le déclenchement se règle dans l’Auto-DM"
          items={current.autoMessages.map((a) => `${a.trigger} → « ${a.message} »`)}
        />
        {current.aiBrief && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">Brief IA (pour Aurel, jamais montré au fan)</p>
            <p className="whitespace-pre-line text-muted-foreground">{current.aiBrief}</p>
          </div>
        )}
        {current.notes.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">{plural(current.notes.length, 'ajustement')}</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {current.notes.map((n, i) => (
                <li key={i}>
                  {n.where} : {n.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {current.errors.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-destructive">{plural(current.errors.length, 'erreur')} — rien ne peut être envoyé</p>
            <ul className="list-disc pl-5">
              {current.errors.map((e, i) => (
                <li key={i}>
                  {e.where} : {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          status === 'prêt' && <p className="text-muted-foreground">0 erreur — prêt à envoyer.</p>
        )}

        {status === 'envoyé' && current.mypulsScriptId && (
          <p>
            Script {current.mypulsScriptId} créé, désactivé.{' '}
            <a className="underline" href="https://mypuls.app/scripts" target="_blank" rel="noreferrer">
              Ouvrir le Studio MyPuls
            </a>
          </p>
        )}
        {status === 'envoyé' && current.mediaNote && <p className="text-muted-foreground">Médias : {current.mediaNote}.</p>}
        {current.failureMessage && <p className="whitespace-pre-line text-destructive">{current.failureMessage}</p>}

        {sendable.ok && (
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={pending} onClick={send}>
              {pending && <Spinner />}
              Envoyer dans MyPuls
            </Button>
            {pending && <span className="text-muted-foreground">Envoi en cours — ne ferme pas la page (1 à 2 min).</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
