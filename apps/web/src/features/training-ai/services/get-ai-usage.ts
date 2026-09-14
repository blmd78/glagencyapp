import { addDays, daysBetween } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { Period } from '@/lib/period'
import { cacheMinTokens, usdOf } from '@/lib/ai-pricing'
import {
  type AiCase,
  type AiChatter,
  type AiDay,
  type AiModelLine,
  type AiUsageData,
} from '../types'

/**
 * Une ligne de `training_ai_daily` (0154). Les colonnes `bigint` sont typées `number` par le
 * générateur mais arrivent en CHAÎNE selon la version de supabase-js — d'où `number | string`
 * ici, et le double cast (`as unknown as`) à la lecture : les deux formes sont vraies, le
 * générateur n'en connaît qu'une.
 */
interface DailyRow {
  day: string
  chatters: number
  sessions: number
  fan_calls: number
  score_calls: number
  fan_input: number | string
  fan_output: number | string
  fan_cache_read: number | string
  score_input: number | string
  score_output: number | string
  score_cache_read: number | string
  score_cache_write: number | string
  failed: number
  p95_latency_ms: number
}

/** Une ligne de `training_ai_cost` (0113 → 0141 → 0157) — le détail par modèle. */
interface CostRow {
  day: string
  model: string
  kind: string
  calls: number
  input_tokens: number | string
  output_tokens: number | string
  cache_read_tokens: number | string
  cache_write_tokens: number | string
}

const n = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v))

/**
 * Analytics IA de la Formation, en DEUX lectures agrégées (jamais les 140 000 lignes d'appels).
 *
 * - `training_ai_daily` (0154) : le par-jour, avec les chatteurs distincts — il faut une
 *   jointure sur `training_sessions` que PostgREST ne sait pas agréger.
 * - `training_ai_cost` (0157) : le par-modèle, d'où se déduit le diagnostic de cache. Bornée
 *   des DEUX côtés depuis 0157 — elle ignorait la fin de période, et le tableau par modèle
 *   comptait donc tout jusqu'à aujourd'hui pendant que le reste de l'écran suivait le sélecteur.
 *
 * Le fan ne fait PAS d'écriture de cache dans le par-jour : sa fenêtre n'en produit presque
 * jamais (son prompt est sous le seuil), et l'ajouter aurait fait quatre colonnes de plus dans
 * la RPC pour un montant nul. Le détail par modèle, lui, la porte.
 */
