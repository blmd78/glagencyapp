import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { CoachingRow } from '../types'

interface RawRow {
  profileId: string
  name: string
  models: string[]
  score: number | null
  sessions: number
  lastSeen: string | null
}

/**
 * La liste du suivi : un chatteur par ligne, avec sa moyenne, son dernier 1:1 et ses modèles.
 *
 * Agrégat en RPC (`tracker_coaching_list`, migration 0128) rendant du `jsonb` : deux cents
 * chatteurs croisés avec leurs sessions et leurs modèles, ça se somme en base, pas en JavaScript —
 * et une seule ligne de retour ne peut pas être tronquée à mille.
 */
export async function getCoachingList(): Promise<CoachingRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tracker_coaching_list')
  if (error) throw new Error(error.message)

  const today = Date.parse(`${todayParis()}T12:00:00Z`)
  return ((data as RawRow[] | null) ?? []).map((r) => ({
    ...r,
    score: r.score == null ? null : Number(r.score),
    gapDays:
      r.lastSeen == null
        ? null
        : Math.max(0, Math.round((today - Date.parse(`${r.lastSeen}T12:00:00Z`)) / 86_400_000)),
  }))
}
