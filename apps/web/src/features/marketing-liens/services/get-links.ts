import { getLinkRows } from '@/lib/services/get-mkt-links'
import { inScope, sfsLinkIds, type MktScope } from '@/lib/mkt-sfs'
import type { Period } from '@/lib/period'
import type { MktLinksData } from '../types'

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Liens (actifs et disparus) avec leurs agrégats de période. `scope` : `externe` pour la page
 * Liens tracking (sans les SFS), `sfs` pour l'onglet SFS — cf. `lib/mkt-sfs.ts`.
 */
export async function getMktLinks(period: Period, scope: MktScope = 'externe'): Promise<MktLinksData> {
  const all = await getLinkRows(period)
  const links = inScope(all, (l) => l.id, sfsLinkIds(all), scope)
  return {
    period: period.label,
    links,
    totals: {
      clicks: links.reduce((s, l) => s + l.clicks, 0),
      conversions: links.reduce((s, l) => s + l.conversions, 0),
      revenueEur: r2(links.reduce((s, l) => s + l.revenueEur, 0)),
    },
  }
}
