'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UrlSelect } from '@/components/url-select'
import { PeriodToggle } from '@/components/period-toggle'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur2max as eur } from '@/lib/format'
import { ControlPanel } from './control-panel'
import { PoliceFeed } from './police-feed'
import type { PoliceData } from '../types'

/** KPIs de la période au format des cartes partagées (cohérent avec Overview/Santé) — libellés
 *  et repère (`hint`) branchés sur le mode : jour (`data.dayLabel`) ou mois (`data.monthLabel`). */
function policeKpis(data: PoliceData): Kpi[] {
  const isMonth = data.vue === 'mois'
  const suffix = isMonth ? '(mois)' : '(jour)'
  const hint = isMonth ? data.monthLabel : data.dayLabel
  return [
    { key: 'malus', label: `Total malus ${suffix}`, value: eur(data.totalMalusEur), deltaPct: null, trendLabel: isMonth ? 'Sanctions du mois' : 'Sanctions du jour', hint },
    { key: 'avert', label: 'Avertissements', value: String(data.warningCount), deltaPct: null, trendLabel: 'Fautes relevées', hint },
    { key: 'chatters', label: 'Chatteurs concernés', value: String(data.chattersConcerned), deltaPct: null, trendLabel: isMonth ? 'Contrôlés ce mois' : 'Contrôlés aujourd’hui', hint },
  ]
}

const POLICE_ACCENTS = ['border-t-red-500', 'border-t-amber-500', 'border-t-blue-500']

/** Template Police : bascule Jour/Mois + sélecteur de période + saisie (jour uniquement) + journal
 *  de la période. En mois : consultation pure (KPIs et historique agrégés sur le mois, pas de saisie). */
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

  // Sélecteurs PILOTÉS par le Tracker (via `onSelect`) : il pousse lui-même l'URL avec SA transition
  // → le grisage `pending` du bloc ci-dessous. `selectMonth` = pendant mensuel de `selectDay`.
  const selectDay = (day: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('day', day)
    startTransition(() => router.push(`?${next.toString()}`))
  }
  const selectMonth = (month: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('month', month)
    startTransition(() => router.push(`?${next.toString()}`))
  }

  // Saisie visible seulement pour un écrivain ET en mode jour (le mois = consultation pure).
  const showControl = canWrite && data.vue === 'jour'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Libellé « Tracker » aligné sur la nav (config/workspaces.ts) — slug/route inchangés. */}
          <h1 className="text-2xl font-semibold tracking-tight">Tracker — sanctions</h1>
          <p className="text-sm text-muted-foreground">
            Avertissements par erreur, puis malus décidé à la main ·{' '}
            {data.vue === 'mois' ? data.monthLabel : data.dayLabel}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Bascule Jour/Mois PARTAGÉE PUIS le sélecteur du mode actif. Sélecteurs PARTAGÉS
              (cf. rapport-police) pilotés via `onSelect`/`disabled` pour garder la transition du Tracker. */}
          <PeriodToggle vue={data.vue} />
          {data.vue === 'jour' ? (
            <UrlSelect
              param="day"
              value={data.day}
              options={data.days.map((d) => ({ value: d.day, label: d.label }))}
              onSelect={selectDay}
              disabled={pending}
            />
          ) : (
            <UrlSelect
              param="month"
              value={data.month}
              options={data.months.map((m) => ({ value: m.month, label: m.label }))}
              onSelect={selectMonth}
              disabled={pending}
            />
          )}
        </div>
      </div>

      <KpiGrid kpis={policeKpis(data)} accents={POLICE_ACCENTS} />

      <div
        className={
          pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'
        }
      >
        {/* Saisie masquée pour un chatteur (lecture seule) ET en mode mois — il ne voit que l'historique. */}
        {showControl && <ControlPanel data={data} onChatterChange={setChatterId} />}
        <div className={showControl ? 'mt-4' : undefined}>
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
