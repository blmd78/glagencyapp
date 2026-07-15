import { createClient } from '@/lib/supabase/server'
import { normalizeInfosCle, type InfosModelesData } from '../types'

/**
 * Fiches « infos clés » par modèle. Client SESSION : creators_scoped_read cloisonne
 * automatiquement un membre à SES modèles assignés (admin = tous) — même mécanique que
 * le legacy (manager_modeles/closer_modeles) mais portée par la RLS.
 * `infos_cle` n'est pas dans les types générés → cast (précédent chatters_report).
 */
export async function getInfosModeles(): Promise<InfosModelesData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('creators')
    .select('id, name, active, infos_cle' as 'id, name, active')
    .order('name')
  if (error) throw new Error(error.message)

  const modeles = ((data ?? []) as unknown as Array<{
    id: string
    name: string
    active: boolean
    infos_cle: unknown
  }>)
    .filter((c) => c.active)
    .map((c) => ({
      creatorId: c.id,
      model: c.name,
      infos: normalizeInfosCle(c.infos_cle),
    }))
  return { modeles }
}
