import { addDays, round2 } from '@glagency/core'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'
import type { MetricPoint } from '@/components/metric-chart/options'
import type { MktLinkRow } from '@/lib/types/marketing'

/** Ce qu'un lien a apporté un jour. Nommé seulement à l'affichage : la ligne n'a que son id. */
export interface LinkShare {
  linkId: string
  subs: number
  revenue: number
}

/** Un jour de la courbe d'un lien. Toujours présent, même sans activité. */
export interface DailyPoint {
  /** `YYYY-MM-DD`. */
  date: string
  clicks: number
  conversions: number
  revenueEur: number
  /** Les liens qui ont amené des subs ou du CA ce jour-là — l'infobulle d'un cumul de liens. */
  byLink: LinkShare[]
}

/**
 * La série journalière d'un lien, TROUS COMPRIS.
 *
 * `mkt_link_daily` n'écrit une ligne que les jours où le lien a bougé — sur 183 liens, ~55
 * seulement en produisent une un jour donné. Tracer les lignes telles quelles ferait relier au
 * graphe deux points distants de plusieurs jours : la courbe inventerait une continuité, et un
 * lien mort pendant une semaine aurait l'air actif. On rend donc un point PAR JOUR de la période,
 * les jours sans ligne à zéro.
 *
 * Fonction pure : c'est la seule règle de cet écran qui mérite un test.
 */
export function dailySeries(
  rows: readonly MktLinkDailyRow[],
  from: string,
  to: string,
): DailyPoint[] {
  // CUMUL par jour : plusieurs lignes d'un même jour sont plusieurs LIENS (mode « Tous »), pas
  // des doublons — n'en garder qu'une effacerait le trafic de tous les autres.
  //
  // `revenue_eur` est un `numeric` : PostgREST le rend en CHAÎNE. Sans Number(), l'addition
  // concaténerait au lieu de sommer (même conversion que get-mkt-links.ts:83).
  const byDate = new Map<string, DailyPoint>()
  for (const r of rows) {
    const acc = byDate.get(r.date) ?? { date: r.date, clicks: 0, conversions: 0, revenueEur: 0, byLink: [] }
    const subs = Number(r.conversions)
    const revenue = Number(r.revenue_eur)
    acc.clicks += Number(r.clicks)
    acc.conversions += subs
    acc.revenueEur += revenue
    if (subs > 0 || revenue > 0) acc.byLink.push({ linkId: r.link_id, subs, revenue })
    byDate.set(r.date, acc)
  }
  // Arrondi APRÈS la somme : arrondir chaque ligne d'abord ferait dériver un cumul de 183 liens.
  for (const p of byDate.values()) p.revenueEur = round2(p.revenueEur)

  const points: DailyPoint[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    points.push(byDate.get(d) ?? { date: d, clicks: 0, conversions: 0, revenueEur: 0, byLink: [] })
  }
  return points
}

/**
 * La série au format du graphe PARTAGÉ (`components/metric-chart`), qui nomme le revenu
 * `revenue` comme l'Overview. Aucune valeur ne change.
 *
 * `links` : les liens tracés, pour nommer la répartition de chaque jour dans l'infobulle. Rien
 * avec un seul lien (la modale, un lien choisi) : sa répartition ne redirait que son total.
 */
export function toMetricPoints(
  points: readonly DailyPoint[],
  links: readonly Pick<MktLinkRow, 'id' | 'name' | 'creator'>[] = [],
): MetricPoint[] {
  const byId = links.length > 1 ? new Map(links.map((l) => [l.id, l])) : null
  return points.map((p) => ({
    date: p.date,
    revenue: p.revenueEur,
    conversions: p.conversions,
    clicks: p.clicks,
    ...(byId && {
      byLink: p.byLink.map((s) => {
        const l = byId.get(s.linkId)
        return { name: l?.name ?? s.linkId, creator: l?.creator ?? null, subs: s.subs, revenue: s.revenue }
      }),
    }),
  }))
}
