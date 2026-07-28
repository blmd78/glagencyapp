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
   *
   * SEULE SOURCE DU FIXE depuis le 2026-07-28 (tâche 19). Un second champ `fixeSetter` — la
   * Σ des `compta_week_entries.fixe_setter` — pouvait le REMPLACER pour une période. Il est
   * retiré : sa saisie était HEBDOMADAIRE, donc affichée deux fois par période et SOMMÉE
   * (`compta-rows.ts`), quand le montant, lui, est par PÉRIODE. Deux champs identiques
   * invitaient à retaper 75 € sur chaque ligne — ce qui versait 150 €.
   */
  fixedAmount: number
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
  /**
   * `RESTE SEMAINE PASSEE` de la feuille — reliquat reporté de la période précédente
   * (`compta_period_entries.carryover`).
   *
   * SIGNÉ, seule entrée de la formule à l'être : un trop-perçu se reporte en négatif. Les malus
   * et les sanctions, eux, arrivent POSITIFS et sont soustraits ici — ce n'est pas la même chose,
   * et la fiche ne les affiche pas au même endroit.
   */
  carryover: number
  /**
   * `PRIME TOP15 SETTER` — la prime du classement des setters sur la période, calculée par
   * `rankSetters` (`./setter-rank`). Une entrée comme les autres : la formule ne connaît ni le
   * rang, ni le barème, seulement le montant dû à CE membre.
   */
  setterPrime: number
  /**
   * `PRIME TOP3 MOIS` — prime mensuelle SAISIE À LA MAIN (`compta_period_entries.top3_prime`).
   * Sa règle d'attribution n'est pas connue : c'est l'admin qui décide, l'app n'invente rien.
   */
  monthlyPrime: number
}

export interface Payslip {
  /** CA total, tous modèles. */
  ca: number
  base: number
  /** Le fixe versé sur la période — c'est `fixedAmount` arrondi, et rien d'autre : il n'existe
   *  plus qu'UNE source (les réglages). `setterAdjusted`, qui disait lequel de deux montants
   *  s'appliquait, a disparu avec le second (tâche 19). */
  setter: number
  bonus: number
  malus: number
  handoffsAmount: number
  prime: number
  sanctions: number
  /** Report de la période précédente — SIGNÉ (cf. `PayslipInput.carryover`). */
  carryover: number
  /** Prime du classement setter (TOP15). */
  setterPrime: number
  /** Prime du mois (TOP3), saisie. */
  monthlyPrime: number
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

  // AUCUN arbitrage : le fixe de la période EST celui des réglages. La règle « une saisie hebdo
  // non nulle le remplace » a été retirée le 2026-07-28 avec le champ qui l'alimentait — cf.
  // `fixedAmount` ci-dessus. La colonne `compta_week_entries.fixe_setter` survit en base (elle
  // porte de l'historique) mais n'entre plus dans le calcul.
  const rawSetter = i.fixedAmount
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
  // Les trois lignes du lot final (tâche 22) : elles S'AJOUTENT au net, chacune sur sa propre
  // ligne de fiche. `carryover` porte son signe ; les deux primes sont positives.
  const carryover = round2(i.carryover)
  const setterPrime = round2(i.setterPrime)
  const monthlyPrime = round2(i.monthlyPrime)
  const net = round2(
    base +
      setter +
      bonus -
      malus +
      handoffsAmount +
      prime -
      sanctions +
      carryover +
      setterPrime +
      monthlyPrime,
  )

  return {
    ca: round2(ca),
    base,
    setter,
    bonus,
    malus,
    handoffsAmount,
    prime,
    sanctions,
    carryover,
    setterPrime,
    monthlyPrime,
    net,
  }
}
