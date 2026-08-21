'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Combobox } from '@/components/ui/combobox'
import type { RosterRow } from '../types'

/**
 * « Tous les chatters / <nom> » : la fiche vit dans l'URL (`?chatter=<profileId>`) pour rester
 * partageable (guidelines §6), `router.replace` dans un `startTransition` — patron de `url-tabs.tsx`.
 * Affiché aux seuls admin / manager / sous-manager : un policier ou un lecteur avec le droit Suivi
 * voit le roster sans sélecteur (la RLS 0117 borne de toute façon la lecture des sessions).
 */
export function OverviewPicker({ roster, selectedId }: { roster: RosterRow[]; selectedId: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('chatter', next)
    else params.delete('chatter')
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <div
      data-pending={pending ? '' : undefined}
      className="w-full data-[pending]:opacity-60 data-[pending]:transition-opacity sm:max-w-xs"
    >
      <Combobox
        options={[{ value: '', label: 'Tous les chatters' }, ...roster.map((r) => ({ value: r.profileId, label: r.displayName }))]}
        value={selectedId ?? ''}
        onChange={go}
        placeholder="Tous les chatters"
        searchPlaceholder="Rechercher un chatter…"
        emptyText="Aucun chatter."
      />
    </div>
  )
}
