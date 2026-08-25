import * as Sentry from '@sentry/nextjs'
import type { createAdminClient } from '@glagency/db'
import { readLegacyCatalog } from './catalog'
import { readSessions } from './client'
import { refreshLegacyStreak } from './streak'
import { transformLegacySessions } from './transform'
import type { LegacyAnomaly, LegacySkip } from './types'

/**
 * Orchestration de l'import Good Luck Agency — l'ordre de §5.9, et rien d'autre.
 *
 * Module NEUTRE (pas de `'use server'`) : il prend le client service-role EN PARAMÈTRE et n'est
 * appelé que par deux Server Actions (l'auto-réclamation côté Formation, le filet admin côté
 * Membres). L'exporter depuis un fichier `'use server'` en ferait un point d'entrée appelable
 * depuis le navigateur — patron `lib/recruit-link.ts:8-12`.
 *
 * Vit en `lib/` et pas dans une feature parce que DEUX features l'appellent et que la frontière
 * ESLint interdit le cross-feature (précédents : `lib/training/start-session.ts`,
 * `lib/impersonation/actions.ts`).
 *
 * ORDRE, obligatoire :
 *   validation du lot ENTIER (transform, avant la première écriture)
 *   → sessions → threads → messages → thread_scores → thread_axis_scores
 *   → contrôle de comptage §3.9  ← on s'arrête ici en cas d'écart
 *   → training_legacy_refresh_all (UNE rpc)
 *   → UPDATE dédié du streak §3.7
 * L'appelant pose ensuite `last_sync_at` / `sessions_count` sur `training_legacy_claims` — le
 * trigger écrit le journal `member_events`.
 *
 * AUCUNE TRANSACTION ne couvre l'ensemble : supabase-js en service-role n'en ouvre pas. C'est
 * acceptable PARCE QUE l'ordre est croissant en dépendances et que toutes les étapes sont
 * idempotentes (UUID v5 déterministes + `on conflict (id) do nothing`) : une interruption laisse
 * un état partiel cohérent, et la resynchronisation le complète.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Écart de comptage §3.9 — le mode d'échec qui rend un vol d'historique INVISIBLE pour sa victime. */
export class LegacyCountMismatchError extends Error {
  readonly code = 'LEGACY_COUNT_MISMATCH'
  constructor(
    readonly expected: number,
    readonly found: number,
  ) {
    super(`LEGACY_COUNT_MISMATCH: ${found} sessions en base pour ${expected} attendues`)
    this.name = 'LegacyCountMismatchError'
  }
}

/**
 * GLA est tombée PENDANT la lecture des sessions — donc AVANT la première écriture.
 *
 * Une classe à part, et pas un `Error` nu, parce que l'appelant ne peut pas deviner : sans elle,
 * une panne de la plateforme d'en face rend « Récupération interrompue — une partie de votre
 * historique est déjà en place » alors que ZÉRO ligne a été écrite. §2.3 réserve à ce cas
 * « L'ancienne plateforme est momentanément injoignable ».
 */
export class LegacyUnreachableError extends Error {
  readonly code = 'LEGACY_UNREACHABLE'
  constructor(readonly cause: unknown) {
    super('LEGACY_UNREACHABLE: lecture des sessions GLA impossible')
    this.name = 'LegacyUnreachableError'
  }
}

/**
 * Seuil de §9.7 : au-delà, une RESYNCHRONISATION (jamais une première réclamation, où les gros
 * volumes sont la norme) mérite un œil. Elle ne prouve rien — un chatter peut avoir beaucoup joué —
 * mais tant que `GLA_CUTOFF_MS` n'est pas posée, c'est la seule chose qui se regarde.
 */
const RESYNC_ALERT_SESSIONS = 50

export interface LegacyImportStats {
  /** Sessions EFFECTIVEMENT comptées en base (§3.9) — jamais le nombre de lignes qu'on a tenté d'écrire. */
  sessions: number
  /** Delta avec l'état d'avant : ce que la resynchronisation vient d'ajouter. */
  newSessions: number
  /** Cas distincts du corpus GLA — pour « 214 sessions, 68 cas, 3 812 messages ». */
  cases: number
  messages: number
  /** Couples (profil, cas) rafraîchis par la RPC de recalcul. */
  refreshed: number
  /** Sessions GLA écartées (cas inconnu, date aberrante) — jamais silencieuses. */
  skipped: LegacySkip[]
  /** Sessions importées mais suspectes (§9.7) — déjà remontées en alerte admin. */
  anomalies: LegacyAnomaly[]
}

/**
 * Lots d'écriture. Deux plafonds, pas un : le nombre de lignes borne le coût PostgREST, le poids
 * cumulé borne la taille du corps HTTP — depuis 0123 un seul message peut peser 200 000 caractères,
 * et 1 000 d'entre eux feraient une requête de 200 Mo.
 */
