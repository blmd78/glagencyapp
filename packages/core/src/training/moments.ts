/**
 * Appariement d'un « moment » de notation (une citation choisie par le correcteur IA) au message
 * qui l'a produite — transposé de l'app Good Luck Agency (`index.html`, `norm` / `momOf`).
 *
 * Sert à replaquer les remarques SUR la conversation au lieu de les lister à côté : « ⚠️ ça coûte
 * des points » collé au message fautif vaut dix fois la même phrase dans un encadré séparé.
 *
 * Le modèle ne recopie pas toujours le message au caractère près (ponctuation, espaces, coupe) —
 * d'où la normalisation et l'inclusion DANS LES DEUX SENS : la citation peut être un extrait du
 * message, ou le message un extrait de la citation.
 */

/** Minuscules, espaces normalisés, bords rognés — la comparaison ne se fait que là-dessus. */
export function normalizeCite(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Longueur minimale pour tenter un appariement. En dessous, une citation de deux caractères
 * s'apparierait à n'importe quel message et collerait des annotations au hasard.
 */
const MIN_LENGTH = 4

/**
 * Index du premier moment dont la citation correspond au message, `null` si aucun. L'ordre des
 * `cites` fait foi : à égalité, le moment le plus haut dans la notation gagne.
 */
export function matchMomentIndex(body: string, cites: string[]): number | null {
  const target = normalizeCite(body)
  if (target.length < MIN_LENGTH) return null
  const index = cites.findIndex((cite) => {
    const c = normalizeCite(cite)
    return c.length >= MIN_LENGTH && (target.includes(c) || c.includes(target))
  })
  return index >= 0 ? index : null
}
