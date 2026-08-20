import { createClient } from '@/lib/supabase/server'
import type { BlockState, CandidateFileData, TranscriptMessage } from '../types'
import { toCandidateRow } from './get-candidates'

type Db = Awaited<ReturnType<typeof createClient>>

/**
 * Borne de la transcription : le plafond réel est `bot_messages` (≤ 50 en config) × 2 messages.
 * 200 laisse de la marge sans jamais frôler la troncature PostgREST.
 */
const MAX_MESSAGES = 200

const CANDIDATE_COLS =
  'id, first_name, last_name, email, discord, created_at, qi_score, typing_wpm, connection_mbps, orthographe, coherence, relance, vente, bot_total, global, passed, refusal_step, refusal_reason, repeat, status, profile_id, attempt_id, recruit_attempts(status, persona, device, ip, bot_replies, input_tokens, output_tokens, created_at)'

/**
 * Dossier complet d'un candidat (`?dossier=<id>`) : la ligne, la tentative technique qui l'a
 * produit (device / IP / coût IA) et la transcription serveur de la conversation avec le fan.
 * `null` = identifiant inconnu (la page rend un 404).
 *
 * Deux vagues de lectures : le dossier d'abord (il porte `attempt_id`), puis en parallèle les
 * messages et l'état de blocage. Ce dernier tient en quatre `eq` séparés plutôt qu'un `.or()` :
 * `device`, `email`, `discord` et `ip` sont des valeurs d'ORIGINE CLIENT stockées telles quelles —
 * les concaténer dans la chaîne de filtre PostgREST serait injectable (même parti pris que
 * `features/recruit-test/shared.ts`).
 */
export async function getCandidate(id: string): Promise<CandidateFileData | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('recruit_candidates').select(CANDIDATE_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const attempt = data.recruit_attempts
  const [messages, block] = await Promise.all([
    loadMessages(supabase, data.attempt_id),
    readBlockState(supabase, { device: attempt?.device ?? null, email: data.email, discord: data.discord, ip: attempt?.ip ?? null }),
  ])

  return {
    ...toCandidateRow(data),
    // La FK `attempt_id` est NOT NULL : l'embed ne peut pas manquer en pratique. Les valeurs de
    // repli n'existent que pour ne pas faire tomber la fiche entière sur une base incohérente.
    attempt: {
      status: attempt?.status ?? 'soumise',
      persona: attempt?.persona ?? '—',
      device: attempt?.device ?? '—',
      ip: attempt?.ip ?? null,
      botReplies: attempt?.bot_replies ?? 0,
      inputTokens: attempt?.input_tokens ?? 0,
      outputTokens: attempt?.output_tokens ?? 0,
      startedAt: attempt?.created_at ?? data.created_at,
    },
    messages,
    ...block,
  }
}

async function loadMessages(supabase: Db, attemptId: string): Promise<TranscriptMessage[]> {
  const { data, error } = await supabase
    .from('recruit_messages')
    .select('id, position, speaker, body, media_price')
    .eq('attempt_id', attemptId)
    .order('position')
    .limit(MAX_MESSAGES)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({
    id: m.id,
    position: m.position,
    // `check` SQL (0125) : 'candidat' ou 'client', rien d'autre.
    speaker: m.speaker as 'candidat' | 'client',
    body: m.body,
    mediaPrice: m.media_price === null ? null : Number(m.media_price),
  }))
}

/**
 * Combien de lignes de blocage matchent l'une des colonnes — et lesquelles viennent d'un ADMIN.
 * La distinction est LE point qui rend la fiche lisible : `submitCandidate` insère une ligne
 * (device + e-mail + Discord, `created_by` null) à CHAQUE soumission, donc « au moins une ligne
 * matche » est vrai pour 100 % des candidats du flux nominal et ne veut rien dire. Seul un
 * `created_by` renseigné est une décision d'agence.
 *
 * On lit `created_by` (pas juste `id`) et on borne à 50 lignes par colonne : au-delà, la présence
 * d'un blocage admin est déjà tranchée ou l'IP est massivement partagée — dans les deux cas la
 * 51ᵉ ligne ne change pas la réponse.
 */
async function readBlockState(
  supabase: Db,
  t: { device: string | null; email: string; discord: string | null; ip: string | null },
): Promise<BlockState> {
  const rows = (column: 'device' | 'email' | 'discord' | 'ip', value: string | null) => {
    if (!value) return Promise.resolve<(string | null)[]>([])
    return supabase
      .from('recruit_blocklist')
      .select('created_by')
      .eq(column, value)
      .limit(50)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return (data ?? []).map((r) => r.created_by)
      })
  }
  const found = (
    await Promise.all([rows('device', t.device), rows('email', t.email), rows('discord', t.discord), rows('ip', t.ip)])
  ).flat()
  return {
    blockedByAdmin: found.some((createdBy) => createdBy !== null),
    hasBlocklistLines: found.length > 0,
  }
}
