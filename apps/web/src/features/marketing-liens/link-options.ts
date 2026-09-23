import { round1, round2 } from '@glagency/core'
import { aBouge, type Source } from './rank'
import type { MktGroup, MktLinkRow } from '@/lib/types/marketing'

/** La valeur « tout ce que le filtre au-dessus laisse passer » — pour le réseau ET pour le lien. */
export const ALL = 'tous'

/** Réseau choisi : une source de trafic, ou toutes. */
export type Reseau = Source | typeof ALL

/**
 * La valeur « liens sans modèle rattachée » du champ Modèle — distincte de « toutes ».
 * Des liens n'ont pas de `creator_id` (jamais rattachés côté MyPuls) : sans cette entrée, ils
 * ne seraient atteignables que par « toutes les modèles », donc jamais isolables.
 */
export const SANS_MODELE = 'aucune'

/** Modèle choisie : un id de modèle, « sans modèle », ou toutes. */
export type Modele = string

export interface LinkOption {
  value: string
  label: string
}

/**
 * Les réseaux proposés au filtre : les GROUPES de la base (0167), dans leur ordre de priorité.
 * La liste était figée sur les quatre sources d'avant — TrafficStars, ou tout groupe créé depuis
 * l'écran Groupes, n'y apparaissait pas, et la file d'attente s'y appelait encore « Autres ».
 */
export function reseauOptions(groups: readonly Pick<MktGroup, 'key' | 'label'>[]): LinkOption[] {
  return [{ value: ALL, label: 'Tous les réseaux' }, ...groups.map((g) => ({ value: g.key, label: g.label }))]
}

/** `?reseau=` vient de l'URL : tout ce qui n'est pas un groupe connu retombe sur « tous ». */
export function parseReseau(raw: string | undefined, groups: readonly Pick<MktGroup, 'key'>[]): Reseau {
  return groups.some((g) => g.key === raw) ? (raw as Source) : ALL
}

/**
 * Le groupe COMMUN à toute la sélection — `null` dès qu'elle en mélange deux.
 *
 * C'est lui qui habille le graphe (sa couleur, son nom en tête du titre) : choisir Instagram
 * doit se VOIR, sinon on regarde un graphe violet comme les autres sans savoir de quoi il parle.
 * Vaut aussi pour un lien seul, ou une modèle dont tous les liens sont sur le même réseau.
 */
export function commonGroup<G extends Pick<MktGroup, 'key'>>(
  selected: readonly Pick<MktLinkRow, 'type'>[],
  groups: readonly G[],
): G | null {
  const types = new Set(selected.map((l) => l.type))
  if (types.size !== 1) return null
  const [seul] = types
  return groups.find((g) => g.key === seul) ?? null
}

/**
 * Les modèles proposées au filtre : celles qui portent au moins un lien, par ordre alphabétique.
 *
 * Une modèle dont on ne lit pas le NOM est écartée : sous `creators_scoped_read`, un non-admin
 * voit le lien mais pas sa modèle (`creator` à null alors que `creatorId` existe, cf.
 * get-mkt-links.ts) — une option sans libellé n'aurait rien à afficher. Ces liens-là restent
 * visibles sous « toutes les modèles » ; ils ne sont simplement pas isolables.
 */
export function modeleOptions(links: readonly MktLinkRow[]): LinkOption[] {
  const nommees = new Map<string, string>()
  let orphelins = false
  for (const l of links) {
    if (l.creatorId && l.creator) nommees.set(l.creatorId, l.creator)
    else if (!l.creatorId) orphelins = true
  }
  return [
    { value: ALL, label: 'Toutes les modèles' },
    ...[...nommees]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
      .map(([id, name]) => ({ value: id, label: name })),
    ...(orphelins ? [{ value: SANS_MODELE, label: 'Sans modèle' }] : []),
  ]
}

/**
 * `?modele=` vient de l'URL : tout ce qui ne correspond à aucun lien retombe sur « toutes ».
 * « Sans modèle » n'est retenu que s'il existe vraiment un lien orphelin — sinon le filtre
 * viderait l'écran sans que rien n'explique pourquoi.
 */
export function parseModele(raw: string | undefined, links: readonly MktLinkRow[]): Modele {
  if (raw === SANS_MODELE) return links.some((l) => !l.creatorId) ? SANS_MODELE : ALL
  return raw && links.some((l) => l.creatorId === raw) ? raw : ALL
}

