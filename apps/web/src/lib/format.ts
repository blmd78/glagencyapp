/**
 * Formateurs et arrondis partagés (fr-FR). Source unique — évite les copies dans chaque
 * service/table. `eur` arrondit à l'entier, `eur2` garde 2 décimales, `int` arrondit sans €.
 * Les arrondis métier (`round1`/`round2`) viennent de @glagency/core (source unique web+ingestion).
 */
import { round1, round2 } from '@glagency/core'
export { round1, round2 }

export const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
export const eur2 = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
export const pct = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
export const num = (n: number) => n.toLocaleString('fr-FR')
export const int = (n: number) => Math.round(n).toLocaleString('fr-FR')

/** Taux de conversion recalculé Σvendu/Σproposé (jamais la moyenne des %). */
export const conv = (v: number, p: number) => (p ? round1((v / p) * 100) : 0)

/** LTV = CA ÷ nouveaux abonnés (null si aucun abonné) — formule unique de l'app. */
export const ltvOf = (ca: number, newSubs: number): number | null =>
  newSubs > 0 ? round2(ca / newSubs) : null
