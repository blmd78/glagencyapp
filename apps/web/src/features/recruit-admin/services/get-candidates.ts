import type { Database } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { CandidateRow, CandidatesData, CandidateStatus, RecruitGates, RecruitKpis } from '../types'

/**
 * Borne EXPLICITE de la file des candidats (guidelines-data-loading §2 : jamais de `select` nu —
 * PostgREST tronque silencieusement à 1000 lignes). Le recrutement est un flux d'agence, pas une
 * table de faits : quelques dossiers par semaine. 500 couvre largement, et le jour où ça déborde
 * il faudra une vraie pagination, pas une limite plus haute.
 */
const MAX_ROWS = 500

// `phone`/`age`/`location`/`shifts`/`source` : les réponses du formulaire de fin, montrées dans la
// modale « Ses réponses » de la liste — sans elles il fallait ouvrir la fiche pour les lire.
const COLS =
  'id, first_name, last_name, email, discord, phone, age, location, shifts, source, created_at, qi_score, qi_total, typing_wpm, connection_mbps, orthographe, coherence, relance, vente, bot_total, global, passed, refusal_step, refusal_reason, repeat, status, profile_id'

/** `numeric` Postgres : supabase-js peut le rendre en chaîne selon la version → Number(). */
const num = (v: number | string | null): number => Number(v ?? 0)

/** Nouveaux d'abord (c'est la file de traitement), puis du plus récent au plus ancien. */
const STATUS_RANK: Record<CandidateStatus, number> = { nouveau: 0, valide: 1, refuse: 2 }

/**
 * Ce que `toCandidateRow` lit d'une ligne `recruit_candidates` — DÉRIVÉ des types générés (patron
 * de `training-catalog/services/get-catalog.ts`), avec le seul écart réel : `connection_mbps` est
 * un `numeric` que supabase-js peut rendre en CHAÎNE selon la version, là où le type généré promet
 * un `number`.
 */
type CandidateCols = Omit<
  Pick<
    Database['public']['Tables']['recruit_candidates']['Row'],
    | 'id' | 'first_name' | 'last_name' | 'email' | 'discord' | 'created_at' | 'qi_score' | 'qi_total'
    | 'phone' | 'age' | 'location' | 'shifts' | 'source'
    | 'typing_wpm' | 'connection_mbps' | 'orthographe' | 'coherence' | 'relance' | 'vente' | 'bot_total'
    | 'global' | 'passed' | 'refusal_step' | 'refusal_reason' | 'repeat' | 'status' | 'profile_id'
  >,
  'connection_mbps'
> & { connection_mbps: number | string }

export function toCandidateRow(r: CandidateCols): CandidateRow {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    discord: r.discord,
    createdAt: r.created_at,
    qiScore: r.qi_score,
    qiTotal: r.qi_total,
    typingWpm: r.typing_wpm,
    connectionMbps: num(r.connection_mbps),
    orthographe: r.orthographe,
    coherence: r.coherence,
    relance: r.relance,
    vente: r.vente,
    botTotal: r.bot_total,
    global: r.global,
    passed: r.passed,
    refusalStep: r.refusal_step,
    refusalReason: r.refusal_reason,
    repeat: r.repeat,
    // `check` SQL (0125) : la colonne ne peut valoir que l'une des trois valeurs.
    status: r.status as CandidateStatus,
    isMember: r.profile_id !== null,
    phone: r.phone,
    age: r.age,
    location: r.location,
    shifts: r.shifts,
    source: r.source,
  }
}

/**
 * File des candidats + seuils courants pour l'affichage des gates, en deux lectures parallèles
 * (client SESSION : la RLS de `recruit_candidates` / `recruit_config` est `is_admin()` en lecture,
 * un non-admin lit zéro ligne — la garde `requireAdmin()` de la page est la défense en profondeur).
 *
 * Le tri « nouveaux d'abord » est fait EN MÉMOIRE : PostgREST ne sait pas trier sur une expression
 * (`order by status = 'nouveau' desc`), et la file tient de toute façon dans `MAX_ROWS`.
 */
export async function getCandidates(): Promise<CandidatesData> {
  const supabase = await createClient()
  // Compteurs en HEAD (`count: 'exact'`, aucune ligne rapatriée) : les cartes KPI doivent rester
  // justes même le jour où la file dépasse `MAX_ROWS` — les dériver des lignes bornées mentirait.
  const countWhere = (status?: CandidateStatus) => {
    const q = supabase.from('recruit_candidates').select('id', { count: 'exact', head: true })
    return status ? q.eq('status', status) : q
  }
  const [candidates, config, total, valide, refuse] = await Promise.all([
    supabase.from('recruit_candidates').select(COLS).order('created_at', { ascending: false }).limit(MAX_ROWS),
    supabase.from('recruit_config').select('qi_min, frappe_min, connexion_min, global_threshold').eq('id', 1).maybeSingle(),
    countWhere(),
    countWhere('valide'),
    countWhere('refuse'),
  ])
  if (candidates.error) throw new Error(candidates.error.message)
  if (config.error) throw new Error(config.error.message)
  for (const c of [total, valide, refuse]) if (c.error) throw new Error(c.error.message)
  if (!config.data) throw new Error('Configuration du test de recrutement introuvable (ligne 1)')

  const gates: RecruitGates = {
    qiMin: config.data.qi_min,
    frappeMin: config.data.frappe_min,
    connexionMin: config.data.connexion_min,
    globalThreshold: config.data.global_threshold,
  }
  const rows = (candidates.data ?? []).map(toCandidateRow)
  rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt.localeCompare(a.createdAt))
  const kpis: RecruitKpis = {
    total: total.count ?? 0,
    nouveau: Math.max(0, (total.count ?? 0) - (valide.count ?? 0) - (refuse.count ?? 0)),
    valide: valide.count ?? 0,
    refuse: refuse.count ?? 0,
  }
  return { rows, gates, kpis }
}
