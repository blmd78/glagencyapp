/**
 * Formateurs et arrondis partagés (fr-FR). Source unique — évite les copies dans chaque
 * service/table. `eur` arrondit à l'entier, `eur2` garde 2 décimales.
 */
export const round1 = (n: number) => Math.round(n * 10) / 10
export const round2 = (n: number) => Math.round(n * 100) / 100

export const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
export const eur2 = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
export const pct = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
export const num = (n: number) => n.toLocaleString('fr-FR')

/** Taux de conversion recalculé Σvendu/Σproposé (jamais la moyenne des %). */
export const conv = (v: number, p: number) => (p ? round1((v / p) * 100) : 0)

/** LTV = CA ÷ nouveaux abonnés (null si aucun abonné) — formule unique de l'app. */
export const ltvOf = (ca: number, newSubs: number): number | null =>
  newSubs > 0 ? round2(ca / newSubs) : null