const ROWS_PER_BATCH = 1_000
const CHARS_PER_BATCH = 2_000_000
/**
 * Lots d'UNE MÊME TABLE envoyés en parallèle. L'ordre §5.9 contraint les TABLES entre elles (une FK
 * ne doit jamais pointer dans le vide), pas les lots à l'intérieur d'une table : leurs clés sont
 * disjointes par construction (UUID v5 distincts), donc ni conflit ni interblocage.
 *
 * Mesuré le 2026-08-24 sur le plus gros historique réel (login `Corneille` : 399 sessions,
 * 891 fils, 6 182 messages, 1 706 axes ≈ 10 000 lignes), depuis un poste distant vers l'UAT :
 * 50 s en séquentiel par lots de 500 → 24 s par lots de 1 000 à cinq en vol. C'est la LATENCE des
 * allers-retours qui domine, pas Postgres — `training_legacy_refresh_all`, lui, rend la main en
 * 152 ms pour 80 couples (150 `rpc()` séparés auraient coûté l'essentiel du budget à eux seuls).
 */
const BATCH_CONCURRENCY = 5

function chunk<T>(rows: readonly T[], weight: (r: T) => number): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  let w = 0
  for (const r of rows) {
    const rw = weight(r)
    if (cur.length > 0 && (cur.length >= ROWS_PER_BATCH || w + rw > CHARS_PER_BATCH)) {
      out.push(cur)
      cur = []
      w = 0
    }
    cur.push(r)
    w += rw
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/** Sessions reprises DÉJÀ en base pour ce profil — le seul chiffre honnête (§3.9). */
async function countLegacySessions(admin: Admin, profileId: string): Promise<number> {
  const { count, error } = await admin
    .from('training_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .not('legacy_id', 'is', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * Reprend TOUT l'historique d'un login GLA sous un profil. Idempotent : relancer ne duplique rien
 * et rattrape ce qui a été joué depuis.
 *
 * @param login le login EXACT lu dans `chatters` — jamais une saisie utilisateur : un
 *              `lower(login) = …` sur `sessions` coûterait un balayage complet de 57 Mo à chaque
 *              réclamation, sur une base en production (le seul index y est sur la colonne brute).
 */
export async function runLegacyImport(opts: {
  admin: Admin
  profileId: string
  login: string
}): Promise<LegacyImportStats> {
  const { admin, profileId, login } = opts

  // Date de coupure optionnelle (§9.7). Le `trim()` et le test de non-vide ne sont pas de la
  // coquetterie : `Number('')` vaut 0, donc une variable présente mais VIDE (le cas par défaut de
  // `.env.example`) bornerait le corpus à l'epoch et ne reprendrait rien, en silence.
  const raw = process.env.GLA_CUTOFF_MS?.trim()
  const cutoff = raw ? Number(raw) : Number.NaN

  const [catalog, source, before] = await Promise.all([
    readLegacyCatalog(admin),
    // Étiquetée à la source : c'est le SEUL endroit de la chaîne où une panne de GLA survient
    // avant la première écriture, et l'appelant doit pouvoir le dire au chatter (§2.3).
    readSessions(login, Number.isFinite(cutoff) ? cutoff : null).catch((err) => {
      throw new LegacyUnreachableError(err)
    }),
    countLegacySessions(admin, profileId),
  ])

  // VALIDATION DU LOT ENTIER avant la première écriture (§5.9) : une ligne hors bornes découverte
  // à la 300ᵉ session laisserait un import à moitié écrit qu'il faudrait ensuite expliquer.
  const { rows, stats } = transformLegacySessions({ profileId, sessions: source, catalog })

  // Ordre CROISSANT EN DÉPENDANCES — une FK ne peut jamais pointer dans le vide, même si l'import
  // s'interrompt entre deux lots.
  await insert(admin, 'training_sessions', rows.sessions, () => 400)
  await insert(admin, 'training_threads', rows.threads, () => 200)
  await insert(admin, 'training_messages', rows.messages, (m) => m.body.length + 200)
  await insert(admin, 'training_thread_scores', rows.threadScores, (s) => (s.comment?.length ?? 0) + 400)
  await insert(admin, 'training_thread_axis_scores', rows.axisScores, () => 120)

  // ── Contrôle de comptage §3.9 ────────────────────────────────────────────────────────────────
  // L'UUID v5 est dérivé du SEUL identifiant GLA : il ne contient pas le profil. Combiné à
  // `on conflict (id) do nothing`, une session déjà importée SOUS UN AUTRE PROFIL se solde par
  // 0 ligne écrite et AUCUNE erreur — et « votre historique est déjà à jour » serait alors servi
  // au propriétaire légitime qui n'a rien. C'est ce silence-là qu'on transforme en erreur.
  const found = await countLegacySessions(admin, profileId)
  if (found < stats.sessions) throw new LegacyCountMismatchError(stats.sessions, found)
  if (found > stats.sessions) {
    // ÉCART ASSUMÉ vs §3.9, qui exige l'égalité stricte. `found > attendu` n'est jamais le mode
    // d'échec décrit (celui-ci écrit MOINS que prévu) : il signe une session supprimée côté GLA
    // après notre import (`delete_session`, db.py:312 — la resynchronisation ajoute, elle ne
    // réconcilie pas) ou une coupure `GLA_CUTOFF_MS` posée après coup. Bloquer enfermerait la
    // personne dans « Récupération incomplète » à vie, sans aucun geste pour en sortir.
    Sentry.captureMessage('Reprise GLA : plus de sessions en base que chez GLA', {
      level: 'warning',
      extra: { profileId, expected: stats.sessions, found },
    })
  }
  if (stats.skipped.length > 0) {
    Sentry.captureMessage('Reprise GLA : sessions écartées', {
      level: 'warning',
      extra: { profileId, skipped: stats.skipped.slice(0, 20), total: stats.skipped.length },
    })
  }

  // ── Alerte §9.7 : la contre-mesure de D3 ─────────────────────────────────────────────────────
  // `GLA_CUTOFF_MS` n'étant pas posée par défaut, la reprise SUIT GLA — et `/api/formation/
  // boss-save` n'y impose aucun plafond sur `total`. Un chiffre fabriqué devient indiscernable une
  // fois chez nous, et depuis 0121 il influence l'encadrant qui donne les tours de roue. Ces deux
  // signaux ne prouvent rien ; ils se regardent.
  const newSessions = Math.max(0, found - before)
  const abnormal: string[] = []
  // `before > 0` : sur une PREMIÈRE réclamation, des centaines de sessions sont la normale (max
  // réel mesuré : 399). C'est le volume d'une resynchronisation qui est anormal.
  if (before > 0 && newSessions > RESYNC_ALERT_SESSIONS) abnormal.push(`${newSessions} sessions nouvelles d’un coup`)
  if (stats.anomalies.length > 0) abnormal.push(`${stats.anomalies.length} session(s) boss notée(s) haut sans transcription`)
  if (abnormal.length > 0) {
    Sentry.captureMessage('Reprise GLA : resynchronisation anormale', {
      level: 'warning',
      extra: { profileId, login, reasons: abnormal, anomalies: stats.anomalies.slice(0, 20) },
    })
  }

  // ── Recalcul des agrégats §3.8 ───────────────────────────────────────────────────────────────
  // Le trigger de notation est un AFTER UPDATE : un INSERT ne le déclenche JAMAIS. Sans cet appel,
  // `training_case_bests` et `training_profile_stats` restent vides et Ma formation affiche zéro
  // malgré 16 k sessions en base. UNE rpc : la boucle sur les couples (profil, cas) reste dans
  // Postgres — 150 `rpc()` séquentiels feraient sauter le budget de temps de la Server Action.
  const { data: refreshed, error: rErr } = await admin.rpc('training_legacy_refresh_all', { p_profile: profileId })
  if (rErr) throw new Error(rErr.message)

  // APRÈS le recalcul, jamais avant : `training_refresh_stats` écrit lui aussi ces deux colonnes
  // (avec une valeur fausse sur un import), c'est l'ordre qui décide qui gagne.
  await refreshLegacyStreak(admin, profileId)

  return {
    sessions: found,
    newSessions,
    cases: stats.cases,
    messages: stats.messages,
    refreshed: refreshed ?? 0,
    skipped: stats.skipped,
    anomalies: stats.anomalies,
  }
}

/**
 * Un `insert … on conflict (id) do nothing` par lot. La PK est un UUID v5 déterministe : c'est
 * ELLE la clé d'idempotence, aucune lecture préalable n'est nécessaire.
 *
 * Les unicités secondaires (`training_messages unique (thread_id, position)`,
 * `training_sessions_legacy_uidx`) sont en BIJECTION avec l'identifiant — un doublon sur l'une
 * implique un doublon sur `id`, que le `do nothing` absorbe. Aucune ne peut donc lever un 23505.
 */
async function insert<T extends object>(
  admin: Admin,
  table: 'training_sessions' | 'training_threads' | 'training_messages' | 'training_thread_scores' | 'training_thread_axis_scores',
  rows: readonly T[],
  weight: (r: T) => number,
): Promise<void> {
  if (rows.length === 0) return
  // `training_thread_scores` et `training_thread_axis_scores` n'ont pas de colonne `id` : leur
  // clé d'idempotence est leur PK métier (`thread_id`, puis `(thread_id, axis_key)`).
  const onConflict =
    table === 'training_thread_scores' ? 'thread_id' : table === 'training_thread_axis_scores' ? 'thread_id,axis_key' : 'id'
  const batches = chunk(rows, weight)
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    await Promise.all(
      batches.slice(i, i + BATCH_CONCURRENCY).map(async (batch) => {
        // Pas de `.select()` : `return=minimal` — on ne rapatrie pas 6 000 lignes qu'on vient d'écrire.
        const { error } = await admin
          .from(table)
          // Les lignes sont typées `Database[...]['Insert']` par `transform.ts` ; le `never` de
          // l'union des cinq tables est le prix d'un seul helper pour les cinq.
          .upsert(batch as never, { onConflict, ignoreDuplicates: true })
        if (error) throw new Error(`${table}: ${error.message}`)
      }),
    )
  }
}
