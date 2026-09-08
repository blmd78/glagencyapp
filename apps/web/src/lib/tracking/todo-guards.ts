import { revalidatePath } from 'next/cache'
import { BusinessError, DENY_WRITE, requirePageProfileLive } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { canEditHabit } from './habit-rules'
import { canOrganizeTodoOf, canWriteTodo } from './todo-roles'

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
 * Le droit d'écrire quoi que ce soit sur une to-do de tracker : la page, et un rôle qui a une
 * to-do (`canWriteTodo`).
 *
 * Ce n'est PLUS `requireWriteProfileLive` depuis le 2026-09-08. Cette garde-là dérivait de
 * `hasWriteAccess`, miroir applicatif de `can_write_page()` (0060) — admin, ou
 * manager/sous-manager porteur du slug — et le rôle `police` n'y est pas : le policier se voyait
 * refuser jusqu'à la coche de SA propre tâche. Or il a désormais une to-do comme un manager
 * (décision de Benoit du 2026-09-08). Élargir `hasWriteAccess` était exclu : c'est le miroir
 * d'une fonction SQL que dix-huit policies d'écriture utilisent, et la police n'a rien à y faire.
 * La To-Do porte donc sa propre règle, `canWriteTodo` (`todo-roles.ts`), qui garde la condition
 * qui comptait : la case « Présence » de Membres n'est bornée par aucun rôle
 * (`config/workspaces.ts:137`), un chatteur à qui on la coche reste sans écriture.
 *
 * Le suffixe `Live` refuse en plus la consultation « en tant que » : on ne coche pas la to-do de
 * quelqu'un sous son identité.
 */
export async function requireTodoAccess(): Promise<Profile> {
  const profile = await requirePageProfileLive('presence')
  if (!canWriteTodo(profile.baseRole, profile.pages)) throw new BusinessError(DENY_WRITE)
  return profile
}

/**
 * L'ATTESTATION RESTE CELLE DE SON TITULAIRE — l'admin est ici volontairement BLOQUÉ.
 *
 * Ce qu'il reste de la règle du tracker d'origine (« Il ne coche pas, ne déplace pas, ne touche ni
 * aux habitudes ni au debrief », routes.js.txt:277-281) après la décision de Benoit du
 * 2026-09-07 : « les managers ont tous les droits sur leurs sous-managers, ils peuvent gérer leur
 * emploi du temps comme ils veulent ». La frontière n'est donc plus « titulaire / pas titulaire »
 * mais ORGANISER / ATTESTER :
 *
 * • ORGANISER — ce qu'il y a à faire et quand : déposer, déplacer, supprimer, les sections, les
 *   habitudes, le jour de repos. Ouvert à l'encadrement par `assertCanOrganize`.
 * • ATTESTER — dire que c'est fait, et avec quels mots : la coche (`toggleTask`), le débrief
 *   quotidien et les notes de la semaine (`saveDaily`, `saveNotes`), les liens personnels. C'est
 *   la parole du titulaire, et elle ne se délègue pas : cocher une tâche « 1:1 » crée une SESSION
 *   NOTÉE dans la fiche du chatteur, signée au nom de quelqu'un qui n'a pas mené l'entretien. Ces
 *   gestes-là gardent `assertOwner`, admin compris.
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
 * Lu par les deux gardes ci-dessous ET par la page (validation de `?owner=`). C'est la seule
 * DÉCISION : la page est l'endroit où une divergence serait silencieuse — la RLS de
 * `tracker_todo_tasks` (0127:142) laisse tout porteur du slug lire n'importe quelle semaine, donc
 * un `?owner=` non validé suffirait à ouvrir celle de n'importe qui.
 *
 * `getTodoHolders` en est un MIROIR, en SQL et non en JS : il liste, il ne décide pas — la garde
 * repasse derrière sur chaque écriture. Le filtre y est fait dans la requête parce qu'il tourne en
 * service-role : un `.filter()` après coup aurait quand même rapatrié tout l'annuaire de
 * l'encadrement. Miroir à garder aligné si la règle change ; c'est le prix assumé. Le troisième
 * miroir est SQL : la RPC du Récap (`tracker_todo_week_recap`, 0150) rend les mêmes périmètres.
 *
 * La règle elle-même vit en `todo-roles.ts` (`canOrganizeTodoOf`, pure et testée) — admin → tout
 * le monde, manager → ses sous-managers rattachés, police → tous les sous-managers. Ici on ne
 * fait que deux choses qu'elle ne peut pas faire : valider la FORME de l'id, et lire la cible.
 *
 * Client SESSION (et non service-role) : `profiles_self_admin_or_team_read` (0097) laisse tout
 * encadrant lire les profils, la RLS suffit donc ici et reste le filet.
 */
