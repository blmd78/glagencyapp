import { round2 } from '../domain/dates'

/** Tarif d'un passage de relais. Constante métier — jamais un nombre en dur dans un composant. */
export const HANDOFF_EUR = 0.6

/** Entrées de la formule, déjà agrégées sur UNE quinzaine pour UN chatteur. */
export interface PayslipInput {
  mode: 'percent' | 'fixed'
  /** Taux de commission en %, ex. 10 pour 10 %. */
  rate: number
  /** Montant fixe HEBDOMADAIRE (mode `fixed`) — hypothèse spec §4, à confirmer. */
  fixedAmount: number
  isSetter: boolean
  /** Semaines rattachées à la quinzaine (leur lundi y tombe) — 2 ou 3. */
  weekCount: number
  /** CA du chatteur par modèle sur la quinzaine (creatorId → €). */
  modelCa: Record<string, number>
  /** Σ des `fixe_setter` des semaines rattachées. */
  fixeSetter: number
  /** Σ bonus jour + semaine. */
  bonus: number
  /** Σ malus jour + semaine — SAISIS À LA MAIN, hors police. */
  malus: number
  /** Σ handoffs jour + semaine. */
  handoffs: number
  /** Montant de la prime si elle est due sur cette quinzaine, 0 sinon. */
  primeDue: number
  /** Σ `police_entries.amount_eur` (kind = 'malus') sur la quinzaine. */
  sanctions: number
}

export interface Payslip {
  /** CA total, tous modèles — affiché même en mode `fixed`. */
  ca: number
  base: number
  setter: number
  bonus: number
  malus: number
  handoffsAmount: number
  prime: number
  sanctions: number
  net: number
}

/**
 * Fiche de paie d'une quinzaine (spec §4). Fonction PURE : aucune date, aucun accès base —
 * l'appelant a déjà borné et agrégé. C'est ce qui la rend testable.
 *
 * Le pourcentage est appliqué MODÈLE PAR MODÈLE puis sommé : identique à un calcul sur le CA
 * total tant que le taux est unique, mais prêt pour un taux par modèle sans réécriture.
 */
export function computePayslip(i: PayslipInput): Payslip {
  const ca = Object.values(i.modelCa).reduce((s, v) => s + v, 0)
  const rawBase =
    i.mode === 'percent'
      ? // ARRONDI PAR MODÈLE, PUIS SOMME — et non l'inverse (2026-07-27). La fiche de paie
        // affiche désormais une LIGNE PAR MODÈLE (`ComptaPayslip`), et ces lignes doivent
        // s'additionner EXACTEMENT au total affiché : une fiche dont le détail ne fait pas
        // le total ne vaut rien. C'est la même règle, un cran plus bas, que l'arrondi
        // composante par composante juste en dessous.
        //
        // Ce que ça coûte : jusqu'à un demi-centime par modèle d'écart avec `round2(Σ brut)`
        // — 40,04 € au lieu de 40,02 € sur 4 modèles à 100,05 € et 10 % (cf. test dédié).
        // Écart assumé, arbitré par le propriétaire.
        Object.values(i.modelCa).reduce((s, v) => s + round2((v * i.rate) / 100), 0)
      : i.fixedAmount * i.weekCount
  const rawSetter = i.isSetter ? i.fixeSetter : 0
  const rawHandoffsAmount = i.handoffs * HANDOFF_EUR

  // Arrondi composante par composante AVANT le net : `net` doit s'additionner exactement
  // à partir des champs affichés à l'écran (voir test d'invariant).
  const base = round2(rawBase)
  const setter = round2(rawSetter)
  const bonus = round2(i.bonus)
  const malus = round2(i.malus)
  const handoffsAmount = round2(rawHandoffsAmount)
  const prime = round2(i.primeDue)
  const sanctions = round2(i.sanctions)
  const net = round2(base + setter + bonus - malus + handoffsAmount + prime - sanctions)

  return { ca: round2(ca), base, setter, bonus, malus, handoffsAmount, prime, sanctions, net }
}
