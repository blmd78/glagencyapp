import { round2 } from '@glagency/core'
import { aBouge, SOURCES, type Source } from './rank'
import type { MktLinkRow } from '@/lib/types/marketing'

/** La valeur « tout ce que le filtre au-dessus laisse passer » — pour le réseau ET pour le lien. */
export const ALL = 'tous'

/** Réseau choisi : une source de trafic, ou toutes. */
export type Reseau = Source | typeof ALL

export interface LinkOption {
  value: string
  label: string
}

export const RESEAU_OPTIONS: LinkOption[] = [
  { value: ALL, label: 'Tous les réseaux' },
  ...SOURCES.map((s) => ({ value: s.key, label: s.label })),
]

/** `?reseau=` vient de l'URL : tout ce qui n'est pas une source connue retombe sur « tous ». */
export function parseReseau(raw: string | undefined): Reseau {
  return SOURCES.some((s) => s.key === raw) ? (raw as Source) : ALL
}

/**
 * Ce que montre le mode Graphique : les deux champs, et les liens à tracer.
 *
 * UNE fonction pour les trois réponses (options du champ Lien, lien retenu, liens tracés) parce
 * que ce sont les mêmes : le champ Lien ne propose que ce que le réseau laisse passer, et le
 * lien retenu doit être l'un d'eux. Les séparer laisserait exister l'état contradictoire
 * « réseau = Instagram, courbe = un lien Twitter ».
 *
 * Fonction pure : c'est toute la règle de cet écran.
 */
export function resolveGraphSelection(
  links: readonly MktLinkRow[],
  reseau: Reseau,
  lien: string,
): { reseau: Reseau; lien: string; options: LinkOption[]; selected: MktLinkRow[] } {
  const duReseau = reseau === ALL ? [...links] : links.filter((l) => l.type === reseau)

  // Classés par ABONNÉS décroissants — le critère d'accueil du classement, pour que le
  // sélecteur s'ouvre dans le même ordre que la page qu'on vient de quitter. Les DORMANTS
  // ferment la marche et le disent : les mêler aux autres obligerait à chercher le seul qui
  // compte, les cacher ferait croire qu'un lien a disparu.
  const actifs = duReseau.filter(aBouge).sort((a, b) => b.conversions - a.conversions)
  const dormants = duReseau
    .filter((l) => !aBouge(l))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const options: LinkOption[] = [
    { value: ALL, label: reseau === ALL ? 'Tous les liens' : 'Tous les liens du réseau' },
    ...actifs.map((l) => ({ value: l.id, label: l.name })),
    ...dormants.map((l) => ({ value: l.id, label: `${l.name} · sans activité` })),
  ]

  // Un lien hors du réseau courant (changement de réseau, ou URL bricolée) retombe sur « tous »
  // plutôt que de contredire le champ au-dessus de lui.
  const choisi = duReseau.find((l) => l.id === lien)
  return {
    reseau,
    lien: choisi ? choisi.id : ALL,
    options,
    selected: choisi ? [choisi] : duReseau,
  }
}

/** Les totaux d'une sélection de liens, sur la période. */
export interface LinkTotalsValues {
  clicks: number
  conversions: number
  revenueEur: number
  /** € par abonné — `null` sans abonné. */
  ltv: number | null
}

/**
 * Cumule une sélection de liens.
 *
 * Le € PAR ABONNÉ est un ratio de SOMMES (Σrevenus ÷ Σabonnés), jamais la moyenne des €/abonné
 * des liens — même règle que `groupBySource` pour le taux d'une source : un lien à 100 € pour un
 * seul abonné tirerait la moyenne vers le haut sans rien peser dans la réalité.
 */
export function sumLinks(links: readonly MktLinkRow[]): LinkTotalsValues {
  const clicks = links.reduce((s, l) => s + l.clicks, 0)
  const conversions = links.reduce((s, l) => s + l.conversions, 0)
  const revenueEur = round2(links.reduce((s, l) => s + l.revenueEur, 0))
  return { clicks, conversions, revenueEur, ltv: conversions > 0 ? round2(revenueEur / conversions) : null }
}