export async function canAssignTodoOf(profile: Profile, ownerId: string): Promise<boolean> {
  // Forme de l'id validée EN PREMIER, avant même la dérogation admin. `?owner=` vient de l'URL :
  // un `true` rendu sans regarder la valeur laisse passer `?owner=nawak` jusqu'aux sept requêtes
  // de `getTodoWeek`, dont les `.eq('owner_id', …)` sur des colonnes uuid lèvent une 22P02 — la
  // page tombe sur son error boundary au lieu d'ignorer le paramètre. Un paramètre d'URL bricolé
  // doit être sans effet, pas fatal.
  if (!UUID.test(ownerId)) return false
  // Court-circuit : les rôles qui n'ont AUCUNE dérogation, quelle que soit la cible — inutile
  // d'aller lire un profil pour eux. La liste est celle de `canOrganizeTodoOf`, qui retranche
  // ensuite ce que chacun peut réellement viser.
  if (!['admin', 'superadmin', 'manager', 'police'].includes(profile.baseRole)) return false

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, pages, manager_ids')
    .eq('id', ownerId)
    .is('left_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return false

  return canOrganizeTodoOf({
    callerId: profile.id,
    // `baseRole` et NON `role` : ce dernier écrase manager/sous-manager/police en 'chatteur'
    // (lib/auth) — la dérogation du manager et celle du policier disparaîtraient toutes deux.
    callerRole: profile.baseRole,
    target: { role: data.role, pages: data.pages, managerIds: data.manager_ids },
  })
}

/**
 * ORGANISER une semaine : la sienne, ou celle de quelqu'un qu'on encadre.
 *
 * LA garde de tout ce qui touche au contenu du planning — déposer une tâche ou une habitude
 * (`assignTarget`, routes.js.txt:282-304), la déplacer, la supprimer, créer et remanier les
 * sections, poser un jour de repos. Le legacy n'ouvrait que le dépôt et le retrait de ce qu'on
 * avait soi-même déposé ; le reste tombait sur `assertOwner`, si bien qu'un manager pouvait
 * garnir la semaine de son sous-manager sans pouvoir la RÉORGANISER — pas même créer la section
 * où ranger ce qu'il déposait. Décision de Benoit, 2026-09-07 : « ils peuvent gérer leur emploi
 * du temps comme ils veulent ».
 *
 * Ce que cette ouverture emporte, et qui est assumé : la suppression d'une tâche que le titulaire
 * s'était donnée lui-même devient possible, alors qu'il n'existe AUCUN journal sur les tables
 * `tracker_todo_*` — un retrait est donc muet. La contrepartie serait un journal ; ce n'est pas
 * ce qui a été demandé.
 *
 * Rend le PROFIL de l'appelant, et non son seul id : le handler a besoin de son `baseRole` pour
 * calculer le périmètre modèles d'une tâche 1:1. Le lui rendre ici évite un second `getProfile()`
 * dans le handler — la garde l'a déjà résolu, et les guidelines interdisent le double contrôle.
 */
export async function assertCanOrganize(ownerId: string): Promise<Profile> {
  const profile = await requireTodoAccess()
  if (profile.id === ownerId) return profile
  if (!(await canAssignTodoOf(profile, ownerId))) throw new BusinessError("Ce n'est pas ta semaine.")
  return profile
}

/**
 * TOUCHER UNE HABITUDE (renommer, mettre en pause, supprimer).
 *
 * Une garde à part de `assertCanOrganize`, pour UN cas qu'elle ne sait pas dire : l'habitude
 * déposée est verrouillée POUR SON TITULAIRE (décision de Benoit, 2026-09-07 — si le sous-manager
 * peut éteindre le rituel qu'on lui pose, on est revenu à devoir le renoter chaque semaine). Le
 * titulaire passe `assertCanOrganize` par définition ; c'est donc ici, et seulement ici, qu'on
 * regarde à QUI est le gabarit.
 *
 * DEUX questions, dans cet ordre :
 *   1. ai-je affaire à cette semaine ? (la mienne, ou une où j'ai la dérogation AUJOURD'HUI —
 *      un rattachement retiré referme donc la porte, même sur ce qu'on avait déposé avant) ;
 *   2. ce gabarit-là, ai-je le droit d'y toucher ? (`canEditHabit`, la règle pure) — oui pour
 *      l'encadrement du titulaire, oui pour le titulaire sur les SIENNES, non sur celles qu'on
 *      lui a déposées.
 *
 * Lecture au client SESSION : `tracker_todo_habits_read` (0127) ouvre la lecture à tout porteur du
 * droit `presence`, la RLS suffit donc et reste le filet. L'ÉCRITURE, elle, part en service-role
 * dans l'action, comme partout sur ces tables.
 */
export async function assertCanEditHabit(ownerId: string, habitId: string): Promise<string> {
  const profile = await requireTodoAccess()
  // Retenu plutôt que jeté : c'est LA réponse à la 2ᵉ question pour un encadrant, et la
  // redemander plus bas coûterait une seconde lecture de profil.
  const canOrganize = profile.id !== ownerId && (await canAssignTodoOf(profile, ownerId))
  if (profile.id !== ownerId && !canOrganize) throw new BusinessError("Ce n'est pas ta semaine.")

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_todo_habits')
    .select('created_by')
    .eq('id', habitId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BusinessError("Cette habitude n'existe plus.")

  if (
    !canEditHabit({
      callerId: profile.id,
      callerRole: profile.role,
      ownerId,
      createdBy: data.created_by,
      canOrganize,
    })
  ) {
    // Message écrit pour le TITULAIRE, qui est le seul à pouvoir buter ici de bonne foi : il voit
    // une habitude dans SA semaine et ne comprendrait pas un « ce n'est pas ta semaine ».
    throw new BusinessError(
      "Cette habitude t'a été déposée par ton encadrement : tu peux la sauter un jour donné, pas la retirer.",
    )
  }
  return profile.id
}
