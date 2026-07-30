'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { MemberPanel } from '@/hooks/use-member-panel'
import type { MemberEvent } from '../types'
import { EventsTimeline } from './events-timeline'

/**
 * Contenu de l'onglet « Historique » du dialog membre (0104) — PRÉSENTATION SEULE.
 *
 * Le chargement est déclenché par le dialog depuis `onValueChange` des onglets, c'est-à-dire un
 * ÉVÉNEMENT et non un effet : c'est le patron du projet (`useMemberPanel`, partagé avec les piles
 * de noms du Planning et du Dashboard), et la seule forme que la règle
 * `react-hooks/set-state-in-effect` accepte.
 *
 * Conséquence voulue : ouvrir une fiche pour changer un shift ne paie aucune lecture d'historique
 * — elle ne part que si on va sur l'onglet.
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

  return <EventsTimeline events={panel.data} />
}
