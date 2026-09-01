import { revalidatePath } from 'next/cache'
import { BusinessError, requireWriteProfileLive } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'

/**
 * Gardes de propriété de la To-Do du tracker.
 *
 * En `lib/` et non dans la feature parce qu'elles sont PARTAGÉES : la clôture d'une tâche « 1:1 »
 * (`complete-one-to-one.ts`) est déclenchée depuis l'écran de suivi, la page de la To-Do valide
 * son `?owner=` avec le même prédicat, et la frontière ESLint interdit le cross-feature. Même
 * précédent que `lib/training/start-session.ts` et `lib/impersonation/actions.ts`.
 */


/** Chemin de la to-do — revalidé par toutes ses mutations, via `revalidateTodo` uniquement. */
const TODO_PATH = '/chatter/presence/todo'
/** Forme d'un uuid — `?owner=` arrive de l'URL, il n'est pas encore une clé de base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Le Récap agrège les tâches ET les débriefs de la semaine : toute mutation de to-do le périme. */
const RECAP_PATH = '/chatter/presence/recap'

/**
 * Revalidation des DEUX écrans qu'une mutation de to-do périme.
 *
 * Seul `saveDaily` revalidait le Récap ; les tâches ne revalidaient que la To-Do, alors que ce
 * sont elles qui alimentent « prévues / faites / % ». Tant que le Récap était l'écran d'un seul
 * admin, le décalage passait inaperçu ; ouvert à l'encadrement, il devient un compteur qui ne
 * bouge pas quand un sous-manager coche sa tâche. Un seul appel pour ne plus avoir à y penser.
 */
export function revalidateTodo(): void {
  revalidatePath(TODO_PATH)
  revalidatePath(RECAP_PATH)
}

/**
 * Le droit d'écrire quoi que ce soit sur une to-do de tracker : la page, et un rôle d'encadrement.
 *
 * `requireWriteProfileLive` et NON `requirePageProfileLive` : le commentaire d'origine disait déjà
 * « la to-do est réservée aux ENCADRANTS », mais le prédicat employé (`hasPageAccess`) se contente
 * de « admin OU slug ». Or la case « Présence » de Membres n'est bornée par aucun rôle
 * (`config/workspaces.ts:137`) : un chatteur à qui on la coche obtenait les dix-huit Server
 * Actions d'écriture en service-role. `hasWriteAccess` ajoute la condition manquante (admin, ou
 * manager/sous-manager porteur du slug) — miroir applicatif de `can_write_page()` (0060).
 * Le suffixe `Live` refuse en plus la consultation « en tant que » : on ne coche pas la to-do de
 * quelqu'un sous son identité.
 */
async function requireTodoAccess() {
  return requireWriteProfileLive('presence')
}

/**
 * LE TRAVAIL RESTE CELUI DE SON TITULAIRE — l'admin est ici volontairement BLOQUÉ.
 *
 * C'est la règle du tracker d'origine, dont le commentaire est sans ambiguïté : « Il ne coche pas,
 * ne déplace pas, ne touche ni aux habitudes ni au debrief » (routes.js.txt:277-281). Son
 * décorateur `todoApi` répond 403 « ce n'est pas ta semaine » dès que `owner !== v.accountId`,
 * SANS dérogation admin, sur la coche, le déplacement, les habitudes et les liens.
 *
 * Notre version autorisait l'admin partout — il pouvait donc cocher le travail d'un encadrant et
 * SIGNER SON DÉBRIEF à sa place. Les deux seules dérogations du legacy (déposer une tâche, la
 * retirer) vivent dans `assertCanAssign` / `assertCanUnassign`.
 *
 * Vérifié UNE fois, dans le handler — jamais en double dans `guard`.
 */
export async function assertOwner(ownerId: string): Promise<string> {
  const profile = await requireTodoAccess()
  if (profile.id !== ownerId) throw new BusinessError("Ce n'est pas ta semaine.")
  return profile.id
}

