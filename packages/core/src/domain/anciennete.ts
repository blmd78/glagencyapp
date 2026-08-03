import { todayParis } from './dates'

/**
 * ANCIENNETÉ D'UN MEMBRE — la règle « depuis quand est-il là ».
 *
 * Le drapeau « nouvel arrivant » est posé À LA MAIN (`profiles.is_new`, migration 0101) parce que
 * la date de création du compte CRM et l'arrivée réelle dans l'agence divergent souvent : un
 * chatteur peut être créé tardivement alors qu'il travaille depuis deux mois, ou l'inverse.
 * Dériver le badge de `created_at` aurait affiché « nouveau » à des anciens et rien à des
 * nouveaux — c'est une saisie humaine, assumée comme telle.
 *
 * Corollaire d'un drapeau manuel : personne ne le retire. Passé ce seuil, l'app le réclame.
 */
export const NEW_THRESHOLD_DAYS = 30

/**
 * Jours écoulés depuis l'arrivée, en JOURS CIVILS PARIS. `null` = pas de date d'arrivée (ou date
 * illisible). Jamais négatif : une date future (embauche annoncée) compte 0 jour.
 *
 * Le calcul projette les deux bornes sur minuit UTC AVANT de soustraire. Sans ça, un changement
 * d'heure dans l'intervalle (mars/octobre) glisserait d'une heure et l'arrondi ferait basculer le
 * verdict un jour trop tôt.
 *
 * `today` est injectable pour les tests, et pour un appelant qui a déjà son jour de référence.
 * Par défaut `todayParis()` — JAMAIS `new Date()` brut : le serveur tourne en UTC sur Vercel, donc
 * entre minuit et 2 h heure de Paris le jour UTC est encore la veille (cf. le commentaire de
 * `todayParis`), et le serveur et le client conclueraient différemment.
 */
export function daysSinceArrival(
  arrivedAt: string | null,
  today: string = todayParis(),
): number | null {
  if (!arrivedAt) return null
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${arrivedAt}T00:00:00Z`)
  if (Number.isNaN(diff)) return null
  return Math.max(0, Math.round(diff / 86_400_000))
}

/**
 * Marqué nouveau ET là depuis PLUS que le seuil = le drapeau est à retirer. Le jour du seuil
 * exact ne déclenche rien (« plus d'un mois », pas « un mois »).
 *
 * Source unique du verdict : le badge l'utilise pour sa couleur, la page Membres pour son
 * compteur « N à revoir ». Deux calculs, ce serait un drift assuré.
 */
export function isStaleNew(
  isNew: boolean,
  arrivedAt: string | null,
  today: string = todayParis(),
): boolean {
  if (!isNew) return false
  const days = daysSinceArrival(arrivedAt, today)
  return days !== null && days > NEW_THRESHOLD_DAYS
}
