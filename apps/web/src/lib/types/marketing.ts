// Types du pôle « marketing » PARTAGÉS entre plusieurs features (marketing-liens,
// marketing-dashboard, marketing-social) — le reste (par domaine) vit dans le
// types.ts de chaque feature.

export interface MktLinkRow {
  id: string
  name: string
  type: 'twitter' | 'instagram' | 'telegram' | 'other'
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
