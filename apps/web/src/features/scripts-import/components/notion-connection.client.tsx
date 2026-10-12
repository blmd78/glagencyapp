'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { frDateTimeParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { disconnectNotion } from '../actions'
import type { NotionConnectionView } from '../services/notion-connection'

/** Retours de l'OAuth (`/api/notion/*` → `?notion=…`). */
const NOTION_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  connecte: { text: 'Espace Notion connecté : ses pages partagées sont listées ci-dessous.', ok: true },
  annule: { text: 'Connexion annulée dans Notion.', ok: false },
  refus: { text: 'Connexion refusée : réservée aux admins et à l’encadrement, hors mode « en tant que », dans le même navigateur.', ok: false },
  config: { text: 'L’application Notion n’est pas configurée (NOTION_OAUTH_CLIENT_ID / SECRET).', ok: false },
  erreur: { text: 'Notion a refusé l’échange : réessaie, ou préviens l’admin technique.', ok: false },
}

/**
 * Espaces Notion de la personne (0192) : ceux qu'elle a connectés (privés, ou partagés si elle est admin)
 * et ceux partagés par un admin. Chacun connecte le sien ; les pages se choisissent dans Notion au moment
 * de connecter — rien à confirmer ici.
 */
export function NotionConnectionCard({
  connections,
  notion,
  isAdmin,
}: {
  connections: NotionConnectionView[]
  notion: string | undefined
  isAdmin: boolean
}) {
  const message = notion ? NOTION_MESSAGE[notion] : undefined
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Espaces Notion</CardTitle>
        <CardDescription>
          Connecte ton Notion et coche, dans Notion, les pages de tes scripts : ils s&apos;affichent aussitôt ci-dessous.{' '}
          {isAdmin
            ? 'Un espace que tu connectes est partagé avec toute l’équipe.'
            : 'Ton espace n’est visible que par toi ; ceux connectés par un admin sont partagés avec toute l’équipe.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {message && <p className={cn('text-sm', message.ok ? 'text-muted-foreground' : 'text-destructive')}>{message.text}</p>}
        {connections.map((c) => (
          <ConnectionRow key={c.id} connection={c} />
        ))}
        <div>
          <Button asChild size="sm" variant={connections.length ? 'outline' : 'default'}>
            <a href="/api/notion/connect">{connections.some((c) => c.mine) ? 'Connecter un autre espace' : 'Connecter mon Notion'}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionRow({ connection }: { connection: NotionConnectionView }) {
  const [pending, start] = useTransition()
  const disconnect = () =>
    start(async () => {
      const res = await disconnectNotion({ connectionId: connection.id })
      if (!res.success) return void toast.error(res.error)
      toast.success(`${connection.workspaceName} déconnecté.`)
    })
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Badge className={cn('text-xs', STATUS_COLORS.positive)}>Connecté</Badge>
      <span className="font-medium">{connection.workspaceName}</span>
      <span className="text-muted-foreground">
        {connection.shared ? 'partagé avec l’équipe' : 'privé'} · par {connection.mine ? 'toi' : (connection.connectedBy ?? '—')} le{' '}
        {frDateTimeParis(connection.connectedAt)}
      </span>
      {connection.removable && <DisconnectButton connection={connection} pending={pending} onConfirm={disconnect} />}
    </div>
  )
}

/** Bouton « Déconnecter » et sa confirmation — seulement pour un espace que la personne peut retirer (`removable`). */
function DisconnectButton({ connection, pending, onConfirm }: { connection: NotionConnectionView; pending: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          Déconnecter
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Déconnecter {connection.workspaceName} ?</AlertDialogTitle>
          <AlertDialogDescription>
            {connection.shared
              ? 'Les scripts que cette connexion donne à l’équipe ne seront plus importables tant qu’elle n’est pas reconnectée.'
              : 'Les scripts de cet espace ne seront plus importables tant que tu ne le reconnectes pas.'}{' '}
            Les imports déjà faits restent dans l&apos;historique.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Déconnecter</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
