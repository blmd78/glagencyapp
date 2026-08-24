import * as Sentry from '@sentry/nextjs'
import type { createAdminClient } from '@glagency/db'

/**
 * Les deux RPC de réclamation de 0123, enveloppées une fois pour les DEUX chemins qui les
 * appellent : l'auto-réclamation du chatter (`features/training-legacy`) et le filet admin
 * (`features/members`). Module NEUTRE — ni `'use server'`, ni point d'entrée HTTP.
 *
 * L'ORDRE EST FIGÉ, et c'est la règle la plus importante du fichier :
 *
 *   claim_begin (rate-limit)  →  lecture GLA  →  vérification du mot de passe  →  claim_settle
 *
 * Aucune lecture de `training_legacy_claims` (autre que SA PROPRE ligne) avant le verdict de la
 * preuve. Un pré-check d'unicité en tête de handler est gratuit, tentant, et ruine tout le travail
 * anti-énumération : il suffirait de saisir `sophie22` + n'importe quoi pour apprendre « déjà
 * rattaché à un autre compte » — l'attaquant énumère les 248 logins ET apprend lesquels restent à
 * voler, sans même consommer une tentative d'échec. Le pré-check et le rattrapage du 23505 vivent
 * donc tous les deux DANS `claim_settle`, après la preuve et dans la même transaction.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Refus levés par `training_legacy_claim_begin` en `P0001` (§4.5). */
export const BEGIN_CODES = [
  'LEGACY_INPUT_INVALID',
  'LEGACY_SYNC_RUNNING',
  'LEGACY_RESYNC_COOLDOWN',
  'LEGACY_LOCKED',
  'LEGACY_RATE_LIMITED',
  'LEGACY_LOGIN_FROZEN',
] as const
export type LegacyBeginCode = (typeof BEGIN_CODES)[number]

/** Verdicts rendus par `training_legacy_claim_settle` — des CODES DE RETOUR, pas des exceptions. */
export type LegacySettleCode = 'new' | 'resync' | 'failed' | 'taken' | 'other_login' | 'sync_running'

/**
 * Refus métier de `claim_begin`. Une classe dédiée plutôt qu'un `BusinessError` direct : les deux
 * chemins n'affichent PAS les mêmes textes (générique côté chatter, explicite côté admin) — le
 * code voyage, la phrase est décidée par l'appelant.
 */
export class LegacyBeginError extends Error {
  constructor(readonly code: LegacyBeginCode) {
    super(code)
    this.name = 'LegacyBeginError'
  }
}

/** Le message d'une exception `P0001` EST le code (`raise exception 'LEGACY_LOCKED'`). */
function beginCodeOf(message: string): LegacyBeginCode | null {
  return BEGIN_CODES.find((c) => message.includes(c)) ?? null
}

/**
 * Ouvre une tentative : quatre plafonds, deux verrous et la trace, dans une seule transaction.
 * Rend l'identifiant de la tentative — à régler ensuite par `legacyClaimSettle`, quel que soit
 * l'issue. Une tentative jamais réglée reste un ÉCHEC (`ok = false` par défaut) : un crash ou un
 * dépassement de temps ne doit pas offrir un essai gratuit.
 *
 * CE QUE LE GEL PAR LOGIN NE BORNE PAS, et c'est assumé (§7.5/3) : il ne compte QUE les échecs de
 * profils n'ayant rien réclamé, pour que « deux complices gèlent le login de la vraie Sophie » reste
 * impossible. Corollaire : contre un attaquant DÉJÀ rattaché, le gel ne se déclenche jamais et la
 * seule borne est le verrou dur par profil — 10 devinettes À VIE, non remises à zéro par un succès.
 * C'est cette borne-là qui tient, pas le gel ; l'inverser rouvrirait le grief que §7.5 ferme.
 *
 * La normalisation du login est faite PAR POSTGRES (`lower(btrim(...))` dans la RPC), jamais ici :
 * 7 logins GLA contiennent du non-ASCII et `String.toLowerCase()` ne suit pas les mêmes règles
 * Unicode que `lower()`. Une divergence entre les deux est l'un des trois chemins qui mènent au
 * mode d'échec silencieux de §3.9.
 */
export async function legacyClaimBegin(
  admin: Admin,
  args: { profileId: string; login: string; ip: string | null },
): Promise<string> {
  const { data, error } = await admin.rpc('training_legacy_claim_begin', {
    p_profile: args.profileId,
    p_login_key: args.login,
    p_ip: args.ip as string,
  })
  if (error) {
    const code = beginCodeOf(error.message)
    if (code) {
      // §7.5 : le gel par login est la SEULE limite qui désigne une victime plutôt qu'un abuseur —
      // 6 profils différents ont échoué sur CE login en 24 h. Le message rendu est volontairement
      // indistinguable du plafond ordinaire (sinon il devient un signal de reconnaissance), donc
      // sans cette alerte PERSONNE n'apprendrait jamais qu'un compte est ciblé. C'est ici et pas
      // dans les actions : les deux chemins (chatter, admin) passent par cette fonction.
      if (code === 'LEGACY_LOGIN_FROZEN') {
        Sentry.captureMessage('Reprise GLA : identifiant gelé — 6 échecs de profils distincts en 24 h', {
          level: 'warning',
          extra: { login: args.login, profileId: args.profileId },
        })
      }
      throw new LegacyBeginError(code)
    }
    throw new Error(error.message)
  }
  return data
}

