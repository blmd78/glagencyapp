import { createClient } from '@/lib/supabase/server'
import { getClosingByChatter } from '@/lib/services/closing-by-chatter'
import { CA_TRACKING_SEUIL, R_ALERTE, type SpenderRow } from '../types'
import type { SpendersViewKind } from '../components/spenders-view'
import type { TrackerRow } from './get-spenders'

/**
 * UNE TRANCHE de spenders (0104), plus les cartes de la Liste. Remplace le chargement complet
 * pour `liste` et `tracker`, qui rapportaient ~9 800 lignes et 3,1 Mo que personne ne parcourt.
 *
 * Tri, recherche et filtre modèle sont désormais des ARGUMENTS : les faire côté client sur une
 * tranche donnerait un classement faux — et convaincant, ce qui est pire.
 *
 * Les KPI viennent d'un second RPC parce qu'ils portent sur tout le périmètre, pas sur la page :
 * 100 octets contre 3,1 Mo pour le même résultat.
 */
export interface SpendersPageParams {
  view: SpendersViewKind
  /** Ids de modèles ; vide = tous (miroir du filtre de la barre d'outils). */
  models?: string[]
  search?: string
  /** Clé de tri côté client : 'ca' | 'compteurR' | 'username' | 'model' | 'lastMessage'. */
  sort?: string
  desc?: boolean
  limit?: number
  offset?: number
}

export interface SpendersKpis {
  spenders: number
  caTotal: number
  aRelancer: number
  alertesR10: number
  orphelins: number
}

export interface SpendersPage {
  rows: SpenderRow[]
  /** Total du PÉRIMÈTRE filtré — sert le compteur et la fin de scroll, pas la taille de page. */
  total: number
}

/** Mapping brut → `SpenderRow`, identique à celui du chargement complet (même RPC en dessous). */
function toRows(
  rows: TrackerRow[],
  mypulsByCreator: Map<string, string | null>,
  closingByChatter: Awaited<ReturnType<typeof getClosingByChatter>>,
): SpenderRow[] {
  return rows.map((r) => ({
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
    chatterTeam: r.assigned_chatter_id
      ? (closingByChatter.get(r.assigned_chatter_id)?.team ?? null)
      : null,
    compteurR: r.compteur_r,
    derniereRelanceAt: r.derniere_relance_at,
    derniereRelancePar: r.derniere_relance_par ?? null,
    grise: r.relance_today ?? false,
    conversionPending: r.conversion_pending ?? false,
    archived: r.archived,
  }))
}

export async function getSpendersPage(p: SpendersPageParams): Promise<SpendersPage> {
  const supabase = await createClient()
  const [{ data, error }, closingByChatter, { data: creatorRows, error: creatorsErr }] =
    await Promise.all([
      supabase.rpc('crm_spenders_page', {
        p_seuil: CA_TRACKING_SEUIL,
        p_view: p.view,
        p_alerte: R_ALERTE,
        p_models: p.models ?? [],
        p_search: p.search ?? '',
        p_sort: p.sort ?? 'ca',
        p_desc: p.desc ?? true,
        p_limit: p.limit ?? 100,
        p_offset: p.offset ?? 0,
      }),
      getClosingByChatter(),
      supabase.from('creators').select('id, mypuls_creator_id'),
    ])
  if (error) throw new Error(error.message)
  if (creatorsErr) throw new Error(creatorsErr.message)

  const payload = (data ?? { total: 0, rows: [] }) as unknown as {
    total: number
    rows: TrackerRow[]
  }
  const mypulsByCreator = new Map((creatorRows ?? []).map((c) => [c.id, c.mypuls_creator_id]))
  return {
    rows: toRows(payload.rows ?? [], mypulsByCreator, closingByChatter),
    total: payload.total ?? 0,
  }
}

/** Cartes de la Liste, agrégées en base sur le même périmètre (seuil + modèles). */
export async function getSpendersKpis(models: string[] = []): Promise<SpendersKpis> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('crm_spenders_kpis_json', {
    p_seuil: CA_TRACKING_SEUIL,
    p_alerte: R_ALERTE,
    p_models: models,
  })
  if (error) throw new Error(error.message)
  return (data ?? {
    spenders: 0,
    caTotal: 0,
    aRelancer: 0,
    alertesR10: 0,
    orphelins: 0,
  }) as unknown as SpendersKpis
}
