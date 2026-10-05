import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildIdentityData } from '../identity-issues'
import type {
  IdentityData,
  IdentityFiche,
  IdentityIssueRow,
  ReliabilityDay,
  UnattributedSale,
  UnrankedChatter,
} from '../types'

/** Miroirs TS des `json` des RPC de 0183 — `Returns: Json` côté Postgres (guidelines-data-loading §1). */
interface UnattributedRpcRow {
  creator_name: string
  label: string
  ca: number | string
}
interface UnrankedRpcRow {
  chatter_id: string
  display_name: string
  mypuls_user_id: string | null
  ca: number | string
  member_name: string | null
  member_role: string | null
}
interface ReliabilityRpcRow {
  day: string
  status: ReliabilityDay['status']
  checks: ReliabilityDay['checks']
  checked_at: string | null
}

/** Jours affichés dans l'historique de fiabilité. */
const RELIABILITY_DAYS = 14

/**
 * Onglet « Fiches MyPuls » de Membres (admin) — spec § 7. Client RLS (cookie) : les tables de
 * 0183 ne sont lisibles que par un admin. PAS de `use cache` (lecture liée au cookie, §4). Les
 * agrégats de tables de faits passent par des RPC `security invoker` (§1) ; les anomalies, table
 * sans borne naturelle, par `fetchAll`.
 */
export async function getFichesMyPuls(period: { from: string; to: string }): Promise<IdentityData> {
  // Défense en profondeur : la page ne l'appelle que pour un admin, mais les RPC `security invoker`
  // rendraient à un non-admin des chiffres PARTIELS, sans erreur. `getProfile` est `cache()` : déjà
  // résolu par la garde de la page dans le même rendu (patron `get-members.ts:38`).
  const profile = await getProfile()
  if (profile?.role !== 'admin') throw new Error('Fiches MyPuls : accès réservé aux administrateurs')
  const supabase = await createClient()
  const [issues, members, sales, unranked, days] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('chatter_identity_issues')
        .select(
          'id, kind, mypuls_user_id, label, day, amount, detail, first_seen_at, last_seen_at, chatter_id, other_chatter_id, fiche:chatters!chatter_identity_issues_chatter_id_fkey(display_name), autre:chatters!chatter_identity_issues_other_chatter_id_fkey(display_name)',
        )
        .is('resolved_at', null)
        .order('id')
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase.from('profiles').select('id, display_name, chatter_id').not('chatter_id', 'is', null).order('id').range(f, t),
    ),
    supabase.rpc('unattributed_sales', { p_from: period.from, p_to: period.to }),
    supabase.rpc('unranked_chatters_ca', { p_from: period.from, p_to: period.to }),
    supabase.rpc('reliability_days', { p_days: RELIABILITY_DAYS }),
  ])
  for (const r of [issues, members, sales, unranked, days]) if (r.error) throw new Error(r.error.message)

  const memberOf = new Map(members.data.map((p) => [p.chatter_id as string, p.display_name as string]))
  const fiche = (id: string | null, embed: { display_name: string } | null): IdentityFiche | null =>
    id ? { id, name: embed?.display_name ?? '—', member: memberOf.get(id) ?? null } : null

  const rows: IdentityIssueRow[] = issues.data.map((r) => ({
    id: r.id,
    // `kind` est un `text` + `check` côté Postgres : le check garantit l'union.
    kind: r.kind as IdentityIssueRow['kind'],
    mypulsUserId: r.mypuls_user_id,
    label: r.label,
    day: r.day,
    amount: r.amount === null ? null : Number(r.amount),
    detail: r.detail,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    fiche: fiche(r.chatter_id, r.fiche),
    autre: fiche(r.other_chatter_id, r.autre),
  }))
  const ventes: UnattributedSale[] = ((sales.data as UnattributedRpcRow[] | null) ?? []).map((s) => ({
    creatorName: s.creator_name,
    label: s.label,
    ca: Number(s.ca) || 0,
  }))
  const sansMembre: UnrankedChatter[] = ((unranked.data as UnrankedRpcRow[] | null) ?? []).map((u) => ({
    chatterId: u.chatter_id,
    name: u.display_name,
    mypulsUserId: u.mypuls_user_id,
    ca: Number(u.ca) || 0,
    memberName: u.member_name,
    memberRole: u.member_role,
  }))
  const fiabilite: ReliabilityDay[] = ((days.data as ReliabilityRpcRow[] | null) ?? []).map((d) => ({
    day: d.day,
    status: d.status,
    checks: d.checks ?? [],
    checkedAt: d.checked_at,
  }))
  return buildIdentityData({ rows, sales: ventes, days: fiabilite, unranked: sansMembre })
}
