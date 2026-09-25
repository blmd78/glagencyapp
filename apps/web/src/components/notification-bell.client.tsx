'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { callAction } from '@/lib/actions-client'
import { createClient } from '@/lib/supabase/client'
import { markNotificationsSeen } from '@/lib/notifications/actions'
import type { Notifications } from '@/lib/notifications/get-notifications'
import { frDayMonthShort, todayParis } from '@glagency/core'

// `components/` n'importe pas depuis `features/` (frontière ESLint) : format recopié en une ligne.
const dates = (s: string, e: string) => (s === e ? frDayMonthShort(s) : `${frDayMonthShort(s)} → ${frDayMonthShort(e)}`)

/**
 * La cloche de la barre du haut. Le layout `(dash)` ne se RE-RENDER PAS aux navigations `Link` —
 * seulement au hard load et aux réponses de Server Action (cf. commentaire de
 * `app/(dash)/layout.tsx`) — donc la `promise` reçue en prop n'est qu'une donnée INITIALE (hard
 * load). Tout le reste se rafraîchit CÔTÉ CLIENT, au client Supabase navigateur (RLS security
 * invoker, aucune fonction Vercel appelée) : à chaque changement de route (`usePathname`) et à
 * chaque ouverture du menu — sinon un utilisateur qui reste dans l'app ne voit jamais rien de
 * neuf avant un F5.
 *
 * L'ouverture est aussi le moment « vu » : une fois la donnée fraîche arrivée, si elle contient
 * du non-lu, la pastille retombe à 0 localement et `markNotificationsSeen` est appelé avec le
 * `at` du plus récent item AFFICHÉ (pas `now()` — cf. commentaire de l'action).
 */
export function NotificationBell({ promise }: { promise: Promise<Notifications | null> }) {
  const initial = use(promise)
  const [data, setData] = useState<Notifications | null>(initial)
  const [supabase] = useState(() => createClient())
  const pathname = usePathname()
  // Compteur de requêtes partagé : une réponse qui arrive après qu'un refresh plus récent a
  // démarré est une réponse PÉRIMÉE — on l'ignore (jamais d'écrasement d'un état plus frais par
  // un aller-retour réseau plus lent parti avant).
  const requestId = useRef(0)

  const refresh = useCallback(
    (onFresh?: (fresh: Notifications) => void) => {
      const id = ++requestId.current
      void supabase
        .rpc('agency_notifications', { p_limit: 10 })
        .then(({ data: fresh, error }) => {
          // Échec réseau/RPC ou réponse périmée : on garde l'affichage courant EN SILENCE — la
          // cloche ne doit jamais clignoter une erreur.
          if (error || id !== requestId.current) return
          const parsed = fresh as unknown as Notifications
          setData(parsed)
          onFresh?.(parsed)
        })
    },
    [supabase],
  )

  // Le premier rendu a déjà la donnée du hard load (`initial`, ci-dessus) : ne pas la redemander
  // aussitôt. Seuls les changements de route SUIVANTS déclenchent un refresh.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    refresh()
  }, [pathname, refresh])

  if (!data) return null
  const unread = data.unread

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        refresh((fresh) => {
          if (fresh.unread > 0) {
            // `items[0]` existe forcément : `unread > 0` veut dire qu'au moins un item est plus
            // récent que la dernière ouverture, et `items` est trié par `at` DESC — c'est donc
            // le plus récent affiché, exactement ce que « vu » doit couvrir.
            setData({ ...fresh, unread: 0 })
            void callAction(markNotificationsSeen({ seenUpTo: fresh.items[0].at }))
          }
        })
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={unread ? `${unread} nouveauté(s)` : 'Nouveautés'}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Nouveautés</DropdownMenuLabel>
        {data.items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Aucune nouveauté.</p>
        ) : (
          data.items.map((n) => (
            <DropdownMenuItem key={`${n.kind}-${n.id}`} asChild>
              <Link href={{ pathname: '/chatter/agence', query: { mois: n.startDate.slice(0, 7) } }} className="flex flex-col items-start gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {n.kind === 'reminder' ? (n.startDate === todayParis() ? 'C’est aujourd’hui' : 'Rappel') : 'Nouvel événement'}
                </span>
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{dates(n.startDate, n.endDate)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem asChild>
          <Link href="/chatter/agence" className="mt-1 justify-center text-sm font-medium">
            Tout voir dans Agence
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
