import { createClient } from '@/lib/supabase/server'
import { getClosingByChatter } from '@/lib/services/closing-by-chatter'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/** Forme d'une ligne du json de `crm_spenders_tracker_json` (0091) — miroir du
 *  `returns table` de `crm_spenders_tracker`, que le wrapper agrège en un seul json. */
interface TrackerRow {
  creator_id: string
  fan_id: number
  username: string
  model: string | null
  ca_total: number
  status: string | null
  last_message_at: string | null
  last_message_is_mine: boolean | null
  has_unread: boolean
  assigned_chatter_id: string | null
  chatter_name: string | null
  assigned_label: string | null
  compteur_r: number
  derniere_relance_at: string | null
  relance_today: boolean | null
  conversion_pending: boolean | null
  archived: boolean
}

/**
 * Spenders + état du tracker relances, via `crm_spenders_tracker_json` (0091) : le join
 * scrape ⋈ relances ⋈ spender_crm agrégé EN BASE et renvoyé en UN json (non plafonné).
 * Cloisonnement par modèle : RLS (invoker de bout en bout).
 *
 * Historique : l'audit du 2026-07-29 a mesuré que la version `returns table` paginée par
 * fetchAll (parade au cap PostgREST de 1000, qui s'applique AUSSI aux rpc set-returning)
 * RÉ-EXÉCUTAIT l'agrégation complète à chaque page (Function Scan, ~490 ms + 3,6 Mo par
 * visite pour 7 000 spenders) — le wrapper json = 1 requête, même RLS.
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  // Équipe closing lue DEPUIS le membre lié — helper partagé `getClosingByChatter` (source unique
  // avec la page Chatteurs, cf. 0077/0079). On n'en utilise ici que l'équipe.
  const [{ data: rowsJson, error }, { data: freshRow, error: freshErr }, closingByChatter, { data: creatorRows, error: creatorsErr }] =
    await Promise.all([
      supabase.rpc('crm_spenders_tracker_json', { p_seuil: CA_TRACKING_SEUIL }),
      supabase
        .from('spender_conversations')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getClosingByChatter(),
      // Mapping id → id MyPuls pour le lien « ouvrir la conversation » (cf. SpenderRow.
      // mypulsCreatorId). Table bornée (16 modèles) : pas de fetchAll. Sous RLS
      // (creators_scoped_read) : un chatteur ne lit que SES modèles assignés — exactement
      // ceux de ses spenders ; un modèle non lisible → lien absent, pseudo à plat.
      supabase.from('creators').select('id, mypuls_creator_id'),
    ])
  if (error) throw new Error(error.message)
  if (freshErr) throw new Error(freshErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)
  const mypulsByCreator = new Map(
    (creatorRows ?? []).map((c) => [c.id, c.mypuls_creator_id]),
  )

  const rows = (rowsJson ?? []) as unknown as TrackerRow[]
  const spenders: SpenderRow[] = rows
    .map((r) => ({
      fanId: r.fan_id,
      username: r.username,
      creatorId: r.creator_id,
      mypulsCreatorId: mypulsByCreator.get(r.creator_id) ?? null,
      model: r.model ?? '—',
      ca: r.ca_total,
      status: r.status,
      lastMessageAt: r.last_message_at,
      lastMessageIsMine: r.last_message_is_mine,
      hasUnread: r.has_unread,
      assignedLabel: r.assigned_label,
      chatterId: r.assigned_chatter_id,
      chatterName: r.chatter_name,
      chatterTeam: r.assigned_chatter_id ? (closingByChatter.get(r.assigned_chatter_id)?.team ?? null) : null,
      compteurR: r.compteur_r,
      derniereRelanceAt: r.derniere_relance_at,
      grise: r.relance_today ?? false,
      conversionPending: r.conversion_pending ?? false,
      archived: r.archived,
    }))
    .sort((a, b) => b.ca - a.ca)

  return {
    spenders,
    capturedAt: freshRow?.captured_at ?? null,
    threshold: CA_TRACKING_SEUIL,
  }
}
