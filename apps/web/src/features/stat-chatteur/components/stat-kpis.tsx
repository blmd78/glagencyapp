import { KpiGrid, type Kpi } from '@/components/kpi-card'
import type { StatChatteurData } from '../types'

// Liseré distinct de Rouge/Bleue pour ne pas se confondre avec les badges équipe (bleu/rouge).
const ACCENTS = ['border-t-violet-500', 'border-t-amber-500', 'border-t-red-500', 'border-t-blue-500']

/**
 * 4 KPI de comptage (MEMBRES par désignation closing, indépendant de la période) — carte
 * partagée `KpiGrid` (même patron que Bilan/Overview/Santé).
 */
export function StatKpis({ kpis }: { kpis: StatChatteurData['kpis'] }) {
  const cards: Kpi[] = [
    { key: 'nbSetters', label: 'Setters', value: kpis.nbSetters.toLocaleString('fr-FR'), deltaPct: null, trendLabel: '', hint: '' },
    { key: 'nbClosers', label: 'Closers', value: kpis.nbClosers.toLocaleString('fr-FR'), deltaPct: null, trendLabel: '', hint: '' },
    { key: 'nbRouge', label: 'Équipe Rouge', value: kpis.nbRouge.toLocaleString('fr-FR'), deltaPct: null, trendLabel: '', hint: '' },
    { key: 'nbBleue', label: 'Équipe Bleue', value: kpis.nbBleue.toLocaleString('fr-FR'), deltaPct: null, trendLabel: '', hint: '' },
  ]
  return <KpiGrid kpis={cards} accents={ACCENTS} />
}