export async function getAiUsage(period: Period): Promise<AiUsageData> {
  const supabase = await createClient()
  // Bornes en heure de PARIS, pas en UTC : une journée d'entraînement est une journée d'agence.
  // La borne haute est le lendemain du dernier jour, EXCLUE (cf. 0156) — sinon les appels de
  // l'après-midi du dernier jour tombent à côté.
  const since = new Date(`${period.from}T00:00:00+02:00`).toISOString()
  const until = new Date(`${addDays(period.to, 1)}T00:00:00+02:00`).toISOString()
  const [dailyRes, costRes, chattersRes, casesRes] = await Promise.all([
    supabase.rpc('training_ai_daily', { p_since: since, p_until: until }),
    supabase.rpc('training_ai_cost', { p_since: since, p_until: until }),
    supabase.rpc('training_ai_by_chatter', { p_since: since, p_until: until }),
    supabase.rpc('training_ai_by_case', { p_since: since, p_until: until }),
  ])
  if (dailyRes.error) throw new Error(dailyRes.error.message)
  if (costRes.error) throw new Error(costRes.error.message)
  if (chattersRes.error) throw new Error(chattersRes.error.message)
  if (casesRes.error) throw new Error(casesRes.error.message)

  const rows: AiDay[] = ((dailyRes.data as unknown as DailyRow[] | null) ?? []).map((r) => {
    const usdFan = usdOf([
      {
        model: 'claude-haiku-4-5',
        kind: 'fan',
        inputTokens: n(r.fan_input),
        outputTokens: n(r.fan_output),
        cacheReadTokens: n(r.fan_cache_read),
        cacheWriteTokens: 0,
      },
    ])
    const usdScore = usdOf([
      {
        model: 'claude-sonnet-5',
        kind: 'score',
        inputTokens: n(r.score_input),
        outputTokens: n(r.score_output),
        cacheReadTokens: n(r.score_cache_read),
        cacheWriteTokens: n(r.score_cache_write),
      },
    ])
    return {
      day: r.day,
      chatters: r.chatters,
      sessions: r.sessions,
      fanCalls: r.fan_calls,
      scoreCalls: r.score_calls,
      usd: Math.round((usdFan + usdScore) * 100) / 100,
      usdFan: Math.round(usdFan * 100) / 100,
      usdScore: Math.round(usdScore * 100) / 100,
      failed: r.failed,
      p95LatencyMs: r.p95_latency_ms,
    }
  })

  // SÉRIE COMPLÈTE. La RPC groupe les appels EXISTANTS : un jour sans le moindre appel n'y
  // apparaît pas du tout, il n'y est pas à zéro. Sur la production, l'entraînement n'a
  // tourné aucun jour entre le 14 et le 26 août — treize lignes simplement absentes, un
  // graphe qui saute de quinze jours sans le dire, et un lecteur qui croit à un mois plein.
  //
  // Un jour sans appel vaut bien ZÉRO ici (personne ne s'est entraîné, rien n'a été facturé) :
  // c'est une vraie valeur, pas une donnée manquante — d'où le remplissage, et non un « — ».
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const span = daysBetween(period.from, period.to) + 1
  const days: AiDay[] = Array.from({ length: span }, (_, i) => {
    const day = addDays(period.from, i)
    return (
      byDay.get(day) ?? {
        day,
        chatters: 0,
        sessions: 0,
        fanCalls: 0,
        scoreCalls: 0,
        usd: 0,
        usdFan: 0,
        usdScore: 0,
        failed: 0,
        p95LatencyMs: 0,
      }
    )
  }).reverse()

  // Par modèle × sorte, agrégé sur toute la fenêtre : c'est là que se lit le diagnostic de
  // cache (entrée moyenne par appel contre seuil du modèle).
  const byModel = new Map<string, AiModelLine & { inputTokens: number; cacheRead: number }>()
  for (const r of (costRes.data as unknown as CostRow[] | null) ?? []) {
    const key = `${r.model}|${r.kind}`
    const cur = byModel.get(key) ?? {
      model: r.model,
      kind: r.kind,
      calls: 0,
      usd: 0,
      avgInputTokens: 0,
      cacheHitPct: 0,
      cacheMinTokens: cacheMinTokens(r.model),
      inputTokens: 0,
      cacheRead: 0,
    }
    cur.calls += r.calls
    cur.inputTokens += n(r.input_tokens)
    cur.cacheRead += n(r.cache_read_tokens)
    cur.usd += usdOf([
      {
        model: r.model,
        kind: r.kind,
        inputTokens: n(r.input_tokens),
        outputTokens: n(r.output_tokens),
        cacheReadTokens: n(r.cache_read_tokens),
        cacheWriteTokens: n(r.cache_write_tokens),
      },
    ])
    byModel.set(key, cur)
  }

  const models: AiModelLine[] = [...byModel.values()]
    .map((m) => ({
      model: m.model,
      kind: m.kind,
      calls: m.calls,
      usd: Math.round(m.usd * 100) / 100,
      // Entrée moyenne = tokens facturés plein tarif + tokens lus en cache : c'est la TAILLE
      // du prompt, pas ce qu'on en paie. C'est elle qu'on compare au seuil.
      avgInputTokens: m.calls > 0 ? Math.round((m.inputTokens + m.cacheRead) / m.calls) : 0,
      cacheHitPct:
        m.inputTokens + m.cacheRead > 0
          ? Math.round((m.cacheRead / (m.inputTokens + m.cacheRead)) * 1000) / 10
          : 0,
      cacheMinTokens: m.cacheMinTokens,
    }))
    .sort((a, b) => b.usd - a.usd)

  // Par chatteur : même calcul de coût que le reste, appliqué à ses propres tokens.
  interface ChatterRow {
    profile_id: string
    name: string
    active_days: number
    sessions: number
    fan_calls: number
    score_calls: number
    fan_input: number | string
    fan_output: number | string
    fan_cache_read: number | string
    score_input: number | string
    score_output: number | string
    score_cache_read: number | string
    score_cache_write: number | string
  }
  const chatters: AiChatter[] = ((chattersRes.data as unknown as ChatterRow[] | null) ?? [])
    .map((r) => {
      const c = usdOf([
        {
          model: 'claude-haiku-4-5',
          kind: 'fan',
          inputTokens: n(r.fan_input),
          outputTokens: n(r.fan_output),
          cacheReadTokens: n(r.fan_cache_read),
          cacheWriteTokens: 0,
        },
        {
          model: 'claude-sonnet-5',
          kind: 'score',
          inputTokens: n(r.score_input),
          outputTokens: n(r.score_output),
          cacheReadTokens: n(r.score_cache_read),
          cacheWriteTokens: n(r.score_cache_write),
        },
      ])
      return {
        profileId: r.profile_id,
        name: r.name,
        activeDays: r.active_days,
        sessions: r.sessions,
        fanCalls: r.fan_calls,
        scoreCalls: r.score_calls,
        usd: Math.round(c * 100) / 100,
        usdPerDay: r.active_days > 0 ? Math.round((c / r.active_days) * 100) / 100 : 0,
      }
    })
    .sort((a, b) => b.usd - a.usd)

  // Par EXERCICE : sur quoi part la dépense. Le prompt moyen (entrée facturée + lue en cache,
  // divisée par les appels du fan) est la colonne qui compte — c'est elle qu'on compare au
  // seuil de mise en cache du modèle.
  interface CaseRow {
    case_id: string
    fan_name: string
    case_title: string
    module_title: string
    kind: string
    sessions: number
    chatters: number
    fan_calls: number
    fan_input: number | string
    fan_output: number | string
    fan_cache_read: number | string
    score_input: number | string
    score_output: number | string
    score_cache_read: number | string
    score_cache_write: number | string
  }
  const cases: AiCase[] = ((casesRes.data as unknown as CaseRow[] | null) ?? [])
    .map((r) => {
      const fanIn = n(r.fan_input)
      const fanCache = n(r.fan_cache_read)
      return {
        caseId: r.case_id,
        fanName: r.fan_name,
        caseTitle: r.case_title,
        moduleTitle: r.module_title,
        kind: r.kind,
        sessions: r.sessions,
        chatters: r.chatters,
        fanCalls: r.fan_calls,
        inputTokens: fanIn + fanCache,
        avgPromptTokens: r.fan_calls > 0 ? Math.round((fanIn + fanCache) / r.fan_calls) : 0,
        usd:
          Math.round(
            usdOf([
              {
                model: 'claude-haiku-4-5',
                kind: 'fan',
                inputTokens: fanIn,
                outputTokens: n(r.fan_output),
                cacheReadTokens: fanCache,
                cacheWriteTokens: 0,
              },
              {
                model: 'claude-sonnet-5',
                kind: 'score',
                inputTokens: n(r.score_input),
                outputTokens: n(r.score_output),
                cacheReadTokens: n(r.score_cache_read),
                cacheWriteTokens: n(r.score_cache_write),
              },
            ]) * 100,
          ) / 100,
      }
    })
    .sort((a, b) => b.inputTokens - a.inputTokens)

  const usd = Math.round(days.reduce((s, d) => s + d.usd, 0) * 100) / 100
  // « par jour ACTIF » et non « ÷ 30 » : l'entraînement n'a démarré que le 2026-08-27, et
  // diviser par une fenêtre pleine diviserait la dépense réelle par deux.
  const actifs = days.filter((d) => d.chatters > 0)
  return {
    period: period.label,
    days,
    models,
    chatters,
    cases,
    // Concentration : dit s'il faut agir sur quelques personnes ou sur le prompt. Relevé au
    // 2026-09-12 : 33 % pour le top 10 sur 118 chatteurs — c'est le prompt qu'il faut traiter.
    top10Pct:
      chatters.length > 0
        ? Math.round(
            (chatters.slice(0, 10).reduce((s, c) => s + c.usd, 0) /
              Math.max(chatters.reduce((s, c) => s + c.usd, 0), 0.01)) *
              100,
          )
        : 0,
    totals: {
      usd,
      usdPerDay: actifs.length > 0 ? Math.round((usd / actifs.length) * 100) / 100 : 0,
      fanCalls: days.reduce((s, d) => s + d.fanCalls, 0),
      scoreCalls: days.reduce((s, d) => s + d.scoreCalls, 0),
      chattersPerDay:
        actifs.length > 0
          ? Math.round(actifs.reduce((s, d) => s + d.chatters, 0) / actifs.length)
          : 0,
      failed: days.reduce((s, d) => s + d.failed, 0),
      activeDays: actifs.length,
      /** Ce que coûterait un mois PLEIN au rythme des jours actifs — la vraie trajectoire. */
      projected30d: actifs.length > 0 ? Math.round((usd / actifs.length) * 30) : 0,
      activeCases: cases.length,
      fanInputTokens: cases.reduce((s, c) => s + c.inputTokens, 0),
    },
  }
}
