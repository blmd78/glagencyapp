import { createClient } from '@/lib/supabase/server'
import { withColors } from '@/lib/mkt-groups'
import type { MktGroup } from '@/lib/types/marketing'

export interface MktGroupAdminRow extends MktGroup {
  /** Nombre de liens rangés dans ce groupe — ce qu'on perdrait de vue en le supprimant. */
  links: number
}

/**
 * Les groupes pour l'écran de réglage, avec le poids de chacun.
 *
 * Deux lectures plutôt qu'une RPC : une dizaine de groupes et ~360 liens, le décompte se fait
 * en mémoire sans coût. `fetchAll` sur les liens — même piège de plafond que partout ailleurs
 * sur `mkt_links`, qui grossit sans purge.
 */
export async function getGroupsAdmin(): Promise<MktGroupAdminRow[]> {
  const supabase = await createClient()
  const [groupsRes, linksRes] = await Promise.all([
    supabase
      .from('mkt_link_groups')
      .select('key, label, color, contains, starts_with, words, priority, is_fallback, auto')
      .is('deleted_at', null)
      .order('priority'),
    supabase.from('mkt_links').select('type'),
  ])
  if (groupsRes.error) throw new Error(groupsRes.error.message)
  if (linksRes.error) throw new Error(linksRes.error.message)

  const compte = new Map<string, number>()
  for (const l of linksRes.data ?? []) compte.set(l.type, (compte.get(l.type) ?? 0) + 1)

  return withColors(
    (groupsRes.data ?? []).map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      contains: g.contains,
      startsWith: g.starts_with,
      words: g.words,
      priority: g.priority,
      isFallback: g.is_fallback,
      auto: g.auto,
    })),
  ).map((g) => ({ ...g, links: compte.get(g.key) ?? 0 }))
}
