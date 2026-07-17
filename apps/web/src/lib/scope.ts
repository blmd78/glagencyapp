import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'

/**
 * Périmètre chatteurs/modèles d'un utilisateur.
 * `null` = admin → aucun filtrage (tout voir).
 */
export interface ChatterScope {
  chatterIds: Set<string> | null
  creatorIds: Set<string> | null
}

/**
 * Résout le périmètre d'un manager : ses modèles (`profile_creators`) → ses chatteurs
 * (`chatter_creators` actifs). Lu au client SESSION : la RLS (admin OU
 * `creator_id ∈ profile_creators`, cf. 0008) renvoie exactement le périmètre.
 * `cache()` : mémoïsé PAR REQUÊTE (getProfile est lui-même mémoïsé → même référence
 * d'argument) — un guard ET un handler qui l'appellent ne coûtent qu'une query.
 */
export const getChatterScope = cache(async (profile: Profile): Promise<ChatterScope> => {
  if (profile.role === 'admin') return { chatterIds: null, creatorIds: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chatter_creators')
    .select('chatter_id, creator_id')
    .eq('active', true)
  // Échec de query ≠ périmètre vide : un manager verrait « rien » en silence.
  if (error) throw new Error(error.message)

  const chatterIds = new Set<string>()
  const creatorIds = new Set<string>()
  for (const r of data ?? []) {
    if (r.chatter_id) chatterIds.add(r.chatter_id)
    if (r.creator_id) creatorIds.add(r.creator_id)
  }
  return { chatterIds, creatorIds }
})
