import { round2 } from '../domain/dates'

/**
 * CLASSEMENT SETTER (TOP15) — la prime de l'onglet `CLASSEMENT SETTER` de la feuille.
 *
 * Le classement porte sur les HANDOFFS DE LA PÉRIODE de paie (Benoit : « met en 2 semaines tkt
 * pas »), et sur les handoffs SAISIS DANS L'APP (`compta_day_entries` + `compta_week_entries`).
 *
 * ⚠️ Le comptage qui fait foi n'est pas tranché : l'onglet CLASSEMENT SETTER du propriétaire et
 * les handoffs de sa propre compta DIVERGENT (Godgive : 86 contre 111 en juin). On prend les
 * handoffs de l'app — la seule donnée dont on garantisse la provenance — et on le dit, plutôt que
 * de faire coïncider les chiffres par un ajustement dont personne ne retrouverait la trace.
 */

/** Une tranche du barème (`compta_setter_scale`). */
export interface SetterScaleRow {
  /** 1 = le mieux payé. */
  rank: number
  amount: number
}

export interface SetterRank {
  /** `profiles.id` — la clé du membre, telle que l'appelant l'a fournie. */
  id: string
  handoffs: number
  /** Rang « compétition » : les ex æquo le PARTAGENT, et le suivant saute d'autant (1, 2, 2, 4). */
  rank: number
  /** Prime due au titre de ce rang. 0 € au-delà du barème. */
  amount: number
}

/**
 * Classe des membres par handoffs décroissants et leur affecte la prime du barème. Fonction
 * PURE : l'appelant a déjà choisi la population et agrégé la période.
 *
 * ── EX ÆQUO : RANG PARTAGÉ, PRIME MISE EN COMMUN PUIS DIVISÉE ────────────────────────────────
 * `k` ex æquo occupent les `k` tranches consécutives à partir de leur rang commun ; ces `k`
 * montants sont ADDITIONNÉS puis divisés à parts égales. Deux à 71 handoffs sur les tranches 6 et
 * 7 (120 € et 115 €) touchent donc 117,50 € chacun.
 *
 * TROIS RAISONS, dans l'ordre où elles comptent :
 *
 *  1. AUCUN DÉPARTAGE ARBITRAIRE. Toute autre règle doit trancher entre deux personnes aux
 *     performances IDENTIQUES : par nom, par identifiant, par ordre d'arrivée dans la requête.
 *     Les deux premiers font perdre 5 € à quelqu'un pour une raison étrangère à son travail, à
 *     chaque période ; le troisième est le défaut SILENCIEUX que ce classement doit exclure — un
 *     `.sort()` est stable en JS, donc un tri par handoffs seul conserverait l'ordre d'entrée
 *     entre égaux, et la prime dépendrait de l'ordre des lignes rendues par Postgres. Ici la
 *     question ne se pose pas : le résultat ne dépend d'AUCUN ordre.
 *
 *  2. LE BARÈME EST UN BUDGET DE 15 TRANCHES, et il est dépensé exactement une fois. La règle
 *     esquissée au plan (« rang partagé, montant du rang le plus favorable ») versait 120 € aux
 *     DEUX ex æquo — 5 € de plus que prévu — et laissait la tranche 7 (115 €) jamais payée.
 *     Ici la somme distribuée est invariante : elle vaut Σ du barème, avec ou sans ex æquo.
 *
 *  3. C'EST CE QUE LE PROPRIÉTAIRE A DÉPENSÉ. Juin, deux paires d'ex æquo : Andria et Martin à
 *     71 handoffs (120 € + 115 € = 235 €), Erielly et André à 66 (105 € + 100 € = 205 €). Il a
 *     donc bien consommé DEUX tranches par paire — cette règle reproduit ses TOTAUX au centime.
 *     Seul le partage interne diffère (117,50 / 117,50 au lieu de 120 / 115) : son écart à lui
 *     n'est justifié par aucune donnée, c'est l'ordre des lignes de sa feuille.
 *
 * Coût assumé : `k` ne divise pas toujours le total au centime (3 ex æquo sur 100 € donnent
 * 33,33 € chacun, soit 99,99 € distribués). L'écart est borné à moins d'un centime par personne.
 *
 * ── LES AUTRES CHOIX ─────────────────────────────────────────────────────────────────────────
 * • `handoffs <= 0` n'est PAS classé (absent du résultat) : un setter sans un seul handoff
 *   toucherait sinon la 15e tranche pour n'avoir rien fait, dès que la population est courte.
 * • Le résultat contient TOUT LE MONDE, y compris au-delà du barème — avec 0 €. C'est l'écran qui
 *   décide de couper : masquer les non-primés ici empêcherait d'afficher un classement complet.
 * • Un barème incomplet (moins de tranches que de membres, ou des rangs manquants) ne fait pas
 *   d'erreur : une tranche absente vaut 0 €.
 * • L'ordre du tableau rendu se départage par `id` croissant. C'est de la PRÉSENTATION seule —
 *   `rank` et `amount` ne s'en déduisent jamais — mais il rend la sortie canonique : le même
 *   ensemble d'entrées donne le même tableau, quel que soit l'ordre où il arrive.
 */
export function rankSetters(
  handoffsByMember: Record<string, number>,
  scale: SetterScaleRow[],
): SetterRank[] {
  const amountOfRank = new Map(scale.map((s) => [s.rank, s.amount]))

  const ordered = Object.entries(handoffsByMember)
    .filter(([, handoffs]) => handoffs > 0)
    .sort(([idA, hA], [idB, hB]) => hB - hA || (idA < idB ? -1 : idA > idB ? 1 : 0))

  const out: SetterRank[] = []
  let i = 0
  while (i < ordered.length) {
    const handoffs = ordered[i][1]
    // Fin du groupe d'ex æquo : le premier qui n'a pas le même compte.
    let end = i + 1
    while (end < ordered.length && ordered[end][1] === handoffs) end++

    const size = end - i
    const rank = i + 1 // rang « compétition » : autant de membres devant, plus un.
    let pooled = 0
    for (let slot = rank; slot < rank + size; slot++) pooled += amountOfRank.get(slot) ?? 0
    const amount = round2(pooled / size)

    for (let k = i; k < end; k++) out.push({ id: ordered[k][0], handoffs, rank, amount })
    i = end
  }
  return out
}
