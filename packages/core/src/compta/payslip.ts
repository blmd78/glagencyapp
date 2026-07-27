import { round2 } from '../domain/dates'

/** Tarif d'un passage de relais. Constante métier — jamais un nombre en dur dans un composant. */
export const HANDOFF_EUR = 0.6

/** Entrées de la formule, déjà agrégées sur UNE période de paie pour UN chatteur. */
export interface PayslipInput {
  /** Taux de commission en %, ex. 10 pour 10 %. */
  rate: number
  /**
   * Fixe de la PÉRIODE (`compta_settings.fixed_amount`), qui S'AJOUTE à la commission — il ne
   * la remplace jamais (2026-07-27, mesuré sur la feuille de juillet du propriétaire : Carl =
   * 4,379 € de commission + 75 € de fixe + 19,20 € de handoffs = 98,579 €).
   *
   * PAR PÉRIODE et non par semaine : la feuille ne le remplit qu'une fois par paie (bloc S2),
   * jamais dans chaque bloc hebdomadaire. Il n'est donc multiplié par rien.
   *
   * Il s'applique dès qu'il est non nul — AUCUN drapeau ne le commande. `compta_settings.mode`
   * (`percent` | `fixed`) et `compta_settings.is_setter` ont disparu avec la migration 0089 :
   * le premier faisait REMPLACER la commission par le fixe (ce que personne ne pratique — les
   * 95 chatteurs de la feuille sont tous à `CA × taux`), le second dupliquait
   * `profiles.closing_role`, réglé depuis Membres.
   */
  fixedAmount: number
  /**
   * Σ des `fixe_setter` des semaines rattachées — un AJUSTEMENT de la période : non nul, il
   * REMPLACE `fixedAmount` (cas du demi-fixe à 37,50 € relevé sur la feuille). Il ne s'y ajoute
   * pas : ce serait un double versement.
   */
  fixeSetter: number
  /** CA du chatteur par modèle sur la période (creatorId → €). */
  modelCa: Record<string, number>
  /** Σ bonus jour + semaine. */
  bonus: number
  /** Σ malus jour + semaine — SAISIS À LA MAIN, hors police. */
  malus: number
  /** Σ handoffs jour + semaine. */
  handoffs: number
  /** Montant de la prime si elle est due sur cette période, 0 sinon. */
  primeDue: number
  /** Σ `police_entries.amount_eur` (kind = 'malus') sur la période. */
  sanctions: number
}

export interface Payslip {
  /** CA total, tous modèles. */
  ca: number
  base: number
  setter: number
  /**
   * Le `setter` versé vient d'une SAISIE HEBDO (ajustement) et non du réglage. Calculé ICI et
   * non par l'écran : l'arbitrage entre les deux montants est une règle de la formule, la
   * refaire côté composant en ferait une seconde implémentation, qui divergerait. La fiche s'en
   * sert pour dire LEQUEL s'applique.
   */
  setterAdjusted: boolean
  bonus: number
  malus: number
  handoffsAmount: number
  prime: number
  sanctions: number
  net: number
}

/**
 * Fiche de paie d'une période (spec §4). Fonction PURE : aucune date, aucun accès base —
 * l'appelant a déjà borné et agrégé. C'est ce qui la rend testable.
 *
 * Le pourcentage est appliqué MODÈLE PAR MODÈLE puis sommé : identique à un calcul sur le CA
 * total tant que le taux est unique, mais prêt pour un taux par modèle sans réécriture.
 */
export function computePayslip(i: PayslipInput): Payslip {
  const ca = Object.values(i.modelCa).reduce((s, v) => s + v, 0)
  // ARRONDI PAR MODÈLE, PUIS SOMME — et non l'inverse (2026-07-27). La fiche de paie affiche
  // une LIGNE PAR MODÈLE (`ComptaPayslip`), et ces lignes doivent s'additionner EXACTEMENT au
  // total affiché : une fiche dont le détail ne fait pas le total ne vaut rien. C'est la même
  // règle, un cran plus bas, que l'arrondi composante par composante juste en dessous.
  //
  // Ce que ça coûte : jusqu'à un demi-centime par modèle d'écart avec `round2(Σ brut)` —
  // 40,04 € au lieu de 40,02 € sur 4 modèles à 100,05 € et 10 % (cf. test dédié). Écart assumé,
  // arbitré par le propriétaire.
  const rawBase = Object.values(i.modelCa).reduce((s, v) => s + round2((v * i.rate) / 100), 0)

  // `> 0` et non `!= null` : `compta_week_entries.fixe_setter` est `numeric not null default 0`
  // (migration 0084) et le formulaire le borne à `min(0)` — « pas de saisie » et « saisie à
  // zéro » sont donc le MÊME état en base, indistinguables. Conséquence assumée : on ne peut pas
  // annuler le fixe d'une seule période par une saisie à 0, il faut passer par le réglage.
  const setterAdjusted = i.fixeSetter > 0
  const rawSetter = setterAdjusted ? i.fixeSetter : i.fixedAmount
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

  return {
    ca: round2(ca),
    base,
    setter,
    setterAdjusted,
    bonus,
    malus,
    handoffsAmount,
    prime,
    sanctions,
    net,
  }
}
