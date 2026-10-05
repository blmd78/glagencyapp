/**
 * Totaux et signaux « À regarder » de la page Marketing › Trafic (spec
 * docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). Le taux de clic ne compte que les
 * liens à BOUTONS : une redirection n'a pas de clic mesurable, ses visiteurs dilueraient le taux.
 */

export interface LsTotals {
  /** Visiteurs humains (uniques par jour, additionnés). */
  visitors: number
  bots: number
  /** Clics vers mym.fans ; null si aucun lien à boutons dans le total. */
  mymClicks: number | null
  /** Visiteurs des seuls liens à boutons — le dénominateur du taux. */
  mymVisitors: number
}

export const LS_FLAGS = ['chute', 'eteint', 'clic-faible', 'bots'] as const
export type LsFlag = (typeof LS_FLAGS)[number]
export const LS_FLAG_LABEL: Record<LsFlag, string> = {
  chute: 'Trafic en chute',
  eteint: 'Éteint',
  'clic-faible': 'Peu de clics MYM',
  bots: 'Beaucoup de bots',
}

export const LS_THRESHOLDS = {
  chuteRatio: 0.5,
  chuteMinPrev: 30,
  eteintMinPrev: 10,
  clicRatio: 0.5,
  minVolume: 30,
  botShare: 0.2,
} as const

export const emptyTotals = (): LsTotals => ({ visitors: 0, bots: 0, mymClicks: null, mymVisitors: 0 })

export function addDaily(t: LsTotals, d: { visitors: number; bots: number; mymClicks: number | null }): LsTotals {
  return {
    visitors: t.visitors + d.visitors,
    bots: t.bots + d.bots,
    mymClicks: d.mymClicks == null ? t.mymClicks : (t.mymClicks ?? 0) + d.mymClicks,
    mymVisitors: d.mymClicks == null ? t.mymVisitors : t.mymVisitors + d.visitors,
  }
}

export function sumTotals(list: LsTotals[]): LsTotals {
  return list.reduce(
    (acc, t) => ({
      visitors: acc.visitors + t.visitors,
      bots: acc.bots + t.bots,
      mymClicks: t.mymClicks == null ? acc.mymClicks : (acc.mymClicks ?? 0) + t.mymClicks,
      mymVisitors: acc.mymVisitors + t.mymVisitors,
    }),
    emptyTotals(),
  )
}

/** Clics MYM par visiteur des liens à boutons. Peut dépasser 1 : un visiteur clique parfois deux fois. */
export const clickRate = (t: LsTotals): number | null =>
  t.mymClicks != null && t.mymVisitors > 0 ? t.mymClicks / t.mymVisitors : null

export const botShare = (t: LsTotals): number | null => {
  const all = t.visitors + t.bots
  return all > 0 ? t.bots / all : null
}

/** Les raisons de regarder une ligne. `referenceRate` = le taux auquel la comparer (réseau ou global). */
export function trafficFlags(cur: LsTotals, prev: LsTotals, referenceRate: number | null): LsFlag[] {
  const T = LS_THRESHOLDS
  const flags: LsFlag[] = []
  if (cur.visitors === 0 && prev.visitors >= T.eteintMinPrev) flags.push('eteint')
  else if (prev.visitors >= T.chuteMinPrev && cur.visitors < prev.visitors * T.chuteRatio) flags.push('chute')
  const rate = clickRate(cur)
  if (
    rate != null &&
    cur.mymVisitors >= T.minVolume &&
    referenceRate != null &&
    referenceRate > 0 &&
    rate < referenceRate * T.clicRatio
  ) {
    flags.push('clic-faible')
  }
  const share = botShare(cur)
  if (share != null && cur.visitors + cur.bots >= T.minVolume && share > T.botShare) flags.push('bots')
  return flags
}
