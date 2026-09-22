import { createClient } from '@/lib/supabase/server'
import { withColors } from '@/lib/mkt-groups'
import type { MktGroup } from '@/lib/types/marketing'

/**
 * Les groupes de liens (`mkt_link_groups`, 0167), ordonnés par priorité d'évaluation.
 *
 * PARTAGÉ (lib/, pas une feature) : les écrans Liens et Modèles affichent tous deux des types
 * de liens, et deux lectures divergentes donneraient deux libellés pour le même groupe.
 *
 * Les groupes SUPPRIMÉS (soft delete) sont écartés ici : ils ne servent qu'à l'ingestion, pour
 * ne pas recréer un groupe qu'on vient d'écarter. Volume : une dizaine de lignes, pas de
 * `fetchAll` à prévoir.
 */
export async function getMktGroups(): Promise<MktGroup[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mkt_link_groups')
    .select('key, label, color, pattern, priority, is_fallback, auto')
    .is('deleted_at', null)
    .order('priority')
  if (error) throw new Error(error.message)
  return withColors(
    (data ?? []).map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      pattern: g.pattern,
      priority: g.priority,
      isFallback: g.is_fallback,
      auto: g.auto,
    })),
  )
}
