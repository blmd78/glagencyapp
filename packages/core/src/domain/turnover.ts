/**
 * TURNOVER — ce que valent les dates d'entrée et de sortie une fois mises bout à bout.
 *
 * `arrived_at` (0101) et `left_at` (0102) sont saisis à la main ; ce module ne fait que les lire.
 * Il vit dans le domaine pur parce que ses deux règles sont des DÉCISIONS de mesure, pas des
 * détails d'affichage : ce qu'on refuse de compter, et ce qu'on refuse de diviser.
 */

/** Écart en jours entre deux dates 'YYYY-MM-DD', projetées sur minuit UTC avant soustraction.
 *  Sans cette projection, un changement d'heure dans l'intervalle glisse d'une heure et
 *  l'arrondi fait basculer le résultat d'un jour. `null` si l'une des deux est illisible. */
function dayDiff(from: string, to: string): number | null {
  const diff = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Number.isNaN(diff) ? null : Math.round(diff / 86_400_000)
}

/**
 * Ancienneté à la sortie, en jours. **`null` dès qu'on ne SAIT pas** — et c'est tout l'intérêt
 * de cette fonction :
 *
 *  - arrivée inconnue → `null`. C'est le cas MAJORITAIRE au démarrage (aucun des chatteurs en
 *    poste n'a de date d'arrivée saisie). Ces départs doivent être EXCLUS de la moyenne, pas
 *    comptés zéro : une ancienneté moyenne tirée vers le bas par des inconnues serait un chiffre
 *    faux présenté comme une mesure. L'appelant compte les `null` et affiche le dénominateur
 *    réel (« moyenne sur 7 départs sur 12 »).
 *  - encore en poste → `null` : son ancienneté n'est pas finie, elle n'a pas sa place dans une
 *    moyenne « à la sortie ».
 *  - sortie AVANT l'arrivée → `null` : saisie incohérente, on ne rend pas un négatif qui
 *    polluerait silencieusement l'agrégat.
 */
export function tenureDays(arrivedAt: string | null, leftAt: string | null): number | null {
  if (!arrivedAt || !leftAt) return null
  const days = dayDiff(arrivedAt, leftAt)
  if (days === null || days < 0) return null
  return days
}

/**
 * Taux de turnover d'une période : sorties ÷ effectif moyen. Rendu en PROPORTION (0.05), la
 * mise en pourcentage appartient à l'affichage.
 *
 * `null` si l'effectif moyen n'est pas strictement positif — division par zéro sur un mois sans
 * effectif, ou donnée aberrante. Un `Infinity` remonterait jusqu'à l'écran sous forme de « ∞ % »
 * ou de `NaN`, et un 0 laisserait croire à une absence de départs.
 */
export function turnoverRate(exits: number, avgHeadcount: number): number | null {
  if (!(avgHeadcount > 0)) return null
  return exits / avgHeadcount
}
