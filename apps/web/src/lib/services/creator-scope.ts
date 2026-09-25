import { createAdminClient } from '@glagency/db'
import { creatorsByProfile, inCreatorScope } from './creator-scope-rules'

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
 * assignations qu'il charge déjà en entier — par la même règle pure (`creator-scope-rules.ts`).
 *
 * Ce scope est celui de l'APPELANT (ses modèles, par son compte). Le CHATTEUR visé, lui, appartient
 * aux modèles de ses DEUX rattachements, compte et MyPuls (`creatorsByProfile`, 2026-09-14).
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
 * Le CHATTEUR cible est-il dans le périmètre ? (rattaché à au moins un des modèles du scope, par
 * son compte OU par son chatteur MyPuls — `creatorsByProfile`.) Pour les ÉCRITURES du Tracker
 * (audit 2026-08-06 : le cloisonnement ne vivait que dans les options de l'UI — un appel forgé
 * sanctionnait n'importe quel chatteur de l'agence, malus de paie compris) et l'accès à la fiche
 * d'activité. `scope` null = pas de borne → toujours vrai.
 */
export async function isChatterInScope(
  scope: Set<string> | null,
  chatterId: string,
): Promise<boolean> {
  if (!scope) return true
  const admin = createAdminClient()
  const [links, profile] = await Promise.all([
    admin.from('profile_creators').select('profile_id, creator_id').eq('profile_id', chatterId),
    admin.from('profiles').select('id, chatter_id').eq('id', chatterId).maybeSingle(),
  ])
  if (links.error) throw new Error(links.error.message)
  if (profile.error) throw new Error(profile.error.message)
  let chatterLinks: { chatter_id: string; creator_id: string }[] = []
  if (profile.data?.chatter_id) {
    const { data, error } = await admin
      .from('chatter_creators')
      .select('chatter_id, creator_id')
      .eq('chatter_id', profile.data.chatter_id)
    if (error) throw new Error(error.message)
    chatterLinks = data ?? []
  }
  const creators = creatorsByProfile(links.data ?? [], chatterLinks, profile.data ? [profile.data] : [])
  return inCreatorScope(scope, creators.get(chatterId))
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
 *
 * S'y ajoutent les chatteurs MyPuls des COMPTES placés sur ces modèles par Organisation
 * (`profile_creators` → `profiles.chatter_id`). `chatter_creators` n'a plus bougé depuis son
 * import du 2026-07-01 : toute modèle créée depuis (Juliette, Elsa, Romy, les comptes privés) y
 * a zéro ligne, et le relevé la cachait à son manager alors qu'Orga l'y avait placée — les lignes
 * du relevé ne portent un `profile_id` que si le lien compte ↔ chatteur existait AU MOMENT de
 * l'import. Passer par `chatter_id` rend le placement Orga effectif sur tout l'historique.
 */
export async function allowedChatterIds(scope: Set<string> | null): Promise<Set<string> | null> {
  if (!scope) return null
  const admin = createAdminClient()
  const [links, members] = await Promise.all([
    admin.from('chatter_creators').select('chatter_id').in('creator_id', [...scope]),
    admin.from('profile_creators').select('profiles(chatter_id)').in('creator_id', [...scope]),
  ])
  if (links.error) throw new Error(links.error.message)
  if (members.error) throw new Error(members.error.message)
  const out = new Set((links.data ?? []).map((r) => r.chatter_id))
  for (const m of members.data ?? []) if (m.profiles?.chatter_id) out.add(m.profiles.chatter_id)
  return out
}
