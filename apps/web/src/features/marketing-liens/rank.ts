import { round1, round2 } from '@glagency/core'
import type { MktLinkRow } from '@/lib/types/marketing'

/** Les trois lectures de « performance » d'un lien (décision Benoit 2026-09-08 : les trois). */
export type Critere = 'subs' | 'revenus' | 'taux'

export const CRITERES: { key: Critere; label: string; hint: string }[] = [
  { key: 'subs', label: 'Abonnés', hint: 'ce que le lien amène' },
  { key: 'revenus', label: 'Revenus', hint: 'ce qu’il rapporte tout de suite' },
  { key: 'taux', label: 'Taux', hint: 'abonnés ÷ clics' },
]

export type Source = MktLinkRow['type']

export const SOURCES: { key: Source; label: string; color: string }[] = [
  // Palette passée au validateur dataviz : violet/rose/cyan séparés en vision normale ET sous
  // deutéranopie (ΔE 8,9 au pire). Les teintes des badges (sky ↔ blue) échouaient. « Autres »
  // garde un neutre ASSUMÉ : c'est la catégorie résiduelle, elle ne doit pas attirer l'œil.
  { key: 'twitter', label: 'Twitter / X', color: '#8b5cf6' },
  { key: 'instagram', label: 'Instagram', color: '#ec4899' },
  { key: 'telegram', label: 'Telegram', color: '#06b6d4' },
  { key: 'other', label: 'Autres', color: 'var(--muted-foreground)' },
]

/** La valeur d'un lien pour le critère courant — `null` = pas classable (taux sans clic). */
export function valeur(l: MktLinkRow, c: Critere): number | null {
  if (c === 'subs') return l.conversions
  if (c === 'revenus') return l.revenueEur
  return l.taux
}

/**
 * Un lien s'est-il MANIFESTÉ sur la période ? Un clic, un abonné ou un euro suffit.
 *
 * Le distinguo compte : l'agence porte 335 liens dont ~90 seulement bougent un mois donné.
 * Les afficher tous mettrait 244 lignes à zéro dans le classement — l'ancienne table les
 * cachait derrière sa pagination, ce qui revenait à mentir par omission. Ils sont donc
 * comptés à part et montrés à la demande, jamais supprimés.
 *
 * Un revenu SANS clic reste une activité : MyPuls attribue parfois un revenu à retardement,
 * sur un lien qui n'a rien collecté ce mois-ci.
 */
export const aBouge = (l: MktLinkRow) => l.clicks > 0 || l.conversions > 0 || l.revenueEur > 0

export interface SourceGroup {
  type: Source
  label: string
  color: string
  /** Les liens ACTIFS sur la période, classés par le critère (décroissant). */
  links: MktLinkRow[]
  /** Les liens de la source restés muets sur la période — comptés, affichés à la demande. */
  dormants: MktLinkRow[]
  clicks: number
  conversions: number
  revenueEur: number
  /** Taux global de la source — RECALCULÉ Σconv/Σclics, jamais la moyenne des taux. */
  taux: number | null
  /** Valeur de la source pour le critère : sert au tri des sections ET à leur part. */
  score: number
  /** Meilleure valeur du critère dans cette source — référence des barres relatives. */
  best: number
}

/**
 * Groupe les liens par SOURCE DE TRAFIC et les classe par le critère choisi.
 *
 * Fonction PURE : c'est tout le métier du classement de la page Liens, et la seule partie
 * qui mérite un test. Le composant ne fait que l'afficher.
 *
 * Les sections sont triées par leur propre score, et une source sans lien disparaît — un
 * en-tête « Telegram · 0 lien » n'apprend rien tant qu'aucun lien n'est typé ainsi.
 */
export function groupBySource(links: MktLinkRow[], critere: Critere): SourceGroup[] {
  return SOURCES.map(({ key, label, color }) => {
    const own = links.filter((l) => l.type === key)
    const clicks = own.reduce((s, l) => s + l.clicks, 0)
    const conversions = own.reduce((s, l) => s + l.conversions, 0)
    const revenueEur = round2(own.reduce((s, l) => s + l.revenueEur, 0))
    const taux = clicks > 0 ? round1((conversions / clicks) * 100) : null
    const classes = own
      .filter(aBouge)
      // Un lien sans score pour CE critère (taux d'un lien sans clic) tombe en fin de liste
      // plutôt que de sortir : il a bougé, il n'a simplement pas de valeur sur cet axe.
      .sort((a, b) => (valeur(b, critere) ?? -1) - (valeur(a, critere) ?? -1))
    const dormants = own.filter((l) => !aBouge(l))
    return {
      type: key,
      label,
      color,
      links: classes,
      dormants,
      clicks,
      conversions,
      revenueEur,
      taux,
      score: critere === 'subs' ? conversions : critere === 'revenus' ? revenueEur : (taux ?? 0),
      best: classes.length > 0 ? (valeur(classes[0], critere) ?? 0) : 0,
    }
  })
    // Une source dont AUCUN lien n'a bougé disparaît : un en-tête « Telegram · 0 » n'apprend
    // rien. Elle revient d'elle-même dès qu'un de ses liens collecte un clic.
    .filter((g) => g.links.length > 0)
    .sort((a, b) => b.score - a.score)
}
