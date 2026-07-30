import { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'

/**
 * Map `chatterId → attributs CRM du MEMBRE lié`, résolue depuis `profiles.chatter_id` : le closing
 * (rôle setter/closer + équipe rouge/bleue, 0077/0079) et le drapeau « nouvel arrivant » (0101).
 * Source UNIQUE de cette résolution côté Chatteurs et Spenders (évite la duplication et le drift
 * entre les deux services).
 *
 * Client admin : agence-wide (la RLS `profiles` cloisonne par équipe et masquerait des liens). Ne
 * remonte QUE ces attributs — aucun email, aucun nom. Un chatteur non lié est absent de la map, et
 * l'appelant retombe donc sur `null`/`false` : une fiche MyPuls sans membre ne correspond à
 * personne dans l'équipe actuelle.
 */
export async function getClosingByChatter(): Promise<
  Map<
    string,
    { role: CrmRole | null; team: CrmTeam | null; isNew: boolean; arrivedAt: string | null }
  >
> {
  const admin = createAdminClient()
  // fetchAll : `profiles` grossit avec l'équipe (cap PostgREST 1000 silencieux, s'applique
  // aussi au service role) — même requête que linkable-chatters, déjà paginée. `.order('id')`
  // = la PK, tri déterministe.
  const { data, error } = await fetchAll((f, t) =>
    admin
      .from('profiles')
      .select('chatter_id, closing_role, closing_team, is_new, arrived_at')
      .not('chatter_id', 'is', null)
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)
  const map = new Map<
    string,
    { role: CrmRole | null; team: CrmTeam | null; isNew: boolean; arrivedAt: string | null }
  >()
  for (const m of data ?? [])
    if (m.chatter_id)
      map.set(m.chatter_id, {
        role: (m.closing_role ?? null) as CrmRole | null,
        team: (m.closing_team ?? null) as CrmTeam | null,
        isNew: m.is_new ?? false,
        arrivedAt: m.arrived_at ?? null,
      })
  return map
}
