import type { ActionResult } from '@/lib/actions'

/**
 * Un appel de Server Action qui ne peut pas ÉCHOUER SILENCIEUSEMENT.
 *
 * Une Server Action est un POST : quand il n'arrive pas au serveur — Wi-Fi qui saute, VPN qui se
 * reconnecte, onglet mis en veille, navigation pendant l'envoi — le `fetch` rejette avec
 * `TypeError: Failed to fetch`. Ce rejet-là n'est PAS un `ActionResult` : il traverse le `await`, et
 * tout le code qui suit (`if (!r.success) { toast; refresh }`) est sauté. Résultat vu en production
 * du 2026-07 au 2026-09 (42 rejets non gérés sur l'écran de session) : le chatteur clique
 * « Envoyer », RIEN ne se passe — pas de message, pas d'erreur — et il recommence.
 *
 * On rend donc l'échec réseau sous la forme que tout le monde sait déjà traiter, plutôt que de
 * demander un `try/catch` à chaque appelant : le message part dans le même toast que les erreurs
 * métier, et l'appelant resynchronise comme d'habitude.
 *
 * ATTENTION à ce que ce retour ne dit PAS : « la requête a échoué » ne veut pas dire « le serveur
 * n'a rien fait ». La coupure peut survenir sur le chemin du RETOUR, l'action ayant déjà écrit. Le
 * texte invite donc à réessayer, ce qui suppose des actions rejouables sans dégât — c'est le cas
 * ici (l'unicité `(thread_id, position)` transforme un doublon d'envoi en « Message déjà envoyé »).
 * Avant d'utiliser ce helper sur une action non idempotente, il faut une garde équivalente.
 */
export async function callAction<T>(run: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run
  } catch {
    // Volontairement muet côté Sentry : c'est le réseau de l'utilisateur, pas notre code, et 42
    // rejets en deux mois n'ont jamais rien appris à personne. Ce qui manquait, c'était le toast.
    return { success: false, error: 'Connexion perdue — vérifie ta connexion et réessaie' }
  }
}
