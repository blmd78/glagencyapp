'use client'

import { use, useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Bell, BellRing, CalendarPlus, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { callAction } from '@/lib/actions-client'
import { createClient } from '@/lib/supabase/client'
import { markNotificationsSeen } from '@/lib/notifications/actions'
import { setUnread } from '@/lib/notifications/unread-store'
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
 * L'ouverture — ou l'arrivée sur Agence — est aussi le moment « vu » : une fois la donnée fraîche arrivée, si elle contient
 * du non-lu, la pastille retombe à 0 localement et `markNotificationsSeen` est appelé avec le
 * `at` du plus récent item AFFICHÉ (pas `now()` — cf. commentaire de l'action).
 *
 * Sur ce chemin d'ouverture, deux cas dégradés sont couverts EXPRÈS (l'écriture est monotone
 * côté action, un envoi tardif ne recule jamais) :
 * - une réponse PÉRIMÉE (un refresh plus récent a démarré entre-temps, ex. clic sur un item avant
 *   le retour du refresh d'ouverture) ne doit plus faire sauter `markNotificationsSeen` — seul
 *   l'AFFICHAGE reste gardé par `requestId` ;
 * - un refresh d'ouverture en ÉCHEC retombe sur la donnée déjà affichée : si elle a du non-lu, la
 *   pastille tombe à 0 et `markNotificationsSeen` part avec son `at` le plus récent.
 */
export function NotificationBell({ promise }: { promise: Promise<Notifications | null> }) {
  const initial = use(promise)
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const [data, setData] = useState<Notifications | null>(initial)
  // Miroir synchrone de `data`, lu par le filet d'échec ci-dessous : `refresh` est mémoïsé sur
  // `[supabase]` (essentiellement immuable), donc une fermeture directe sur `data` y resterait
  // celle du premier rendu.
  const dataRef = useRef(initial)
  const [supabase] = useState(() => createClient())
  const pathname = usePathname()
  // Compteur de requêtes partagé : une réponse qui arrive après qu'un refresh plus récent a
  // démarré est une réponse PÉRIMÉE — on ignore son AFFICHAGE (jamais d'écrasement d'un état plus
  // frais par un aller-retour réseau plus lent parti avant), mais pas forcément son « vu ».
  const requestId = useRef(0)

  const updateData = useCallback((next: Notifications) => {
    dataRef.current = next
    setData(next)
  }, [])

  const refresh = useCallback(
    (onFresh?: (fresh: Notifications, stale: boolean) => void, onError?: () => void) => {
      const id = ++requestId.current
      void supabase
        .rpc('agency_notifications', { p_limit: 10 })
        .then(({ data: fresh, error }) => {
          // Échec réseau/RPC : on garde l'affichage courant EN SILENCE — la cloche ne doit jamais
          // clignoter une erreur — sauf filet dédié fourni par l'appelant (ouverture).
          if (error) {
            if (id === requestId.current) onError?.()
            return
          }
          const stale = id !== requestId.current
          const parsed = fresh as unknown as Notifications
          if (!stale) updateData(parsed)
          onFresh?.(parsed, stale)
        })
    },
    [supabase, updateData],
  )

  const markSeen = useCallback(() => {
    refresh(
      (fresh, stale) => {
        if (fresh.unread > 0) {
          // `items[0]` existe forcément : `unread > 0` veut dire qu'au moins un item est plus
          // récent que la dernière ouverture, et `items` est trié par `at` DESC — c'est donc
          // le plus récent affiché, exactement ce que « vu » doit couvrir. Le « vu » part
          // MÊME PÉRIMÉ (écriture monotone, un envoi tardif ne recule jamais) — seul
          // l'affichage attend une réponse encore fraîche.
          if (!stale) updateData({ ...fresh, unread: 0 })
          void callAction(markNotificationsSeen({ seenUpTo: fresh.items[0].at }))
        }
      },
      () => {
        // Le refresh d'ouverture a échoué : filet sur la donnée déjà affichée, même logique
        // (pastille à 0 + `markNotificationsSeen` sur son item le plus récent).
        const current = dataRef.current
        if (current && current.unread > 0) {
          updateData({ ...current, unread: 0 })
          void callAction(markNotificationsSeen({ seenUpTo: current.items[0].at }))
        }
      },
    )
  }, [refresh, updateData])

  // Le premier rendu a déjà la donnée du hard load (`initial`, ci-dessus) : ne pas la redemander
  // aussitôt. Seuls les changements de route SUIVANTS déclenchent un refresh — sauf sur Agence,
  // hard load compris : y arriver, c'est voir toutes les nouveautés, donc le même « vu » que
  // l'ouverture de la cloche (sinon la pastille de la sidebar survivrait au clic qu'elle appelle).
  const mounted = useRef(false)
  useEffect(() => {
    const first = !mounted.current
    mounted.current = true
    if (pathname === '/chatter/agence') markSeen()
    else if (!first) refresh()
  }, [pathname, refresh, markSeen])

  // La pastille « Agence » de la sidebar lit ce même non-lu (cf. `unread-store.ts`).
  useEffect(() => {
    setUnread(data ? data.unread : null)
    return () => setUnread(null)
  }, [data])

  if (!data) return null
  const unread = data.unread
  const today = todayParis()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) markSeen()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={unread ? `${unread} nouveauté(s)` : 'Nouveautés'}>
          <Bell aria-hidden="true" className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-hidden rounded-xl p-3 sm:w-96 motion-reduce:animate-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 pl-2">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Notifications</h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted-foreground">Événements et rappels de l’agence.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full text-muted-foreground" aria-label="Fermer les notifications" onClick={() => setOpen(false)}>
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        {data.items.length === 0 ? (
          <div className="flex min-h-0 flex-col items-center gap-3 overflow-y-auto px-5 py-8 text-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bell aria-hidden="true" className="size-5 text-muted-foreground" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium">Aucune nouveauté pour le moment</p>
              <p className="text-sm leading-relaxed text-muted-foreground">Les événements et leurs rappels apparaîtront ici.</p>
            </div>
          </div>
        ) : (
          <ul aria-label="Dernières notifications" className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-1">
            {data.items.map((n) => {
              const [day, month] = frDayMonthShort(n.startDate).split(' ')
              const reminder = n.kind === 'reminder'
              const Icon = reminder ? BellRing : CalendarPlus
              return (
                <li key={`${n.kind}-${n.id}`}>
                  <Link
                    href={{ pathname: '/chatter/agence', query: { mois: n.startDate.slice(0, 7) } }}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className="group flex items-start gap-3 rounded-xl bg-muted/40 p-3 outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
                  >
                    <span aria-hidden="true" className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-lg bg-background px-1 py-2.5">
                      <span className="text-xl font-semibold leading-none tabular-nums">{day}</span>
                      <span className="text-xs font-medium uppercase text-muted-foreground">{month}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                        {reminder ? (n.startDate === today ? 'C’est aujourd’hui' : 'Rappel') : 'Nouvel événement'}
                      </span>
                      <span className="break-words text-sm font-semibold leading-snug">{n.title}</span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{dates(n.startDate, n.endDate)}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 self-center text-muted-foreground group-hover:text-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <Button asChild variant="secondary" className="min-h-11 w-full shrink-0 justify-between rounded-lg px-4">
          <Link href="/chatter/agence" prefetch={false} onClick={() => setOpen(false)}>
            Voir tous les événements
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  )
}
