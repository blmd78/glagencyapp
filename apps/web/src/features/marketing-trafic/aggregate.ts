import {
  LS_PLATFORM_LABEL,
  addDaily,
  addDays,
  daysBetween,
  botShare,
  clickRate,
  emptyTotals,
  sumTotals,
  trafficFlags,
  type LsPlatform,
  type LsTotals,
} from '@glagency/core'
import type { TraficData, TraficDay, TraficRow } from './types'

export interface TraficLinkInput {
  id: string
  url: string
  note: string
  creator_id: string | null
  platform: string
  social_account_id: string | null
  operator: string | null
  manual: boolean
}

export interface TraficDailyInput {
  link_id: string
  date: string
  visitors: number
  bots: number
  mym_clicks: number | null
}

export interface TraficInput {
  /** Période DEMANDÉE, bornes incluses. */
  period: { from: string; to: string; label: string }
  /** Dernier jour relevé dans `mkt_ls_daily`, toutes dates confondues ; null si la table est vide. */
  dataTo: string | null
  links: TraficLinkInput[]
  daily: TraficDailyInput[]
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
}

const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

/**
 * Par visiteurs de la période, puis par visiteurs de la précédente : les lignes qui ont du trafic
 * d'abord, les éteintes en bas, de la plus grosse perte à la plus petite. (« Signalées d'abord »
 * faisait remonter des pages entières d'anciens liens éteints, à 0, devant les profils actifs.)
 */
const byTraffic = (a: TraficRow, b: TraficRow) => b.cur.visitors - a.cur.visitors || b.prev.visitors - a.prev.visitors

function finish(base: Omit<TraficRow, 'rate' | 'botShare' | 'deltaPct' | 'flags'>, referenceRate: number | null): TraficRow {
  return {
    ...base,
    rate: clickRate(base.cur),
    botShare: botShare(base.cur),
    deltaPct: deltaPct(base.cur.visitors, base.prev.visitors),
    flags: trafficFlags(base.cur, base.prev, referenceRate),
  }
}

/**
 * Le trafic de la période et de la précédente, par lien (profil), modèle et réseau. Référence du
 * signal « peu de clics MYM » : pour un lien, le taux de SON réseau s'il compte au moins deux liens
 * à boutons (un réseau d'un seul lien ne se compare pas à lui-même), sinon le taux global ; pour un
 * regroupement, le taux global.
 */
