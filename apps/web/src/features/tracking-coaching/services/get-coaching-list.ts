import { todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getCreatorScope } from '@/lib/services/creator-scope'
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
 *
 * BORNÉE AU PÉRIMÈTRE MODÈLES de l'appelant — le tracker d'origine posait le même périmètre sur
 * `/notes` que sur le dashboard (routes.js.txt:110-112). Sans ça, la liste affichait toute l'agence
 * en renvoyant vers des fiches désormais en 404 : des liens morts, et surtout la fuite des noms.
 * Le filtrage se fait sur les MODÈLES déjà rendus par la RPC, donc sans requête par ligne.
 */
export async function getCoachingList(callerId: string, callerRole: string): Promise<CoachingRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tracker_coaching_list')
  if (error) throw new Error(error.message)

  // `getCreatorScope` rend des ids de créatrices ; la RPC rend leurs NOMS. Une seule requête pour
  // faire le pont, plutôt qu'un `isChatterInScope` par ligne (deux cents chatteurs).
  const scope = await getCreatorScope(callerId, callerRole)
  let allowed: Set<string> | null = null
  if (scope) {
    const { data: creators, error: cErr } = await createAdminClient()
      .from('creators').select('name').in('id', [...scope])
    if (cErr) throw new Error(cErr.message)
    allowed = new Set((creators ?? []).map((c) => c.name))
  }

  const today = Date.parse(`${todayParis()}T12:00:00Z`)
  return ((data as RawRow[] | null) ?? [])
    .filter((r) => !allowed || r.models.some((m) => allowed.has(m)))
    .map((r) => ({
    ...r,
    score: r.score == null ? null : Number(r.score),
    gapDays:
      r.lastSeen == null
        ? null
        : Math.max(0, Math.round((today - Date.parse(`${r.lastSeen}T12:00:00Z`)) / 86_400_000)),
  }))
}
