import type { ChatterGains, WheelHistoryRow } from './types'

/**
 * Récap compta de l'historique : ce que chaque chatteur a gagné en EUROS sur les tirages donnés.
 * Seuls ceux qui ont gagné de l'argent y figurent (un Raté ou un lot non monétaire comptent 0), du
 * plus gros total au plus petit. Regroupé par `profileId`, pas par nom : deux chatteurs sortis du
 * roster s'affichent tous deux « — » et ne doivent pas fusionner.
 */
export function gainsByChatter(rows: readonly WheelHistoryRow[]): ChatterGains[] {
  const acc = new Map<string, ChatterGains>()
  for (const r of rows) {
    if (!r.won || !r.amountEur) continue
    const g = acc.get(r.profileId) ?? { profileId: r.profileId, displayName: r.displayName, totalEur: 0 }
    g.totalEur += r.amountEur
    acc.set(r.profileId, g)
  }
  return [...acc.values()].sort((a, b) => b.totalEur - a.totalEur || a.displayName.localeCompare(b.displayName, 'fr'))
}