export function buildTrafic(input: TraficInput): TraficData {
  const { period } = input
  // La période s'arrête au dernier jour RELEVÉ : aujourd'hui ne l'est jamais (relevé de la nuit).
  // La précédente a la même durée effective — sinon une période en cours se compare à une
  // période pleine et chaque lien sort « Éteint » ou « Chute ».
  const effTo = input.dataTo != null && input.dataTo < period.to ? input.dataTo : period.to
  const hasData = input.dataTo != null && effTo >= period.from
  const prevFrom = hasData ? addDays(period.from, -(daysBetween(period.from, effTo) + 1)) : period.from
  const crName = new Map(input.creators.map((c) => [c.id, c.name]))
  const handle = new Map(input.accounts.map((a) => [a.id, a.handle]))
  const cur = new Map<string, LsTotals>()
  const prev = new Map<string, LsTotals>()
  const days = new Map<string, TraficDay>()
  let lastDate: string | null = null

  for (const d of input.daily) {
    const inPeriod = hasData && d.date >= period.from && d.date <= effTo
    const inPrev = d.date >= prevFrom && d.date < period.from
    if (!inPeriod && !inPrev) continue
    const target = inPeriod ? cur : prev
    target.set(d.link_id, addDaily(target.get(d.link_id) ?? emptyTotals(), { visitors: d.visitors, bots: d.bots, mymClicks: d.mym_clicks }))
    if (inPeriod) {
      const p = days.get(d.date) ?? { date: d.date, visitors: 0, mymClicks: 0 }
      p.visitors += d.visitors
      p.mymClicks += d.mym_clicks ?? 0
      days.set(d.date, p)
      if (!lastDate || d.date > lastDate) lastDate = d.date
    }
  }

  const active = input.links.filter((l) => cur.has(l.id) || prev.has(l.id))
  const curOf = (id: string) => cur.get(id) ?? emptyTotals()
  const prevOf = (id: string) => prev.get(id) ?? emptyTotals()
  const totals = { cur: sumTotals(active.map((l) => curOf(l.id))), prev: sumTotals(active.map((l) => prevOf(l.id))) }
  const globalRate = clickRate(totals.cur)

  const networkRate = new Map<string, number | null>()
  for (const p of new Set(active.map((l) => l.platform))) {
    const withButtons = active.filter((l) => l.platform === p && curOf(l.id).mymClicks != null)
    networkRate.set(p, withButtons.length >= 2 ? clickRate(sumTotals(withButtons.map((l) => curOf(l.id)))) : globalRate)
  }

  /** Le profil d'un lien : compte Instagram, sinon opérateur X, sinon la note (ou l'URL). */
  const profileOf = (l: TraficLinkInput): { key: string; label: string } => {
    const h = l.social_account_id ? handle.get(l.social_account_id) : undefined
    if (h) return { key: `ig:${l.social_account_id}`, label: `@${h}` }
    if (l.operator) return { key: `${l.platform}:${l.operator}`, label: l.operator }
    const label = l.note || l.url
    return { key: `${l.platform}:${label}`, label }
  }

  const links = active
    .map((l) =>
      finish(
        {
          key: l.id,
          label: profileOf(l).label,
          sub: l.url,
          creatorName: l.creator_id ? (crName.get(l.creator_id) ?? null) : null,
          platform: l.platform as LsPlatform,
          cur: curOf(l.id),
          prev: prevOf(l.id),
          edit: {
            linkId: l.id,
            creatorId: l.creator_id,
            platform: l.platform as LsPlatform,
            socialAccountId: l.social_account_id,
            operator: l.operator,
            manual: l.manual,
          },
        },
        networkRate.get(l.platform) ?? globalRate,
      ),
    )
    .sort(byTraffic)

  const group = (
    keyOf: (l: TraficLinkInput) => string,
    labelOf: (k: string, ls: TraficLinkInput[]) => string,
    platformOf: (k: string, ls: TraficLinkInput[]) => LsPlatform | null,
    rateOf: (platform: LsPlatform | null) => number | null = () => globalRate,
  ) => {
    const groups = new Map<string, TraficLinkInput[]>()
    for (const l of active) groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l])
    return [...groups]
      .map(([k, ls]) => {
        const platform = platformOf(k, ls)
        return finish(
          {
            key: k,
            label: labelOf(k, ls),
            sub: `${ls.length} lien(s)`,
            creatorName: null,
            platform,
            cur: sumTotals(ls.map((l) => curOf(l.id))),
            prev: sumTotals(ls.map((l) => prevOf(l.id))),
            edit: null,
          },
          rateOf(platform),
        )
      })
      .sort(byTraffic)
  }

  return {
    periodLabel: period.label,
    to: period.to,
    totals,
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    links,
    // Un profil ne mélange jamais deux réseaux (clé préfixée) : il se compare au taux de SON réseau.
    profiles: group(
      (l) => profileOf(l).key,
      (_k, ls) => profileOf(ls[0]!).label,
      (_k, ls) => ls[0]!.platform as LsPlatform,
      (p) => (p ? (networkRate.get(p) ?? globalRate) : globalRate),
    ),
    models: group(
      (l) => l.creator_id ?? 'none',
      (k) => (k === 'none' ? 'Non attribuée' : (crName.get(k) ?? 'Modèle inconnue')),
      () => null,
    ),
    networks: group(
      (l) => l.platform,
      (k) => LS_PLATFORM_LABEL[k as LsPlatform] ?? k,
      (k) => k as LsPlatform,
    ),
    creators: [...input.creators].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    accounts: [...input.accounts].sort((a, b) => a.handle.localeCompare(b.handle, 'fr')),
    lastDate,
  }
}
