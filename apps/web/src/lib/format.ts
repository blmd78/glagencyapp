/**
 * Formateurs et arrondis partagés (fr-FR). Source unique — évite les copies dans chaque
 * service/table. `eur` arrondit à l'entier, `eur2` garde 2 décimales, `int` arrondit sans €.
 * Les arrondis métier (`round1`/`round2`) viennent de @glagency/core (source unique web+ingestion).
 *
 * Intl.NumberFormat HOISTÉS : `toLocaleString(locale, options)` construit un formateur
 * NEUF à chaque appel (~70× plus lent, mesuré) — sur un tableau de ~1 700 lignes ça
 * transformait chaque passe de rendu en ~150 ms de formatage pur.
 */
import { round1, round2 } from '@glagency/core'
export { round1, round2 }

const NF_INT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const NF_2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const NF_2MAX = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const NF_1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const NF = new Intl.NumberFormat('fr-FR')

export const eur = (n: number) => `${NF_INT.format(n)} €`
export const eur2 = (n: number) => `${NF_2.format(n)} €`
/** € avec jusqu'à 2 décimales (aucune si entier) — ex. montants de malus. */
export const eur2max = (n: number) => `${NF_2MAX.format(n)} €`
export const pct = (n: number) => `${NF_1.format(n)} %`
export const num = (n: number) => NF.format(n)
export const int = (n: number) => NF_INT.format(Math.round(n))

/** Taux de conversion recalculé Σvendu/Σproposé (jamais la moyenne des %). */
export const conv = (v: number, p: number) => (p ? round1((v / p) * 100) : 0)

/** LTV = CA ÷ nouveaux abonnés (null si aucun abonné) — formule unique de l'app. */
export const ltvOf = (ca: number, newSubs: number): number | null =>
  newSubs > 0 ? round2(ca / newSubs) : null
