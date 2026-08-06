'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UrlSelect } from '@/components/url-select'
import { PeriodToggle } from '@/components/period-toggle'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { eur2max as eur } from '@/lib/format'
import { ControlPanel } from './control-panel'
import { PoliceTable } from './police-table'
import type { PoliceData } from '../types'

/** KPIs de la période au format des cartes partagées (cohérent avec Overview/Santé) — calculés
 *  sur les entrées reçues, déjà bornées au périmètre par le serveur. Libellés/repère (`hint`)
 *  branchés sur le mode : jour ou mois. */
function policeKpis(data: PoliceData): Kpi[] {
  const { entries } = data
  const isMonth = data.vue === 'mois'
  const suffix = isMonth ? '(mois)' : '(jour)'
  const hint = isMonth ? data.monthLabel : data.dayLabel
  const totalMalus = entries.filter((e) => e.kind === 'malus').reduce((s, e) => s + e.amountEur, 0)
  const warnings = entries.filter((e) => e.kind === 'warning').length
  const concerned = new Set(entries.map((e) => e.chatterId)).size
  return [
    { key: 'malus', label: `Total malus ${suffix}`, value: eur(totalMalus), deltaPct: null, trendLabel: isMonth ? 'Sanctions du mois' : 'Sanctions du jour', hint },
    { key: 'avert', label: 'Avertissements', value: String(warnings), deltaPct: null, trendLabel: 'Fautes relevées', hint },
    { key: 'chatters', label: 'Chatters concernés', value: String(concerned), deltaPct: null, trendLabel: isMonth ? 'Contrôlés ce mois' : 'Contrôlés aujourd’hui', hint },
  ]
}

const POLICE_ACCENTS = ['border-t-red-500', 'border-t-amber-500', 'border-t-blue-500']

/** Template Police : bascule Jour/Mois + sélecteur de période + saisie (jour uniquement) + journal
 *  de la période. En mois : consultation pure (KPIs et historique agrégés sur le mois, pas de saisie). */
export function PoliceView({
  data,
  canWrite,
}: {
  data: PoliceData
  canWrite: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  // Sélecteurs PILOTÉS par le Tracker (via `onSelect`) : il pousse lui-même l'URL avec SA
  // transition → le grisage `pending` du bloc ci-dessous. Un seul corps pour jour et mois.
  // `replace` + `scroll: false` (guidelines §6) : filtre d'URL, pas d'entrée d'historique.
  const selectPeriode = (param: 'day' | 'month') => (value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(param, value)
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }))
  }

  // Bouton « Ajouter une sanction » (dialog) : écrivains, ET en mode jour seulement (le mois
  // = consultation pure — la sanction s'enregistre sur le jour affiché).
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
              onSelect={selectPeriode('day')}
              disabled={pending}
            />
          ) : (
            <UrlSelect
              param="month"
              value={data.month}
              options={data.months.map((m) => ({ value: m.month, label: m.label }))}
              onSelect={selectPeriode('month')}
              disabled={pending}
            />
          )}
        </div>
      </div>

      <KpiGrid kpis={policeKpis(data)} accents={POLICE_ACCENTS} />

      {/* Saisie en DIALOG, bouton à GAUCHE (écrivains, mode jour uniquement : le mois reste
          consultation pure). La page ne garde que l'historique en dessous. Le sélecteur de
          modèles a été retiré (demande Benoit 2026-08-06, « pour le moment ») — le PÉRIMÈTRE
          par rôle, lui, reste appliqué côté serveur (getPolice). */}
      {showControl && (
        <div className="flex items-center">
          <ControlPanel data={data} />
        </div>
      )}

      <div
        className={
          pending ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'
        }
      >
        <PoliceTable entries={data.entries} isMonth={data.vue === 'mois'} canWrite={canWrite} />
      </div>
    </div>
  )
}
