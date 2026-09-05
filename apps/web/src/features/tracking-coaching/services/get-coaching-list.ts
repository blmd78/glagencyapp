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
 *
 * PAS DE PÉRIMÈTRE MODÈLES — décision de Benoit du 2026-09-05. Tout porteur de la page voit TOUS
 * les chatteurs de l'agence. On avait repris le cloisonnement du tracker d'origine
 * (routes.js.txt:110-112) ; à l'usage il masque à un encadrant les chatteurs de SES PROPRES
 * modèles, parce qu'il se calcule sur `profile_creators`, un rattachement manuel et incomplet.
 * Cas rencontré : Juliette n'appartient à aucune money-team, donc aucun rattachement automatique
 * n'existe pour elle — la moitié de ses chatteurs n'a même pas de compte membre. Le suivi est un
 * outil de coaching, pas une donnée sensible : le cloisonnement coûtait plus qu'il ne protégeait.
 * Les SANCTIONS (Police) et le Relevé de présence, eux, restent cloisonnés.
 *
 * Les MODÈLES affichés, en revanche, restent ceux de l'appelant : la RPC est `security invoker` et
 * `creators_scoped_read` (0063) borne la table `creators`. Une ligne hors de ses modèles s'affiche
 * donc sans pastille. C'est voulu — décloisonner les chatteurs n'était pas décloisonner les
 * modèles, et l'élargir demanderait une lecture service-role qu'on ne fait pas ici.
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
