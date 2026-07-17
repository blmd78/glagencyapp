import { getLinkRows } from '@/lib/services/get-mkt-links'
import type { Period } from '@/lib/period'
import type { MktLinksData } from '../types'

const r2 = (v: number) => Math.round(v * 100) / 100

/** Page Liens : tous les liens (actifs et disparus) avec leurs agrégats de période. */
export async function getMktLinks(period: Period): Promise<MktLinksData> {
  const links = await getLinkRows(period)
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
