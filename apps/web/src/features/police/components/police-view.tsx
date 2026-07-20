'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur2max as eur } from '@/lib/format'
import { ControlPanel } from './control-panel'
import { PoliceFeed } from './police-feed'
import type { PoliceData } from '../types'

/** KPIs du jour au format des cartes partagées (cohérent avec Overview/Santé). */
function policeKpis(data: PoliceData): Kpi[] {
  return [
    { key: 'malus', label: 'Total malus (jour)', value: eur(data.totalMalusEur), deltaPct: null, trendLabel: 'Sanctions du jour', hint: data.dayLabel },
    { key: 'avert', label: 'Avertissements', value: String(data.warningCount), deltaPct: null, trendLabel: 'Fautes relevées', hint: data.dayLabel },
    { key: 'chatters', label: 'Chatteurs concernés', value: String(data.chattersConcerned), deltaPct: null, trendLabel: "Contrôlés aujourd’hui", hint: data.dayLabel },
  ]
}

const POLICE_ACCENTS = ['border-t-red-500', 'border-t-amber-500', 'border-t-blue-500']

/** Template Police : sélecteur de jour + saisie (avertissement / malus) + journal du jour. */
export function PoliceView({
  data,
  isAdmin,
  canWrite,
}: {
  data: PoliceData
  isAdmin: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  // Chatteur sélectionné : partagé entre la saisie et le filtre de l'historique.
  const [chatterId, setChatterId] = useState('')

  const selectDay = (day: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('day', day)
    startTransition(() => router.push(`?${next.toString()}`))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Libellé « Tracker » aligné sur la nav (config/workspaces.ts) — slug/route inchangés. */}
          <h1 className="text-2xl font-semibold tracking-tight">Tracker — sanctions</h1>
          <p className="text-sm text-muted-foreground">
            Avertissements par erreur, puis malus décidé à la main · {data.dayLabel}
          </p>
        </div>
        <div className="ml-auto">
          <Select value={data.day} onValueChange={selectDay} disabled={pending}>
            <SelectTrigger className="h-9 w-56 text-sm capitalize tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.days.map((d) => (
                <SelectItem key={d.day} value={d.day} className="text-sm capitalize">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <KpiGrid kpis={policeKpis(data)} accents={POLICE_ACCENTS} />

      <div
        className={
          pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'
        }
      >
        {/* Saisie masquée pour un chatteur (lecture seule) — il ne voit que l'historique. */}
        {canWrite && <ControlPanel data={data} onChatterChange={setChatterId} />}
        <div className={canWrite ? 'mt-4' : undefined}>
          <PoliceFeed
            data={data}
            isAdmin={isAdmin}
            canWrite={canWrite}
            filterChatterId={chatterId}
            onClearFilter={() => setChatterId('')}
          />
        </div>
      </div>
    </div>
  )
}
