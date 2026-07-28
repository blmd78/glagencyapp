import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

/** Ligne réduite au strict nécessaire du repère « N à traiter ». */
interface CountRow {
  profile_id: string
}

/**
 * Nombre de tâches NON TERMINÉES par personne, sans le contenu — c'est tout ce dont la ligne
 * repliée a besoin. Une entrée par id demandé, même à 0 (la ligne n'affiche alors aucun repère).
 *
 * `fetchAll` : N personnes × leurs tâches peut dépasser la limite PostgREST de 1000 lignes,
 * qui tronque EN SILENCE (cf. docs/guidelines-data-loading.md). L'ordre porte sur
 * (profile_id, id) — déterministe, comme l'exige `fetchAll`.
 *
 * S'exécute sous RLS (`todos_select` → `can_write_todo_of`, 0067) : une personne dont la
 * to-do n'est pas lisible ne remonte aucune ligne et ressort à 0. Dégradation silencieuse
 * ASSUMÉE — le roster du planning est inclus dans le périmètre écrivable de la to-do pour
 * chaque rôle (cf. spec §6), donc le cas ne se produit pas. Si les deux périmètres divergent
 * un jour, le symptôme sera « plus aucun repère sur personne », pas une erreur.
 */
export async function getTodoCounts(profileIds: string[]): Promise<Map<string, number>> {
  const byProfile = new Map<string, number>(profileIds.map((id) => [id, 0]))
  if (!profileIds.length) return byProfile

  const supabase = await createClient()
  const { data, error } = await fetchAll<CountRow>((f, t) =>
    supabase
      .from('todos')
      .select('profile_id')
      .in('profile_id', profileIds)
      .neq('status', 'done')
      .order('profile_id')
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)

  for (const r of data) byProfile.set(r.profile_id, (byProfile.get(r.profile_id) ?? 0) + 1)
  return byProfile
}
