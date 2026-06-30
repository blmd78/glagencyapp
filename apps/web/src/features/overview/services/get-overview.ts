import type { DailyPoint, OverviewData } from '../types'

/**
 * Source de données de l'Overview.
 *
 * ⚠️ MOCK pour l'instant (on configure l'affichage). Les valeurs reprennent les
 * vrais ordres de grandeur de l'app Python (data.json) pour un rendu crédible.
 *
 * TODO (demain) : remplacer le corps par un appel Supabase
 *   const supabase = await createClient()
 *   const { data } = await supabase.rpc('fn_overview', { period: ... })
 * La signature reste `Promise<OverviewData>`, donc l'UI ne change pas.
 */
export async function getOverview(): Promise<OverviewData> {
  return {
    periodLabel: 'Juin 2026',
    kpis: [
      {
        key: 'revenue',
        label: 'CA du mois',
        value: '252 243 €',
        deltaPct: 3.1,
        trendLabel: 'En hausse ce mois',
        hint: 'vs mois dernier (244 756 €)',
      },
      {
        key: 'new-subs',
        label: 'Nouveaux abonnés',
        value: '48 673',
        deltaPct: 12.4,
        trendLabel: 'Acquisition en hausse',
        hint: 'sur la période',
      },
      {
        key: 'active-chatters',
        label: 'Chatters actifs',
        value: '159',
        deltaPct: -2.5,
        trendLabel: '159 actifs sur 205',
        hint: '46 fantômes ce mois',
      },
      {
        key: 'growth',
        label: 'Croissance CA',
        value: '+3,1 %',
        deltaPct: 3.1,
        trendLabel: 'Au-dessus de l’objectif',
        hint: 'objectif +2 %',
      },
    ],
    daily: buildDailySeries(90, '2026-06-30'),
  }
}

/**
 * Série quotidienne déterministe (stable d'un rendu à l'autre) : saisonnalité
 * hebdo + bruit pseudo-aléatoire + légère tendance haussière. Purement cosmétique.
 */
function buildDailySeries(days: number, end: string): DailyPoint[] {
  const endDate = new Date(`${end}T00:00:00Z`)
  const out: DailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate)
    d.setUTCDate(endDate.getUTCDate() - i)
    const idx = days - 1 - i
    const noise = Math.abs(Math.sin(idx * 12.9898) * 43758.5453) % 1
    const weekly = Math.sin((idx / 7) * Math.PI * 2) * 0.25 + 0.75
    const trend = (idx / days) * 2800
    const revenue = Math.round(5200 * weekly + noise * 6400 + trend)
    out.push({ date: d.toISOString().slice(0, 10), revenue })
  }
  return out
}
