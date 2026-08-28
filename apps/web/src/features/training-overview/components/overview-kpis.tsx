import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { dec2, int } from '@/lib/format'
import { COST_WINDOW_DAYS, type CostRow } from '../types'

/**
 * Bandeau de tête de l'Overview : le coût IA, en cartes KPI maison (`KpiGrid`, comme Santé ou
 * l'Overview chatteur). Ces totaux vivaient en bas de page, sous deux tableaux — la dépense d'un
 * mois ne se voyait qu'en scrollant. Le détail par jour × modèle reste, lui, en bas.
 *
 * ADMIN seulement : la Template ne rend ce bandeau que si `cost` existe (la RLS de
 * `training_ai_calls` est admin-only, le service n'appelle même pas la RPC pour les autres).
 *
 * `deltaPct: null` partout : la RPC ne ramène que la fenêtre courante, il n'y a pas de période
 * précédente à comparer — une variation inventée serait pire que pas de variation.
 */
export function OverviewKpis({ rows, estimatedUsd }: { rows: CostRow[]; estimatedUsd: number }) {
  const t = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      input: acc.input + r.inputTokens,
      output: acc.output + r.outputTokens,
      cache: acc.cache + r.cacheReadTokens,
    }),
    { calls: 0, input: 0, output: 0, cache: 0 },
  )
  const window = `${COST_WINDOW_DAYS} derniers jours`
  const kpis: Kpi[] = [
    {
      key: 'usd',
      label: 'Coût IA estimé',
      value: `${dec2(estimatedUsd)} $`,
      deltaPct: null,
      trendLabel: window,
      hint: 'prix liste — la facture réelle peut être plus basse',
      info: 'Σ (tokens entrée × prix entrée + tokens sortie × prix sortie + cache lu × 10 % du prix d’entrée), aux prix liste Anthropic.',
    },
    {
      key: 'calls',
      label: 'Appels IA',
      value: int(t.calls),
      deltaPct: null,
      trendLabel: window,
      hint: 'un appel fan par message, une notation par conversation',
    },
    {
      key: 'in',
      label: 'Tokens entrée',
      value: int(t.input),
      deltaPct: null,
      trendLabel: window,
      hint: `dont ${int(t.cache)} lus en cache (~10 % du prix d’entrée)`,
    },
    { key: 'out', label: 'Tokens sortie', value: int(t.output), deltaPct: null, trendLabel: window, hint: 'réponses du fan et notations' },
  ]
  return <KpiGrid kpis={kpis} />
}
