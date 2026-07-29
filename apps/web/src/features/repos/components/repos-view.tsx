'use client'

import { useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { copyReposWeek } from '../actions'
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
    // `replace` + `scroll: false` (guidelines §6, cf. `date-range-picker.tsx`) : un filtre
    // d'URL ne crée pas d'entrée d'historique ni ne remonte la page.
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }))
  }

  // « Copier la semaine précédente » (0093) : bouton TOUJOURS VISIBLE pour l'admin, grisé
  // quand la semaine AFFICHÉE a déjà du contenu (retour Benoit : masqué, il devenait
  // introuvable dès que la semaine suivante était remplie — plus aucune semaine vide dans le
  // sélecteur). Le RPC refuse de toute façon d'écraser (garde serveur) ; ce test n'est que
  // de l'affichage. Cases vestigielles vides ignorées, comme côté SQL.
  const weekIsEmpty = Object.values(data.cells).every((byCol) =>
    Object.values(byCol).every((c) => c.chatterIds.length === 0 && c.names === ''),
  )
  const copyPreviousWeek = () => {
    startTransition(async () => {
      const res = await copyReposWeek({ weekStart: data.weekStart })
      if (!res.success) toast.error(res.error)
      else if (res.data === 0) toast.info('La semaine précédente est vide — rien à copier')
      else toast.success(`${res.data} case(s) copiée(s) depuis la semaine précédente`)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning des repos</h1>
          <p className="text-sm text-muted-foreground">
            Jours de repos des chatters par équipe · {data.weekLabel}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={copyPreviousWeek}
              disabled={pending || !weekIsEmpty}
              title={
                weekIsEmpty
                  ? undefined
                  : 'Cette semaine a déjà des repos — la copie ne remplit qu’une semaine vide (rien n’est jamais écrasé)'
              }
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Copier la semaine précédente
            </Button>
          )}
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
