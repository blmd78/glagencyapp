/**
 * Un groupe de liens (`mkt_link_groups`, 0167) : ce qui remplace l'union figée d'avant.
 * `pattern` range les liens neufs, `priority` arbitre entre deux motifs qui reconnaissent le
 * même nom, `isFallback` marque la file d'attente (« À classer »).
 */
export interface MktGroup {
  key: string
  label: string
  color: string
  pattern: string
  priority: number
  isFallback: boolean
  /** Né d'un motif repéré par l'ingestion, pas d'une décision humaine — à relire. */
  auto: boolean
}

// Types du pôle « marketing » PARTAGÉS entre plusieurs features (marketing-liens,
// marketing-dashboard, marketing-social) — le reste (par domaine) vit dans le
// types.ts de chaque feature.

export interface MktLinkRow {
  id: string
  name: string
  /** Clé du GROUPE (`mkt_link_groups.key`, 0167) — libre : les groupes sont des lignes. */
  type: string
  url: string
  /** Id de la modèle rattachée — la jointure se fait par ID, jamais par nom : sous RLS
   *  `creators_scoped_read`, un non-admin ne lit aucun nom (get-mkt-links.ts:42). */
  creatorId: string | null
  creator: string | null
  /** VA assignés au lien (nom + couleur de fiche) — vides pour un manager si le lien
   *  appartient aux VA d'un autre (RLS owner_id sur mkt_staff). */
  staff: { name: string; color: string }[]
  active: boolean
  /** Agrégats sur la période filtrée. */
  clicks: number
  conversions: number
  revenueEur: number
  /** €/conversion sur la période (null si 0 conversion). */
  ltv: number | null
  /** Taux de conversion % (conversions/clics, null si 0 clic). */
  taux: number | null
}
