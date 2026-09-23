import { round1, round2 } from '@glagency/core'
import { NEUTRAL_COLOR } from '@/lib/mkt-groups'
import type { MktGroup, MktLinkRow } from '@/lib/types/marketing'

/** Un réseau (groupe de liens) chez UNE modèle, sur la période. */
export interface ModelSource {
  key: string
  label: string
  color: string
  liens: number
  clicks: number
  conversions: number
  revenueEur: number
  /** Abonnés ÷ clics, en % — `null` sans clic. */
  taux: number | null
  /** Part des abonnés venus des liens de CETTE modèle — `null` si elle n'en a aucun. */
  part: number | null
}

/**
 * D'où viennent les abonnés d'une modèle : ses liens regroupés par RÉSEAU (onglet « Sources de
 * trafic », demande Benoit 2026-09-23 — « par modèle, les sources de trafic des réseaux auxquels
 * elles sont rattachées, insta, snap… »).
 *
 * Classés par abonnés, le chiffre du pôle, puis par revenus. La part et le taux sont des ratios
 * de SOMMES, jamais des moyennes de liens (même règle que `sumLinks` et `groupBySource`).
 *
 * Un groupe inconnu de l'appelant (supprimé entre deux lectures) garde un libellé — sa clé — et
 * le neutre, plutôt que de faire disparaître ses liens du décompte.
 */
export function sourcesOf(links: readonly MktLinkRow[], groups: readonly MktGroup[]): ModelSource[] {
  const parType = new Map<string, MktLinkRow[]>()
  for (const l of links) parType.set(l.type, [...(parType.get(l.type) ?? []), l])

  const totalSubs = links.reduce((s, l) => s + l.conversions, 0)
  return [...parType]
    .map(([key, own]) => {
      const g = groups.find((x) => x.key === key)
      const clicks = own.reduce((s, l) => s + l.clicks, 0)
      const conversions = own.reduce((s, l) => s + l.conversions, 0)
      return {
        key,
        label: g?.label ?? key,
        color: g?.color || NEUTRAL_COLOR,
        liens: own.length,
        clicks,
        conversions,
        revenueEur: round2(own.reduce((s, l) => s + l.revenueEur, 0)),
        taux: clicks > 0 ? round1((conversions / clicks) * 100) : null,
        part: totalSubs > 0 ? round1((conversions / totalSubs) * 100) : null,
      }
    })
    .sort(
      (a, b) =>
        b.conversions - a.conversions || b.revenueEur - a.revenueEur || a.label.localeCompare(b.label, 'fr'),
    )
}
