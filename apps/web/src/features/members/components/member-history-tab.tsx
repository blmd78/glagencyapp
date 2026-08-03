'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { MemberPanel } from '@/hooks/use-member-panel'
import { cn } from '@/lib/utils'
import type { MemberEvent } from '../types'
import { KIND_LABEL, KIND_TONE } from './event-kind'

/** Date ET heure en fuseau Paris EXPLICITE : `at` est un timestamptz — sans `timeZone`, le SSR
 *  (UTC) et un navigateur parisien rendraient un jour différent (mismatch d'hydratation). */
const FR_DATETIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Onglet « Historique » du dialog membre (0104) — la timeline de CETTE personne.
 *
 * Pas de DataTable ici, contrairement à l'onglet Activité : dans un dialog étroit, six colonnes ne
 * tiennent pas, et « Membre » y répéterait la même valeur sur chaque ligne. Les deux surfaces
 * partagent ce qui compte — les libellés et les teintes (`event-kind.ts`) — et rien d'autre.
 *
 * Le chargement est déclenché par le dialog depuis `onValueChange` des onglets, c'est-à-dire un
 * ÉVÉNEMENT et non un effet : patron `useMemberPanel` (partagé avec les piles de noms du Planning
 * et du Dashboard), et la seule forme que la règle `react-hooks/set-state-in-effect` accepte.
 * Conséquence voulue : ouvrir une fiche pour changer un shift ne paie aucune lecture d'historique.
 */
export function MemberHistoryTab({ panel }: { panel: MemberPanel<MemberEvent[]> | null }) {
  if (panel?.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {panel.error}
      </p>
    )

  if (!panel?.data)
    return (
      <div role="status" className="flex flex-col gap-2 py-2">
        <span className="sr-only">Chargement de l’historique…</span>
        <Skeleton aria-hidden="true" className="h-6 w-full" />
        <Skeleton aria-hidden="true" className="h-6 w-5/6" />
        <Skeleton aria-hidden="true" className="h-6 w-4/6" />
      </div>
    )

  if (panel.data.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun changement enregistré.</p>

  return (
    <ul className="flex flex-col">
      {panel.data.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-0"
        >
          <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
            {FR_DATETIME.format(new Date(e.at))}
          </span>
          <Badge className={cn('shrink-0 text-xs font-normal', KIND_TONE[e.kind])}>
            {KIND_LABEL[e.kind]}
          </Badge>
          <span className="text-sm">{e.label}</span>
          {/* « système » et pas « inconnu » : l'écriture vient d'un script ou de SQL direct — une
              provenance différente, pas une information manquante. */}
          <span className="ml-auto text-xs text-muted-foreground">{e.actorName ?? 'système'}</span>
        </li>
      ))}
    </ul>
  )
}
