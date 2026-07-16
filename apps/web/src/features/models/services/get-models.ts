import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { ModelChatter, ModelRow, ModelsData } from '../types'

import { conv, round2 , ltvOf } from '@/lib/format'

/**
 * Forme brute renvoyée par le RPC `models_report` (migration 0050, typé dans
 * `packages/db/src/types.ts`) — sommes déjà agrégées EN BASE. Retour `Returns: Json` →
 * cast documenté vers ce contrat local (docs/guidelines-data-loading.md §1).
 */
interface ModelsReport {
  by_creator: Array<{
    creator_id: string
    total: number | null
    ppv: number | null
    tips: number | null
    renew: number | null
    new_subs: number | null
    renewals: number | null
  }>
  by_pair: Array<{
    creator_id: string
    chatter_id: string
    ca: number | null
    ppv: number | null
    tips: number | null
    propose: number | null
    vendu: number | null
  }>
}

/**
 * Onglet Modèles agrégé sur la période (datepicker du header).
 * Source : `creator_daily` (CA/PPV/tips/renew/abonnés/renouvellements) +
 * `chatter_creator_daily` (détail par chatteur) + `chatter_creators` (chatteurs assignés).
 */
export async function getModels(period: Period): Promise<ModelsData> {
  const supabase = await createClient()

  const [
    { data: creators, error: creatorsErr },
    rpcRes,
    { data: cc, error: ccErr },
    { data: chatters, error: chattersErr },
  ] = await Promise.all([
    supabase.from('creators').select('id, name, is_private, excluded'),
    // Agrégation EN BASE (migration 0050 models_report, SECURITY INVOKER = RLS appliquée) :
    // GROUP BY par modèle + par (modèle, chatteur) fait en Postgres → plus de fetchAll de
    // milliers de lignes journalières ni de reduce JS. RPC typé (nom + args) — pas de
    // `as never` (cf. docs/guidelines-data-loading.md §1).
    supabase.rpc('models_report', {
      p_from: period.from,
      p_to: period.to,
    }),
    supabase.from('chatter_creators').select('creator_id, chatter_id').eq('active', true),
    supabase.from('chatters').select('id, display_name'),
  ])
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (ccErr) throw new Error(ccErr.message)
  if (chattersErr) throw new Error(chattersErr.message)
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  // Retour `Returns: Json` → cast documenté vers le contrat local (pas `.overrideTypes`,
  // inapplicable sur l'union Json avec postgrest-js 2.110 — cf. docs/guidelines-data-loading.md §1).
  const rep = (rpcRes.data as ModelsReport | null) ?? { by_creator: [], by_pair: [] }

  const chName = new Map((chatters ?? []).map((c) => [c.id, c.display_name]))

  const agg = new Map<
    string,
    { total: number; ppv: number; tips: number; renew: number; newSubs: number; renewals: number }
  >()
  for (const r of rep.by_creator) {
    agg.set(r.creator_id, {
      total: Number(r.total) || 0,
      ppv: Number(r.ppv) || 0,
      tips: Number(r.tips) || 0,
      renew: Number(r.renew) || 0,
      newSubs: Number(r.new_subs) || 0,
      renewals: Number(r.renewals) || 0,
    })
  }

  const planned = new Map<string, number>()
  for (const r of cc ?? []) planned.set(r.creator_id, (planned.get(r.creator_id) ?? 0) + 1)

  const breakdown = new Map<
    string,
    Map<string, { ca: number; ppv: number; tips: number; propose: number; vendu: number }>
  >()
  for (const r of rep.by_pair) {
    let byCh = breakdown.get(r.creator_id)
    if (!byCh) {
      byCh = new Map()
      breakdown.set(r.creator_id, byCh)
    }
    const c = byCh.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0 }
    c.ca += Number(r.ca) || 0
    c.ppv += Number(r.ppv) || 0
    c.tips += Number(r.tips) || 0
    c.propose += Number(r.propose) || 0
    c.vendu += Number(r.vendu) || 0
    byCh.set(r.chatter_id, c)
  }

  // `excluded` = exclusion du calcul LTV UNIQUEMENT (page Santé) — la page Modèles
  // montre TOUS les comptes, exclus compris (décision 2026-07-03, page Quotas).
  const models: ModelRow[] = (creators ?? [])
    .map((c) => {
      const a = agg.get(c.id) ?? { total: 0, ppv: 0, tips: 0, renew: 0, newSubs: 0, renewals: 0 }
      const byCh = breakdown.get(c.id) ?? new Map()
      const chattersArr: ModelChatter[] = [...byCh.entries()]
        .map(([id, x]) => ({
          name: chName.get(id) ?? '—',
          ca: x.ca,
          ppv: x.ppv,
          tips: x.tips,
          propose: x.propose,
          vendu: x.vendu,
          tauxConv: conv(x.vendu, x.propose),
        }))
        .sort((p, q) => q.ca - p.ca)
      const active = chattersArr.filter((x) => x.ca > 0).length
      return {
        id: c.id,
        name: c.name,
        total: a.total,
        newSubs: a.newSubs,
        renouv: a.renewals,
        ventes: chattersArr.reduce((s, x) => s + x.vendu, 0),
        caMsg: a.ppv + a.tips,
        ltv: ltvOf(a.total, a.newSubs) ?? 0,
        part: 0, // % rempli après filtrage (plus fort reste → somme 100 %)
        ppv: a.ppv,
        tips: a.tips,
        renew: a.renew,
        active,
        planned: planned.get(c.id) ?? 0,
        per: active ? round2(a.total / active) : 0,
        nbChatters: chattersArr.length,
        chatters: chattersArr,
        isPrivate: c.is_private,
      }
    })
    .filter((m) => m.total > 0 || m.nbChatters > 0)
    .sort((a, b) => b.total - a.total)

  // Part CA : arrondi « plus fort reste » sur les modèles affichés → la colonne somme
  // toujours à 100 % (total = somme des modèles visibles, exclus LTV compris — le flag
  // excluded ne joue que sur la page Santé).
  const shownTotal = models.reduce((s, m) => s + m.total, 0)
  if (shownTotal > 0) {
    const exact = models.map((m) => (m.total / shownTotal) * 100)
    const parts = exact.map((x) => Math.floor(x))
    let rest = Math.round(100 - parts.reduce((s, x) => s + x, 0))
    exact
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ i }) => {
        if (rest > 0) {
          parts[i] += 1
          rest--
        }
      })
    models.forEach((m, i) => {
      m.part = parts[i] ?? 0
    })
  }

  return { period: period.label, models }
}
