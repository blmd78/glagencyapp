import { createAdminClient } from '@glagency/db'

/**
 * Périmètre MODÈLES de l'appelant pour les pages Police (décision Benoit 2026-08-06, appliquée
 * au Tracker puis au Rapport du soir) : manager, sous-manager et policier AVEC modèles assignés
 * sont bornés aux chatteurs/rapports de LEURS modèles (`profile_creators`). `null` = pas de
 * borne — admin, chatteur (lecture seule), et un encadrant SANS modèle assigné (repli : une
 * page vide n'aide personne).
 *
 * Cloisonnement APPLICATIF : la RLS (0078) reste volontairement ouverte — un porteur de la page
 * qui interroge l'API Supabase en direct lit tout. Même statut assumé que le décloisonnement
 * documenté du Rapport du soir. Client admin : `profile_creators` est cloisonnée par RLS alors
 * qu'on lit ici les assignations de l'appelant pour décider de l'affichage.
 *
 * Le Tracker (`features/police/services/get-police.ts`) dérive le MÊME périmètre des
 * assignations qu'il charge déjà en entier — miroir à garder aligné si la règle change.
 */
export async function getCreatorScope(
  callerId: string,
  callerRole: string,
): Promise<Set<string> | null> {
  if (callerRole !== 'manager' && callerRole !== 'sous-manager' && callerRole !== 'police') {
    return null
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', callerId)
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((r) => r.creator_id)
  return ids.length > 0 ? new Set(ids) : null
}

/**
 * Le CHATTEUR cible est-il dans le périmètre ? (assigné à au moins un des modèles du scope.)
 * Pour les ÉCRITURES du Tracker (audit 2026-08-06 : le cloisonnement ne vivait que dans les
 * options de l'UI — un appel forgé sanctionnait n'importe quel chatteur de l'agence, malus de
 * paie compris). `scope` null = pas de borne → toujours vrai.
 */
export async function isChatterInScope(
  scope: Set<string> | null,
  chatterId: string,
): Promise<boolean> {
  if (!scope) return true
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profile_creators')
    .select('creator_id')
    .eq('profile_id', chatterId)
  if (error) throw new Error(error.message)
  return (data ?? []).some((r) => scope.has(r.creator_id))
}

/**
 * Les PROFILS visibles, en UNE lecture — la question renversée.
 *
 * `isChatterInScope` interroge la base par chatteur : sur une centaine de lignes ça ferait une
 * centaine d'allers-retours. On demande plutôt « quels profils sont assignés à MES modèles » et
 * le filtre devient un `Set`. `null` = aucune borne (admin, ou encadrant sans assignation).
 *
 * Va PAR PAIRE avec `allowedProfileIds` : le relevé de présence teste les deux, parce que ses
 * lignes portent deux clés d'identité et qu'une personne sans compte membre n'existe que dans
 * l'une. Tester une seule des deux, c'est cacher à un encadrant les lignes de SES modèles.
 */
export async function allowedProfileIds(scope: Set<string> | null): Promise<Set<string> | null> {
  if (!scope) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profile_creators')
    .select('profile_id')
    .in('creator_id', [...scope])
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.profile_id))
}

/**
 * Les CHATTEURS visibles (`chatters.id`), en une lecture — le pendant d'`allowedProfileIds`
 * sur la clé d'identité du CRM.
 *
 * Indispensable depuis 0144 : le relevé MyPuls nomme désormais les gens par leur `chatters`,
 * et la majorité d'entre eux n'a pas de compte membre (486 lignes `chatters` pour 110 profils
 * rattachés en production). Borner uniquement par `profile_creators` aurait donc caché à un
 * encadrant les 29 % de lignes qui parlent de SES modèles, faute de compte en face.
 *
 * `chatter_creators` est la table d'assignation côté chatteur, celle que money-team alimente.
 * `null` = aucune borne (admin, ou encadrant sans modèle assigné).
 */
export async function allowedChatterIds(scope: Set<string> | null): Promise<Set<string> | null> {
  if (!scope) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chatter_creators')
    .select('chatter_id')
    .in('creator_id', [...scope])
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.chatter_id))
}