/**
 * QUI PEUT OUVRIR ET GARNIR LA SEMAINE D'UN AUTRE — prédicat unique de la dérogation.
 *
 * Lu par les deux gardes ci-dessous ET par la page (validation de `?owner=`) ET par la liste du
 * sélecteur de comptes (`getTodoHolders`). Une seule source : trois copies divergeraient au
 * premier correctif, et la page est le seul endroit où la divergence serait silencieuse — la RLS
 * de `tracker_todo_tasks` (0127:142) laisse tout porteur du slug lire n'importe quelle semaine,
 * donc un `?owner=` non validé suffirait à ouvrir celle de n'importe qui.
 *
 * • admin/superadmin : tout le monde (dérogation historique du legacy) ;
 * • manager : ses sous-managers RATTACHÉS — miroir applicatif de `can_manage_planning_of`
 *   (0092:70-85), `baseRole` strict pour que la règle ne déborde pas sur les sous-managers ;
 * • quiconque d'autre : personne.
 *
 * Client SESSION (et non service-role) : `profiles_self_admin_or_team_read` (0097) laisse tout
 * encadrant lire les profils, la RLS suffit donc ici et reste le filet.
 */
export async function canAssignTodoOf(profile: Profile, ownerId: string): Promise<boolean> {
  // Forme de l'id validée EN PREMIER, avant même la dérogation admin. `?owner=` vient de l'URL :
  // pour un admin, un `true` rendu ici sans regarder la valeur laisse passer `?owner=nawak`
  // jusqu'aux sept requêtes de `getTodoWeek`, dont les `.eq('owner_id', …)` sur des colonnes uuid
  // lèvent une 22P02 — la page tombe sur son error boundary au lieu d'ignorer le paramètre.
  // Un paramètre d'URL bricolé doit être sans effet, pas fatal.
  if (!UUID.test(ownerId)) return false
  if (profile.role === 'admin') return true
  if (profile.baseRole !== 'manager') return false
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, manager_ids')
    .eq('id', ownerId)
    .is('left_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.role === 'sous-manager' && (data.manager_ids ?? []).includes(profile.id)
}

/**
 * DÉPOSER une tâche : sur sa propre semaine, ou sur celle de quelqu'un qu'on encadre
 * (`assignTarget`, routes.js.txt:282-304).
 *
 * Rend le PROFIL de l'appelant, et non son seul id : le handler a besoin de son `baseRole` pour
 * calculer le périmètre modèles d'une tâche 1:1. Le lui rendre ici évite un second `getProfile()`
 * dans le handler — la garde l'a déjà résolu, et les guidelines interdisent le double contrôle.
 */
export async function assertCanAssign(ownerId: string): Promise<Profile> {
  const profile = await requireTodoAccess()
  if (profile.id === ownerId) return profile
  if (!(await canAssignTodoOf(profile, ownerId))) throw new BusinessError("Ce n'est pas ta semaine.")
  return profile
}

/**
 * RETIRER une tâche de la semaine d'un autre — « l'admin peut retirer ce qu'il a déposé, ou
 * corriger une erreur » (routes.js.txt:306-315).
 *
 * La règle « ce qu'il a déposé » n'avait jamais été codée : `deleteTask` partageait la garde du
 * dépôt et ne regardait pas `created_by`. Tant que la dérogation était admin-only, c'était sans
 * portée. Étendue au manager, elle lui donnerait la suppression de N'IMPORTE QUELLE tâche de son
 * sous-manager — y compris une tâche « 1:1 » déjà rattachée à une session (0133) — et il n'existe
 * AUCUN journal sur les tables `tracker_todo_*` : la suppression serait muette. D'où la condition
 * `created_by = moi` pour tout non-admin. L'admin, lui, garde le droit de corriger.
 */
export async function assertCanUnassign(ownerId: string, taskId: string): Promise<string> {
  const profile = await requireTodoAccess()
  if (profile.id === ownerId) return profile.id
  if (!(await canAssignTodoOf(profile, ownerId))) throw new BusinessError("Ce n'est pas ta semaine.")
  if (profile.role === 'admin') return profile.id

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_todo_tasks')
    .select('created_by')
    .eq('id', taskId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError("Cette tâche n'existe plus.")
  if (data.created_by !== profile.id) {
    throw new BusinessError('Tu ne peux retirer que les tâches que tu as déposées.')
  }
  return profile.id
}
