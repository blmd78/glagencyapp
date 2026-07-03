import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import type { ChatterModel, ChatterRow, ChattersData } from '../types'

import { conv, round1, round2 } from '@/lib/format'

/** Barème de commission par défaut (10 % du CA) — à remplacer par la vraie config plus tard. */
const COM_RATE = 0.1

/**
 * Onglet Chatteurs agrégé sur la période (datepicker du header).
 * Filtrage fait EN BASE (WHERE date BETWEEN from AND to) : on ne récupère que les
 * lignes de la période. Source : `chatter_daily` (agrégat chatteur) + `chatter_creator_daily`
 * (ventilation par modèle) + `chatter_creators` (modèles assignés). `creator_daily` sert au
 * bandeau de périmètre (total agence vs messagerie vs attribué).
 *
 * Mode `restricted` (rôle `user`) : `chatter_daily`/`teams` sont admin-only en RLS →
 * l'agrégat se construit depuis `chatter_creator_daily` (limité par la RLS à SES modèles).
 * Com/proposé/conv/présence/réactivité n'existent pas à ce grain → null (affichés « — »).
 */
export async function getChatters(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<ChattersData> {
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // En restreint, les tables admin-only (chatter_daily, teams) et le bandeau de périmètre
  // (creator_daily) ne sont pas interrogés : résultats vides et ignorés de toute façon.
  const skip = Promise.resolve({ data: null })
  const [{ data: chatters }, { data: teams }, { data: creators }, { data: chd }, { data: ccd }, { data: cc }, { data: crd }] =
    await Promise.all([
      supabase.from('chatters').select('id, display_name, email, active, team_id'),
      restricted ? skip : supabase.from('teams').select('id, name'),
      supabase.from('creators').select('id, name, is_secondary, primary_creator_id'),
      restricted
        ? skip
        : supabase
            .from('chatter_daily')
            .select('chatter_id, ca, ca_ppv, ca_tips, propose, vendu, presence_active_h, presence_idle_h, reactivite_sec')
            .gte('date', period.from)
            .lte('date', period.to),
      supabase
        .from('chatter_creator_daily')
        .select('chatter_id, creator_id, ca, ca_ppv, ca_tips, propose, vendu')
        .gte('date', period.from)
        .lte('date', period.to),
      supabase.from('chatter_creators').select('chatter_id, creator_id').eq('active', true),
      restricted
        ? skip
        : supabase
            .from('creator_daily')
            .select('ca, ca_ppv, ca_tips')
            .gte('date', period.from)
            .lte('date', period.to),
    ])

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))
  const crName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const chMeta = new Map((chatters ?? []).map((c) => [c.id, c]))

  // Décision produit : chaque compte OF reste une ligne DISTINCTE dans la ventilation
  // (« Carla » et « Carla (privé) » séparés). On garde le lien principal → secondaires
  // uniquement pour créer les lignes à 0 des comptes couverts mais sans production.
  const secondariesOf = new Map<string, string[]>()
  for (const c of creators ?? []) {
    if (c.is_secondary && c.primary_creator_id) {
      const arr = secondariesOf.get(c.primary_creator_id) ?? []
      arr.push(c.id)
      secondariesOf.set(c.primary_creator_id, arr)
    }
  }

  const agg = new Map<
    string,
    { ca: number; ppv: number; tips: number; propose: number; vendu: number; pa: number; pi: number; react: number[] }
  >()
  if (restricted) {
    // chatter_daily est vide (RLS admin-only) : l'agrégat chatteur = Σ de la ventilation
    // par modèle visible. Présence/réactivité/proposé n'existent pas à ce grain.
    for (const r of ccd ?? []) {
      const a = agg.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0, pa: 0, pi: 0, react: [] }
      a.ca += r.ca ?? 0
      a.ppv += r.ca_ppv ?? 0
      a.tips += r.ca_tips ?? 0
      a.vendu += r.vendu ?? 0
      agg.set(r.chatter_id, a)
    }
  } else {
    for (const r of chd ?? []) {
      const a = agg.get(r.chatter_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0, pa: 0, pi: 0, react: [] }
      a.ca += r.ca ?? 0
      a.ppv += r.ca_ppv ?? 0
      a.tips += r.ca_tips ?? 0
      a.propose += r.propose ?? 0
      a.vendu += r.vendu ?? 0
      a.pa += r.presence_active_h ?? 0
      a.pi += r.presence_idle_h ?? 0
      if (r.reactivite_sec != null) a.react.push(r.reactivite_sec)
      agg.set(r.chatter_id, a)
    }
  }

  const bd = new Map<string, Map<string, { ca: number; ppv: number; tips: number; propose: number; vendu: number }>>()
  for (const r of ccd ?? []) {
    let m = bd.get(r.chatter_id)
    if (!m) {
      m = new Map()
      bd.set(r.chatter_id, m)
    }
    const c = m.get(r.creator_id) ?? { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0 }
    c.ca += r.ca ?? 0
    c.ppv += r.ca_ppv ?? 0
    c.tips += r.ca_tips ?? 0
    c.propose += r.propose ?? 0
    c.vendu += r.vendu ?? 0
    m.set(r.creator_id, c)
  }

  // Une seule map (ids) — les noms s'en dérivent via crName (dédupliqués pour l'affichage).
  const assignedIds = new Map<string, Set<string>>()
  for (const r of cc ?? []) {
    if (!crName.has(r.creator_id)) continue
    const ids = assignedIds.get(r.chatter_id) ?? new Set()
    ids.add(r.creator_id)
    assignedIds.set(r.chatter_id, ids)
  }
  const assignedNames = (id: string) =>
    [...new Set([...(assignedIds.get(id) ?? [])].map((cid) => crName.get(cid) as string))]

  const rows: ChatterRow[] = [...agg.entries()]
    .map(([id, a]) => {
      const meta = chMeta.get(id)
      const byCr: Map<string, { ca: number; ppv: number; tips: number; propose: number; vendu: number }> =
        new Map(bd.get(id) ?? [])

      // Lignes à 0 : les comptes couverts par le chatteur (modèles assignés + leurs
      // comptes secondaires, ex. « Carla (privé) ») apparaissent même sans production.
      for (const cid of assignedIds.get(id) ?? []) {
        for (const covered of [cid, ...(secondariesOf.get(cid) ?? [])]) {
          if (!byCr.has(covered)) {
            byCr.set(covered, { ca: 0, ppv: 0, tips: 0, propose: 0, vendu: 0 })
          }
        }
      }

      const models: ChatterModel[] = [...byCr.entries()]
        .map(([cid, x]) => ({
          creatorId: cid,
          model: crName.get(cid) ?? '—',
          ca: x.ca,
          ppv: x.ppv,
          tips: x.tips,
          com: restricted ? null : round2(x.ca * COM_RATE),
          propose: x.propose,
          vendu: x.vendu,
          tauxConv: conv(x.vendu, x.propose),
        }))
        .sort((p, q) => q.ca - p.ca || p.model.localeCompare(q.model))
      const attributed = models.reduce((s, m) => s + m.ca, 0)
      return {
        id,
        name: meta?.display_name ?? '—',
        email: meta?.email ?? null,
        active: meta?.active ?? false,
        team: meta?.team_id ? (teamName.get(meta.team_id) ?? null) : null,
        ca: a.ca,
        ppv: a.ppv,
        tips: a.tips,
        com: restricted ? null : round2(a.ca * COM_RATE),
        propose: restricted ? null : a.propose,
        vendu: a.vendu,
        tauxConv: restricted ? null : conv(a.vendu, a.propose),
        presenceActiveH: restricted ? null : round1(a.pa),
        presenceIdleH: restricted ? null : round1(a.pi),
        reactiviteS: a.react.length
          ? Math.round(a.react.reduce((s, x) => s + x, 0) / a.react.length)
          : null,
        caUnattributed: round2(a.ca - attributed),
        models,
        assignedModels: assignedNames(id),
      }
    })
    .sort((p, q) => q.ca - p.ca)

  // Périmètres emboîtés du CA sur la période (attribué ⊂ messagerie ⊂ total agence).
  // En restreint : « total agence » n'est pas visible → pas de bandeau (null).
  const attributed = (chd ?? []).reduce((s, r) => s + (r.ca ?? 0), 0)
  const messaging = (crd ?? []).reduce((s, r) => s + (r.ca_ppv ?? 0) + (r.ca_tips ?? 0), 0)
  const allAccounts = (crd ?? []).reduce((s, r) => s + (r.ca ?? 0), 0)
  const scope = restricted
    ? null
    : {
        attributed: round2(attributed),
        messaging: round2(messaging),
        allAccounts: round2(allAccounts),
      }

  return { period: period.label, chatters: rows, scope }
}
