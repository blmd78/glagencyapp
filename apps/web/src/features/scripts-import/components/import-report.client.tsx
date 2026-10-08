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

/** Rapport de l'import choisi (`?import=`) : résumé, ajustements, erreurs, puis « Envoyer ». */
export function ImportReport({ current, viewerId }: { current: ImportDetail; viewerId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const s = current.summary
  const status = importStatus(current, new Date())
  const sendable = canSend(current, viewerId)

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
            dans le Studio.
          </p>
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