/**
 * Règle la tentative et, si la preuve est faite, RÉSERVE le couple profil ↔ login avant l'import.
 * La réservation est posée AVANT, pas après : sinon deux profils qui réclament le même login en
 * parallèle importeraient tous les deux ~17 k lignes avant de découvrir le conflit.
 *
 * `linkedBy` = L'AUTEUR DU GESTE : l'admin qui rattache à la main (D7), ou le chatter lui-même en
 * auto-réclamation. Toujours renseigné, jamais `null` — la RPC fait `coalesce(p_linked_by,
 * linked_by)`, donc un `null` CONSERVERAIT l'ancien auteur : après un détachement admin (qui pose
 * `linked_by = admin` pour imputer le détachement), la ré-appropriation par le propriétaire serait
 * journalisée au nom de l'admin. C'est `linked_by` que le trigger de journal lit en `created_by`.
 */
export async function legacyClaimSettle(
  admin: Admin,
  args: { attemptId: string; ok: boolean; loginDisplay: string; linkedBy?: string | null },
): Promise<LegacySettleCode> {
  const { data, error } = await admin.rpc('training_legacy_claim_settle', {
    p_attempt: args.attemptId,
    p_ok: args.ok,
    p_login_display: args.loginDisplay,
    p_linked_by: (args.linkedBy ?? undefined) as string,
  })
  if (error) throw new Error(error.message)
  return data as LegacySettleCode
}

/** L'état de rattachement d'un profil, service-role — la table n'a AUCUNE policy d'écriture. */
export interface LegacyClaimRow {
  loginKey: string
  loginDisplay: string
  claimedAt: string
  syncStartedAt: string | null
  lastSyncAt: string | null
  sessionsCount: number
  detachedAt: string | null
}

export async function readLegacyClaim(admin: Admin, profileId: string): Promise<LegacyClaimRow | null> {
  const { data, error } = await admin
    .from('training_legacy_claims')
    .select('login_key, login_display, claimed_at, sync_started_at, last_sync_at, sessions_count, detached_at')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
    ? {
        loginKey: data.login_key,
        loginDisplay: data.login_display,
        claimedAt: data.claimed_at,
        syncStartedAt: data.sync_started_at,
        lastSyncAt: data.last_sync_at,
        sessionsCount: data.sessions_count,
        detachedAt: data.detached_at,
      }
    : null
}

/**
 * Clôt l'import : `last_sync_at`, `sessions_count`, et le verrou `sync_started_at` relâché.
 * C'est CET UPDATE que le trigger `trg_training_legacy_claim_journal` observe pour écrire la ligne
 * `member_events` (`kind = 'formation'`) — l'app n'écrit jamais dans le journal elle-même.
 */
export async function closeLegacySync(
  admin: Admin,
  args: { profileId: string; sessionsCount: number },
): Promise<void> {
  const { error } = await admin
    .from('training_legacy_claims')
    .update({ last_sync_at: new Date().toISOString(), sessions_count: args.sessionsCount, sync_started_at: null })
    .eq('profile_id', args.profileId)
  if (error) throw new Error(error.message)
}

/**
 * `sync_started_at` N'EST PAS RELÂCHÉ EN CAS D'ÉCHEC, et c'est délibéré.
 *
 * Le relâcher serait le réflexe (« l'import a raté, libère le verrou »), et ouvrirait une porte :
 * après une première réclamation interrompue, `last_sync_at` est `null`, donc le cooldown de
 * resynchronisation (1 h) ne mord pas — un utilisateur impatient pourrait relancer en boucle une
 * lecture de 57 Mo sur la PRODUCTION GLA. La fenêtre de 5 minutes de `sync_started_at` est
 * exactement le garde-fou prévu pour ça (§3.3) : au-delà, l'import est réputé mort et « Reprendre
 * la récupération » redevient possible tout seul.
 *
 * Corollaire assumé : après un échec, l'encart affiche « Récupération en cours… » pendant au plus
 * cinq minutes avant de basculer sur « Récupération interrompue ».
 */

/**
 * Neutralise UNE tentative (`cleared_at`) — réservé au cas « GLA injoignable ».
 *
 * Sans ça, une panne de la plateforme d'en face fait grimper le compteur cumulé d'échecs de
 * quelqu'un qui n'a rien fait de mal, et le VERROUILLE à 10 jusqu'à intervention admin. Le
 * compteur glissant (5 / 15 min), lui, ne filtre pas `cleared_at` : il continue de s'appliquer, ce
 * qui est souhaitable — il borne le martèlement pendant la panne, et s'épuise seul.
 */
export async function clearLegacyAttempt(admin: Admin, attemptId: string): Promise<void> {
  await admin
    .from('training_legacy_claim_attempts')
    .update({ cleared_at: new Date().toISOString() })
    .eq('id', attemptId)
}