/** Les liens que le filtre Modèle laisse passer — partagé par le Classement et le Graphique. */
export function filterByModele(links: readonly MktLinkRow[], modele: Modele): MktLinkRow[] {
  if (modele === ALL) return [...links]
  if (modele === SANS_MODELE) return links.filter((l) => !l.creatorId)
  return links.filter((l) => l.creatorId === modele)
}

/**
 * Ce que montre le mode Graphique : les deux champs, et les liens à tracer.
 *
 * UNE fonction pour les trois réponses (options du champ Lien, lien retenu, liens tracés) parce
 * que ce sont les mêmes : le champ Lien ne propose que ce que les filtres au-dessus laissent
 * passer, et le lien retenu doit être l'un d'eux. Les séparer laisserait exister l'état
 * contradictoire « réseau = Instagram, courbe = un lien Twitter ».
 *
 * CASCADE réseau → modèle → lien. L'axe modèle est la raison d'être de l'écran : sur MyPuls il
 * faut ouvrir les liens un par un pour additionner ce qu'une modèle a rapporté.
 *
 * Fonction pure : c'est toute la règle de cet écran.
 */
export function resolveGraphSelection(
  links: readonly MktLinkRow[],
  reseau: Reseau,
  modele: Modele,
  lien: string,
): {
  reseau: Reseau
  modele: Modele
  lien: string
  options: LinkOption[]
  selected: MktLinkRow[]
} {
  const duReseau = filterByModele(
    reseau === ALL ? links : links.filter((l) => l.type === reseau),
    modele,
  )

  // Classés par ABONNÉS décroissants — le critère d'accueil du classement, pour que le
  // sélecteur s'ouvre dans le même ordre que la page qu'on vient de quitter. Les DORMANTS
  // ferment la marche et le disent : les mêler aux autres obligerait à chercher le seul qui
  // compte, les cacher ferait croire qu'un lien a disparu.
  const actifs = duReseau.filter(aBouge).sort((a, b) => b.conversions - a.conversions)
  const dormants = duReseau
    .filter((l) => !aBouge(l))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  // Le libellé de « tous » nomme ce qui a déjà été filtré, sinon deux écrans très différents
  // (toute l'agence / les 3 liens d'une modèle) portent le même mot.
  const labelTous =
    modele !== ALL && reseau !== ALL
      ? 'Tous les liens de la sélection'
      : modele !== ALL
        ? 'Tous les liens de la modèle'
        : reseau === ALL
          ? 'Tous les liens'
          : 'Tous les liens du réseau'

  const options: LinkOption[] = [
    { value: ALL, label: labelTous },
    ...actifs.map((l) => ({ value: l.id, label: l.name })),
    ...dormants.map((l) => ({ value: l.id, label: `${l.name} · sans activité` })),
  ]

  // Un lien hors des filtres courants (changement de réseau ou de modèle, ou URL bricolée)
  // retombe sur « tous » plutôt que de contredire les champs au-dessus de lui.
  const choisi = duReseau.find((l) => l.id === lien)
  return {
    reseau,
    modele,
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
  /** Taux de conversion en % (abonnés ÷ clics) — `null` sans clic. */
  taux: number | null
}

/**
 * Cumule une sélection de liens.
 *
 * Le € PAR ABONNÉ et le TAUX sont des ratios de SOMMES (Σrevenus ÷ Σabonnés, Σabonnés ÷ Σclics),
 * jamais la moyenne des valeurs des liens — même règle que `groupBySource` : un lien à 100 € pour
 * un seul abonné tirerait la moyenne vers le haut sans rien peser dans la réalité. `round1` sur
 * le taux, comme `groupBySource` (rank.ts) : les deux écrans affichent le même nombre.
 */
export function sumLinks(links: readonly MktLinkRow[]): LinkTotalsValues {
  const clicks = links.reduce((s, l) => s + l.clicks, 0)
  const conversions = links.reduce((s, l) => s + l.conversions, 0)
  const revenueEur = round2(links.reduce((s, l) => s + l.revenueEur, 0))
  return {
    clicks,
    conversions,
    revenueEur,
    ltv: conversions > 0 ? round2(revenueEur / conversions) : null,
    taux: clicks > 0 ? round1((conversions / clicks) * 100) : null,
  }
}
