import { revalidatePath } from 'next/cache'
import { BusinessError, requireWriteProfileLive } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import { canEditHabit } from './habit-rules'

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
 * l'encadrement. Miroir à garder aligné si la règle change ; c'est le prix assumé.
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
  // un `true` rendu sans regarder la valeur laisse passer `?owner=nawak` jusqu'aux sept requêtes
  // de `getTodoWeek`, dont les `.eq('owner_id', …)` sur des colonnes uuid lèvent une 22P02 — la
  // page tombe sur son error boundary au lieu d'ignorer le paramètre. Un paramètre d'URL bricolé
  // doit être sans effet, pas fatal.
  if (!UUID.test(ownerId)) return false
  if (profile.role !== 'admin' && profile.baseRole !== 'manager') return false

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, pages, manager_ids')
    .eq('id', ownerId)
    .is('left_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return false

  // LA CIBLE DOIT POUVOIR OUVRIR SA TO-DO. Sans ce test, on assigne du travail dans un outil que
  // la personne ne peut pas ouvrir — et la tâche déposée la fait ensuite apparaître au Récap de
  // son manager en « 0/N débriefs », c'est-à-dire le reproche structurel que 0137 dit justement
  // vouloir éviter. Le droit est la règle UNIQUE de toute la feature : qui l'a est attendu, qui ne
  // l'a pas n'existe pas encore pour cet écran. Vaut aussi pour l'admin, dont le `?owner=` visait
  // sinon n'importe quel uuid bien formé, chatteur compris.
  if (!canOpenTodo(data.role, data.pages)) return false

  if (profile.role === 'admin') return true
  return data.role === 'sous-manager' && (data.manager_ids ?? []).includes(profile.id)
}

/**
 * La personne peut-elle ouvrir la To-Do ? Miroir EXACT de `hasPageAccess` (lib/auth) appliqué à
 * QUELQU'UN D'AUTRE que l'appelant — les admins passent sans porter le slug. Exporté parce que
 * `getTodoHolders` doit trancher la même question sur une liste, et que deux formulations de cette
 * règle divergeraient.
 */
export function canOpenTodo(role: string | null, pages: string[] | null): boolean {
  return role === 'admin' || role === 'superadmin' || (pages ?? []).includes('presence')
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
