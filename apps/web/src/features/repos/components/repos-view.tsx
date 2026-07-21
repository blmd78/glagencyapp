'use client'

import { useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { PlanningGrid } from './planning-grid'
import type { ReposData } from '../types'

/** Template Planning repos : sélecteur de semaine + grille éditable. Aucun fetch. */
export function ReposView({
  data,
  isAdmin,
  canWrite,
}: {
  data: ReposData
  isAdmin: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  // Temps réel des repos : quand un admin pose/retire un repos (ou coche « envoyé Telegram »),
  // l'écran de tous les porteurs de la page se met à jour EN DIRECT. La RLS `has_page('repos')`
  // filtre déjà QUI reçoit les événements ; `router.refresh()` re-render le RSC avec des données
  // fraîches (nos overrides optimistes locaux ne sont pas écrasés). On filtre par `week_start`
  // pour ne PAS rafraîchir sur une autre semaine ; re-souscription au changement de semaine et
  // nettoyage du canal à l'unmount.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`repos-${data.weekStart}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rest_planning_cells',
          filter: `week_start=eq.${data.weekStart}`,
        },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rest_planning_weeks',
          filter: `week_start=eq.${data.weekStart}`,
        },
        () => router.refresh(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [data.weekStart, router])

  const selectWeek = (start: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('week', start)
    startTransition(() => router.push(`?${next.toString()}`))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning des repos</h1>
          <p className="text-sm text-muted-foreground">
            Jours de repos des chatteurs par équipe · {data.weekLabel}
          </p>
        </div>
        <div className="ml-auto">
          <Select value={data.weekStart} onValueChange={selectWeek} disabled={pending}>
            <SelectTrigger className="h-9 w-64 text-sm tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.weeks.map((w) => (
                <SelectItem key={w.start} value={w.start} className="text-sm tabular-nums">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>
        <PlanningGrid key={data.weekStart} data={data} isAdmin={isAdmin} canWrite={canWrite} />
      </div>
    </div>
  )
}
