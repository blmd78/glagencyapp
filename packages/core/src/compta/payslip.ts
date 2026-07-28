import { round2 } from '../domain/dates'

/** Tarif d'un passage de relais. Constante métier — jamais un nombre en dur dans un composant. */
export const HANDOFF_EUR = 0.6

/**
 * UN SEGMENT DE TAUX de la période, avec le CA qui y a été fait. C'est ce qui remplace le couple
 * `(rate, modelCa)` depuis le 2026-07-28 : le taux d'un chatteur CHANGE À UNE DATE D'EFFET, et
 * les 12 chatteurs de la feuille de juillet qui changent de taux entre les deux semaines d'une
 * même période le prouvent (cf. `./rates`).
 *
 * Les segments sont produits par `rateSpans` (jours consécutifs au même taux), et l'appelant y
 * range le CA des jours correspondants. Un seul taux sur la période = UN segment, et la formule
 * redevient alors terme pour terme celle d'avant l'historisation.
 */
export interface RateSegmentInput {
  /** Premier jour du segment (ISO), inclus. */
  from: string
  /** Dernier jour du segment (ISO), inclus. */
  to: string
  /** Taux en %, ex. 10 pour 10 %. */
  rate: number
  /** Ces jours ne sont couverts par aucune ligne d'historique : `DEFAULT_RATE` s'y applique. */
  fallback: boolean
  /** CA de CE segment, par modèle (nom du modèle → €). */
  modelCa: Record<string, number>
}

