import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getClosingByChatter } from '@/lib/services/closing-by-chatter'
import { CA_TRACKING_SEUIL, type SpenderRow, type SpendersData } from '../types'

/**
 * Spenders + état du tracker relances, via le RPC `crm_spenders_tracker` (join scrape ⋈
 * relances ⋈ spender_crm, agrégé EN BASE — plafond CPU Workers). Pas de datepicker : on
 * prend tout ce qu'on scrape. Cloisonnement par modèle : RLS (le RPC est SECURITY INVOKER).
 *
 * ⚠️ `crm_spenders_tracker` retourne un `returns table` (set) → soumis AU MÊME plafond
 * PostgREST de 1000 lignes qu'un `select` nu (à la différence des RPC `*_report` qui
 * renvoient un `json` unique, non plafonné). Le seuil de tracking est bas (6 € net) → il y a
 * bien plus de 1000 spenders : sans pagination la liste ET tous les KPIs (calculés dans
 * SpendersTemplate depuis les lignes reçues) sont tronqués EN SILENCE. On pagine donc via
 * `fetchAll`, ordre déterministe sur la clé du set `(creator_id, fan_id)`.
 */
export async function getSpenders(): Promise<SpendersData> {
  const supabase = await createClient()

  // Équipe closing lue DEPUIS le membre lié — helper partagé `getClosingByChatter` (source unique
  // avec la page Chatteurs, cf. 0077/0079). On n'en utilise ici que l'équipe.
  const [{ data: rows, error }, { data: freshRow, error: freshErr }, closingByChatter] =
    await Promise.all([
      fetchAll((from, to) =>
        supabase
          .rpc('crm_spenders_tracker', { p_seuil: CA_TRACKING_SEUIL })
          .order('creator_id', { ascending: true })
          .order('fan_id', { ascending: true })
          .range(from, to),
      ),
      supabase
        .from('spender_conversations')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getClosingByChatter(),
    ])
  if (error) throw new Error(error.message)
  if (freshErr) throw new Error(freshErr.message)

  const spenders: SpenderRow[] = rows
    .map((r) => ({
      fanId: r.fan_id,
      username: r.username,
      creatorId: r.creator_id,
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
      grise: r.relance_today,
      conversionPending: r.conversion_pending,
      archived: r.archived,
    }))
    .sort((a, b) => b.ca - a.ca)

  return {
    spenders,
    capturedAt: freshRow?.captured_at ?? null,
    threshold: CA_TRACKING_SEUIL,
  }
}
