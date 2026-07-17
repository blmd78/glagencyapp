'use client'

import { useRouter } from 'next/navigation'
import { CalendarPlus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { fmtDuration } from '../types'
import type { PlanningData, PlanningMember } from '../types'

/**
 * En-tête du planning : titre + sous-titre (temps effectif calculé), et pour un admin le
 * sélecteur de membre (navigue vers `?membre=`) + les 2 actions d'ouverture des dialogs.
 * Extrait de `planning-view.tsx` (split > 300 lignes, docs/guidelines-standard-feature.md
 * §1) — DOM inchangé.
 */
export function PlanningHeader({
  data,
  isAdmin,
  members,
  totalMin,
  shiftsCount,
  onOpenMeta,
  onAddBlock,
}: {
  data: PlanningData | null
  isAdmin: boolean
  members: PlanningMember[]
  totalMin: number
  shiftsCount: number
  onOpenMeta: () => void
  onAddBlock: () => void
}) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planning journalier</h1>
        <p className="text-sm text-muted-foreground">
          {data ? data.profileName : 'Aucun membre'}
          {totalMin > 0 && (
            <>
              {' '}· {fmtDuration(totalMin)} de travail effectif · {shiftsCount} shift
              {shiftsCount > 1 ? 's' : ''}
            </>
          )}
        </p>
      </div>
      {isAdmin && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Combobox
            value={data?.profileId ?? ''}
            onChange={(id) => router.push(`/chatter/planning?membre=${id}`)}
            className="w-52"
            placeholder="Choisir un membre…"
            searchPlaceholder="Rechercher un membre…"
            options={members.map((m) => ({
              value: m.id,
              label: m.role === 'manager' ? `${m.name} · manager` : m.name,
            }))}
          />
          {data && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenMeta}>
                <SlidersHorizontal className="size-3.5" />
                Priorité & annexes
              </Button>
              <Button size="sm" className="gap-1.5" onClick={onAddBlock}>
                <CalendarPlus className="size-3.5" />
                Ajouter un bloc
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