/** Entrées de la formule, déjà agrégées sur UNE période de paie pour UN chatteur. */
export interface PayslipInput {
  /**
   * Le CA de la période, DÉCOUPÉ PAR TAUX. Remplace `rate` + `modelCa` (2026-07-28).
   *
   * ORDRE CHRONOLOGIQUE attendu — c'est celui dans lequel la fiche les affiche, et il vient de
   * `rateSpans`, qui parcourt les jours de la période dans l'ordre.
   *
   * Peut être VIDE : un membre sans aucun CA sur la période (aucun modèle, aucun jour) n'a
   * aucun segment à montrer, et sa base vaut 0. Ses bonus, primes et handoffs restent dus
   * (spec §10).
   */
  segments: RateSegmentInput[]
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
   * `PRIME TOP15 SETTER` — la prime du classement des setters sur la période, calculée par
   * `rankSetters` (`./setter-rank`). Une entrée comme les autres : la formule ne connaît ni le
   * rang, ni le barème, seulement le montant dû à CE membre.
   *
   * Ses deux voisines du « lot final » (tâche 22) ont été RETIRÉES le 2026-07-28, décision de
   * Benoit : `carryover` (« RESTE SEMAINE PASSEE » — jamais élucidé, « ça existera pas ») et
   * `monthlyPrime` (« PRIME TOP3 MOIS » — un montant mensuel saisi sur un écran de période
   * n'avait pas de sens à ses yeux). Celle-ci reste parce qu'elle est CALCULÉE, pas saisie.
   */
  setterPrime: number
}

/** Une ligne « modèle » de la ventilation, à l'intérieur d'un segment de taux. */
export interface PayslipModelLine {
  name: string
  ca: number
  /** `round2(ca × taux / 100)` — le montant TEL QUE LA FICHE L'AFFICHE. */
  commission: number
}

/**
 * Un segment de taux, CALCULÉ : ce que la fiche affiche, ligne à ligne.
 *
 * ⚠️ TOUS LES MONTANTS SONT DÉJÀ ARRONDIS, et ils s'additionnent EXACTEMENT :
 * `Σ models[].commission === commission`, et `Σ segments[].commission === base`. C'est la
 * raison d'être de ce type — la fiche ne recalcule RIEN, elle rend ces nombres tels quels. Un
 * `round2(ca × taux)` refait côté composant redeviendrait une seconde implémentation, et c'est
 * exactement ce qui faisait diverger le détail du total avant le 2026-07-27.
 */
export interface PayslipSegment {
  from: string
  to: string
  rate: number
  /** Ces jours sont au taux PAR DÉFAUT, faute de ligne d'historique (cf. `./rates`). */
  fallback: boolean
  /** CA du segment, tous modèles. */
  ca: number
  /** Commission du segment = Σ des lignes ci-dessous. */
  commission: number
  /** Une ligne par modèle, CA décroissant (l'ordre d'affichage de la fiche). */
  models: PayslipModelLine[]
}

export interface Payslip {
  /** CA total, tous modèles et tous segments. */
  ca: number
  base: number
  /**
   * La ventilation, segment par segment — ce que la fiche déplie. Vide si aucun CA.
   * Un seul élément dans le cas usuel (taux inchangé sur la période).
   */
  segments: PayslipSegment[]
  /** Le fixe versé sur la période — c'est `fixedAmount` arrondi, et rien d'autre : il n'existe
   *  plus qu'UNE source (les réglages). `setterAdjusted`, qui disait lequel de deux montants
   *  s'appliquait, a disparu avec le second (tâche 19). */
  setter: number
  bonus: number
  malus: number
  handoffsAmount: number
  prime: number
  sanctions: number
  /** Prime du classement setter (TOP15). */
  setterPrime: number
  net: number
}

/**
 * Fiche de paie d'une période (spec §4). Fonction PURE : aucune date, aucun accès base —
 * l'appelant a déjà borné, découpé par taux et agrégé. C'est ce qui la rend testable.
 *
 * ── LA DÉCOUPE, ET POURQUOI ELLE PRÉSERVE L'ARRONDI ────────────────────────────────────────
 * Le pourcentage est appliqué (SEGMENT DE TAUX × MODÈLE), arrondi là, puis sommé — deux niveaux
 * de regroupement au lieu d'un, la règle est INCHANGÉE : le terme élémentaire reste
 * `round2(ca × taux / 100)` et le total reste leur somme.
 *
 * C'est ce qui fait que la découpe est SANS EFFET quand le taux ne change pas : un seul segment
 * rend exactement les mêmes termes que `Σ round2(ca_modèle × taux)` d'avant. Les 83 chatteurs
 * qui tombaient déjà au centime sur la feuille de juillet ne bougent pas d'un centime, et les 12
 * qui changeaient de taux tombent à leur tour (mesuré, cf. `./rates` et le rapport de tâche 27).
 *
 * Et elle préserve l'invariant d'affichage : chaque ligne montrée par la fiche EST un des
 * `round2(...)` sommés ici (`PayslipSegment.models[].commission`), chaque sous-total de segment
 * EST leur somme, et `base` EST la somme des sous-totaux. Le détail fait le total à tous les
 * niveaux, par construction. Les sommes intermédiaires passent par `round2` non pour arrondir —
 * tous les termes sont déjà au centime — mais pour empêcher la dérive du flottant de faire
 * apparaître un `40.040000000000006` là où la fiche affiche 40,04.
 */
export function computePayslip(i: PayslipInput): Payslip {
  // ARRONDI PAR (SEGMENT, MODÈLE), PUIS SOMME — et non l'inverse (2026-07-27). La fiche de paie
  // affiche une LIGNE PAR MODÈLE (`ComptaPayslip`), et ces lignes doivent s'additionner
  // EXACTEMENT au total affiché : une fiche dont le détail ne fait pas le total ne vaut rien.
  // C'est la même règle, un cran plus bas, que l'arrondi composante par composante plus bas.
  //
  // Ce que ça coûte : jusqu'à un demi-centime par ligne d'écart avec `round2(Σ brut)` —
  // 40,04 € au lieu de 40,02 € sur 4 modèles à 100,05 € et 10 % (cf. test dédié). Écart assumé,
  // arbitré par le propriétaire.
  const segments: PayslipSegment[] = i.segments.map((s) => {
    const models: PayslipModelLine[] = Object.entries(s.modelCa)
      .map(([name, ca]) => ({ name, ca, commission: round2((ca * s.rate) / 100) }))
      // CA décroissant, puis nom : l'ordre d'affichage de la fiche, décidé ICI pour qu'il soit
      // le même partout et déterministe même à CA égal.
      .sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name, 'fr'))
    return {
      from: s.from,
      to: s.to,
      rate: s.rate,
      fallback: s.fallback,
      ca: round2(models.reduce((t, m) => t + m.ca, 0)),
      commission: round2(models.reduce((t, m) => t + m.commission, 0)),
      models,
    }
  })

  const ca = segments.reduce((t, s) => t + s.ca, 0)
  const rawBase = segments.reduce((t, s) => t + s.commission, 0)

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
  // La prime setter S'AJOUTE au net, sur sa propre ligne de fiche. Le report (`carryover`) et la
  // prime du mois (`monthlyPrime`), qui l'accompagnaient depuis la tâche 22, ont été retirés le
  // 2026-07-28 (décision de Benoit — cf. `PayslipInput.setterPrime`).
  const setterPrime = round2(i.setterPrime)
  const net = round2(
    base + setter + bonus - malus + handoffsAmount + prime - sanctions + setterPrime,
  )

  return {
    ca: round2(ca),
    base,
    segments,
    setter,
    bonus,
    malus,
    handoffsAmount,
    prime,
    sanctions,
    setterPrime,
    net,
  }
}
