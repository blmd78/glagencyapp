import { createAdminClient } from '@glagency/db'
import { getCreatorScope } from '@/lib/services/creator-scope'
import type { TodoChatter } from '../types'

/**
 * Rôle EXACT du TITULAIRE de la semaine — `getCreatorScope` en a besoin pour savoir s'il faut
 * borner son périmètre (elle ne borne que manager/sous-manager/police). Client admin, comme la
 * liste des chatteurs juste en dessous : on lit ici le profil d'un AUTRE.
 */
async function ownerRole(ownerId: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .from('profiles').select('role').eq('id', ownerId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.role ?? 'chatteur'
}

/**
 * Les chatteurs proposables dans « Session 1:1 avec » — bornés aux MÊMES périmètres que ceux que
 * `addTask` vérifiera. UNIQUEMENT pour les ENCADRANTS : un chatteur remplit sa propre to-do, il
 * ne planifie pas de 1:1 avec d'autres chatteurs — inutile de lui servir la liste.
 *
 * DEUX périmètres quand on garnit la semaine d'un AUTRE : le sien (on ne vise pas un chatteur
 * qu'on n'a pas le droit de suivre) ET celui du TITULAIRE (c'est lui qui devra clore le 1:1 —
 * une tâche déposée hors de son périmètre serait inclôturable). Sans cette intersection, le
 * sélecteur proposerait des noms que le serveur refuserait ensuite : une liste qui ment.
 *
 * Sorti de `getTodoWeek` (limite de 300 lignes, #163) sans changer de règle.
 */
export async function getTodoChatters(p: { callerId: string; callerRole: string; ownerId: string }): Promise<TodoChatter[]> {
  const chatters: TodoChatter[] = []
  const admin = createAdminClient()
  const scope = await getCreatorScope(p.callerId, p.callerRole)
  const ownerScope =
    p.callerId === p.ownerId ? scope : await getCreatorScope(p.ownerId, await ownerRole(p.ownerId))
  const { data: rows, error: cErr } = await admin
    .from('profiles')
    .select('id, display_name, profile_creators(creator_id)')
    .eq('role', 'chatteur')
    .is('left_at', null)
    .order('display_name')
  if (cErr) throw new Error(cErr.message)
  // `null` = pas de borne (admin, ou encadrant sans modèle assigné) — convention creator-scope.
  const inScope = (s: Set<string> | null, cs: { creator_id: string }[]) =>
    !s || cs.some((pc) => s.has(pc.creator_id))
  for (const r of rows ?? []) {
    const cs = r.profile_creators ?? []
    if (inScope(scope, cs) && inScope(ownerScope, cs)) {
      chatters.push({ id: r.id, name: r.display_name ?? '—' })
    }
  }
  return chatters
}
