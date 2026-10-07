'use client'

import { useState, useTransition } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { disconnectNotion, setRootPage } from '../actions'
import type { NotionConnectionView } from '../services/notion-connection'

/** Retours de l'OAuth (`/api/notion/*` → `?notion=…`). */
const NOTION_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  connecte: { text: 'Notion est connecté. Confirme la page racine ci-dessous.', ok: true },
  annule: { text: 'Connexion annulée dans Notion.', ok: false },
  refus: { text: 'Connexion refusée : réservée à un admin, hors mode « en tant que », dans le même navigateur.', ok: false },
  config: { text: 'L’application Notion n’est pas configurée (NOTION_OAUTH_CLIENT_ID / SECRET).', ok: false },
  erreur: { text: 'Notion a refusé l’échange : réessaie, ou préviens l’admin technique.', ok: false },
}

/** Carte admin : connecter / déconnecter Notion, confirmer la page racine. */
export function NotionConnectionCard({
  connection,
  rootCandidates,
  notion,
}: {
  connection: NotionConnectionView | null
  rootCandidates: Array<{ id: string; title: string }>
  notion: string | undefined
}) {
  const [pending, start] = useTransition()
  const [root, setRoot] = useState<string>(rootCandidates.length === 1 ? rootCandidates[0]!.id : '')
  const message = notion ? NOTION_MESSAGE[notion] : undefined

  const saveRoot = () =>
    start(async () => {
      const res = await setRootPage({ pageId: root })
      if (!res.success) return void toast.error(res.error)
      toast.success('Page racine enregistrée.')
    })
  const disconnect = () =>
    start(async () => {
      const res = await disconnectNotion({})
      if (!res.success) return void toast.error(res.error)
      toast.success('Notion déconnecté.')
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notion de l&apos;agence</CardTitle>
        <CardDescription>
          Réservé aux admins. Les managers importent ensuite les scripts rangés dans les dossiers des modèles.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {message && <p className={cn('text-sm', message.ok ? 'text-muted-foreground' : 'text-destructive')}>{message.text}</p>}
        {!connection ? (
          <div>
            <Button asChild size="sm">
              <a href="/api/notion/connect">Connecter Notion</a>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge className={cn('text-xs', STATUS_COLORS.positive)}>Connecté</Badge>
              <span className="font-medium">{connection.workspaceName}</span>
              <span className="text-muted-foreground">
                par {connection.connectedBy ?? '—'} le {frDateTimeParis(connection.connectedAt)}
              </span>
            </div>
            {!connection.rootPageId && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={root} onValueChange={setRoot}>
                  <SelectTrigger className="w-72" aria-label="Page racine">
                    <SelectValue placeholder="Page racine du Notion d’agence" />
                  </SelectTrigger>
                  <SelectContent>
                    {rootCandidates.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || 'Sans titre'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!root || pending} onClick={saveRoot}>
                  Confirmer
                </Button>
                {rootCandidates.length === 0 && (
                  <span className="text-sm text-muted-foreground">Aucune page partagée : reconnecte Notion en cochant la page racine.</span>
                )}
              </div>
            )}
            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={pending}>
                    Déconnecter
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Déconnecter Notion ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Plus personne ne pourra importer de script tant qu&apos;un admin n&apos;aura pas reconnecté Notion. Les imports déjà
                      faits restent dans l&apos;historique.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={disconnect}>Déconnecter</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
