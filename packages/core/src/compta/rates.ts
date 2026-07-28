/**
 * TAUX DE COMMISSION DATÉ — le taux d'un chatteur change à une DATE D'EFFET, et chaque jour de
 * la période est payé au taux en vigueur ce jour-là.
 *
 * POURQUOI (mesuré le 2026-07-28 sur la feuille de juillet du propriétaire, période
 * 06 → 19/07/2026, 95 colonnes portant du CA en semaine 1) : **12 chatteurs changent de taux
 * ENTRE LES DEUX SEMAINES D'UNE MÊME PÉRIODE**, toujours à la hausse — Josaphat, JC, Ethane,
 * Salemmontin 10 → 11 % ; kwasi, Alain, Juliot 10,5 → 11 % ; Anja, Matisse, Ange, Big Jo,
 * Patrick 10 → 10,5 %. Un taux unique appliqué aux 14 jours SUR-PAIE la première semaine si on
 * monte le taux avant de payer, et SOUS-PAIE la seconde si on attend.
 */

/** Taux appliqué à un jour qu'AUCUNE ligne d'historique ne couvre — 10 %.
 *
 *  Ce n'est pas un nombre neuf : c'est le défaut de la colonne `compta_settings.rate`
 *  (migration 0084) que la compta appliquait déjà à tout membre jamais réglé, et que l'onglet
 *  Compta d'un membre en création annonce en toutes lettres (« il compte pour 10 % de
 *  commission »). L'historique daté ne l'introduit pas, il le rend VISIBLE : `RateSpan.fallback`
 *  marque chaque segment qui en dépend, et la fiche de paie le dit au lieu de le subir.
 *
 *  L'ALTERNATIVE ÉCARTÉE — faire remonter la PREMIÈRE ligne d'historique à l'infini passé (le
 *  premier réglage vaudrait rétroactivement pour tous les jours d'avant). Elle supprime le
 *  fallback mais rend la date d'effet de cette première ligne MENSONGÈRE : l'admin qui saisit
 *  « 11 % à partir du 13/07 » verrait juin repayé à 11 %. Un défaut affiché vaut mieux qu'une
 *  date qui ne dit pas la vérité.
 */
export const DEFAULT_RATE = 10

/** Une ligne d'historique de taux (`compta_rates`). */
export interface RateChange {
  /** PREMIER jour où ce taux s'applique (ISO `AAAA-MM-JJ`). */
  effectiveFrom: string
  /** Taux en %, ex. 11 pour 11 %. */
  rate: number
}

/** Un segment de jours CONSÉCUTIFS payés au même taux. */
export interface RateSpan {
  /** Premier jour du segment (ISO), inclus. */
  from: string
  /** Dernier jour du segment (ISO), inclus. */
  to: string
  rate: number
  /** `true` = aucune ligne d'historique ne couvre ces jours, c'est `DEFAULT_RATE` qui s'applique.
   *  La fiche doit le signaler : un taux implicite sur de l'argent est un piège. */
  fallback: boolean
}

/**
 * Découpe des jours en segments de taux. Fonction PURE.
 *
 * Règle : le taux en vigueur un jour J est celui de la ligne la plus récente dont
 * `effectiveFrom <= J`. À défaut, `DEFAULT_RATE`.
 *
 * Les jours sont supposés TRIÉS et consécutifs (ce sont les 14 jours d'une période,
 * `daysIn`) — la coalescence ne regarde que le taux, jamais l'écart entre deux dates.
 *
 * Le résultat est le plus COURT possible : deux jours voisins au même taux ne font qu'un
 * segment. C'est ce qui fait que le cas usuel — un seul taux sur la période — rend exactement
 * UN segment, et que la fiche de paie reste alors identique à ce qu'elle affichait avant
 * l'historisation.
 */
export function rateSpans(days: string[], history: RateChange[]): RateSpan[] {
  // Copie triée : l'appelant lit `compta_rates` sans garantie d'ordre, et un historique mal
  // trié ferait retenir la mauvaise ligne (on veut la PLUS RÉCENTE qui couvre le jour).
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  const spans: RateSpan[] = []
  for (const day of days) {
    // Balayage arrière sur un historique trié : la première ligne rencontrée dont la date
    // d'effet est atteinte est la plus récente qui couvre ce jour. (`Array.findLast` ferait
    // la même chose, mais c'est de l'ES2023 et la base cible ES2022 — cf. `tsconfig.base.json`.)
    let hit: RateChange | undefined
    for (let i = sorted.length - 1; i >= 0; i--) {
      const h = sorted[i]
      if (h && h.effectiveFrom <= day) {
        hit = h
        break
      }
    }
    const rate = hit ? hit.rate : DEFAULT_RATE
    const fallback = hit == null
    const last = spans.at(-1)
    // `fallback` participe à la coalescence : un segment au défaut 10 % et un segment RÉGLÉ à
    // 10 % ne se fondent pas, parce que la fiche ne doit pas les présenter pareil.
    if (last && last.rate === rate && last.fallback === fallback) last.to = day
    else spans.push({ from: day, to: day, rate, fallback })
  }
  return spans
}

/**
 * Taux en vigueur un jour donné — la même règle que `rateSpans`, pour un jour seul.
 *
 * Sert au CONTRÔLE de l'écriture (`writeRate` n'enregistre une ligne que si elle change
 * réellement quelque chose) et à l'affichage du taux courant dans la fiche de membre.
 */
export function rateOn(day: string, history: RateChange[]): { rate: number; fallback: boolean } {
  let best: RateChange | null = null
  for (const h of history) {
    if (h.effectiveFrom > day) continue
    if (best == null || h.effectiveFrom > best.effectiveFrom) best = h
  }
  return best ? { rate: best.rate, fallback: false } : { rate: DEFAULT_RATE, fallback: true }
}
