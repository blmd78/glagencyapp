import { addDays, round2 } from '@glagency/core'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'

/** Un jour de la courbe d'un lien. Toujours présent, même sans activité. */
export interface DailyPoint {
  /** `YYYY-MM-DD`. */
  date: string
  clicks: number
  conversions: number
  revenueEur: number
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
    const acc = byDate.get(r.date) ?? { date: r.date, clicks: 0, conversions: 0, revenueEur: 0 }
    acc.clicks += Number(r.clicks)
    acc.conversions += Number(r.conversions)
    acc.revenueEur += Number(r.revenue_eur)
    byDate.set(r.date, acc)
  }
  // Arrondi APRÈS la somme : arrondir chaque ligne d'abord ferait dériver un cumul de 183 liens.
  for (const p of byDate.values()) p.revenueEur = round2(p.revenueEur)

  const points: DailyPoint[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    points.push(byDate.get(d) ?? { date: d, clicks: 0, conversions: 0, revenueEur: 0 })
  }
  return points
}
