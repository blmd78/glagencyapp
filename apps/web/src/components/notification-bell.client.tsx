'use client'

import { use, useState } from 'react'
import Link from 'next/link'
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
import { markNotificationsSeen } from '@/lib/notifications/actions'
import type { Notifications } from '@/lib/notifications/get-notifications'
import { frDayMonthShort } from '@glagency/core'

// `components/` n'importe pas depuis `features/` (frontière ESLint) : format recopié en une ligne.
const dates = (s: string, e: string) => (s === e ? frDayMonthShort(s) : `${frDayMonthShort(s)} → ${frDayMonthShort(e)}`)

/**
 * La cloche de la barre du haut. La pastille retombe à 0 à l'OUVERTURE du menu (décision Benoit
 * 2026-09-25). « Vidé » est rattaché à l'OBJET de données, pas à un booléen : le layout re-rend à
 * chaque navigation avec une nouvelle promesse, et une nouveauté arrivée depuis doit se revoir.
 */
export function NotificationBell({ promise }: { promise: Promise<Notifications | null> }) {
  const data = use(promise)
  const [clearedFor, setClearedFor] = useState<Notifications | null>(null)
  if (!data) return null
  const unread = clearedFor === data ? 0 : data.unread

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open || unread === 0) return
        setClearedFor(data)
        void callAction(markNotificationsSeen())
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
                <span className="text-xs text-muted-foreground">{n.kind === 'reminder' ? 'C’est aujourd’hui' : 'Nouvel événement'}</span>
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
