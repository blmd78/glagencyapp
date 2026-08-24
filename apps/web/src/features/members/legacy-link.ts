import * as Sentry from '@sentry/nextjs'
import type { createAdminClient } from '@glagency/db'
import { BusinessError } from '@/lib/actions'
import { clientIp } from '@/lib/http/client-ip'
import { LegacyBeginError, closeLegacySync, legacyClaimBegin, legacyClaimSettle, readLegacyClaim, type LegacyClaimRow } from '@/lib/gla/claim'
import { readAccountSummary } from '@/lib/gla/client'
import { LegacyUnreachableError, runLegacyImport } from '@/lib/gla/import'

/**
 * PONT Membres → reprise Good Luck Agency : ce que le filet admin (D7) a besoin de lire et
 * d'écrire, hors des Server Actions.
 *
 * Module NEUTRE (pas de `'use server'`), même patron que `recruit-link.ts` : le client service-role
 * est passé en paramètre. L'exporter depuis un fichier `'use server'` en ferait un point d'entrée
 * appelable depuis le navigateur — or ces fonctions lisent la table des tentatives, qui est la
 * carte des comptes ciblés sur un parc dont 4 mots de passe sont le login lui-même.
 *
 * Service-role et non le client RLS : `training_legacy_claims` n'a AUCUNE policy d'écriture, et
 * `training_legacy_claim_attempts` n'est lisible que par un admin. Le gate applicatif est celui de
 * l'action appelante (`requireAdminProfileLive` — admin STRICT, jamais « qui a la page Membres »).
 */

type Admin = ReturnType<typeof createAdminClient>

/** Le seuil du VRAI verrou (§7.5) : 10 échecs cumulés non neutralisés, levés seulement par un admin. */
export const LOCK_THRESHOLD = 10

export interface LegacyAdminState {
  claim: LegacyClaimRow | null
  /** Échecs de preuve non neutralisés — ceux qui comptent pour le verrou. */
  failedAttempts: number
  locked: boolean
}

/** L'état complet du rattachement d'un membre, tel que le bloc « Ancienne plateforme » l'affiche. */
export async function readLegacyAdminState(admin: Admin, profileId: string): Promise<LegacyAdminState> {
  const [claim, attempts] = await Promise.all([
    readLegacyClaim(admin, profileId),
    admin
      .from('training_legacy_claim_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('ok', false)
      .eq('resync', false)
      .is('cleared_at', null),
  ])
  if (attempts.error) throw new Error(attempts.error.message)
  const failedAttempts = attempts.count ?? 0
  return { claim, failedAttempts, locked: failedAttempts >= LOCK_THRESHOLD }
}

/**
 * Qui détient déjà ce login — pour dire « « xxx » est déjà rattaché à **Marie D.** » plutôt que
 * d'opposer un refus opaque. L'argument d'oracle de §7.4 ne s'applique pas ici : l'admin est déjà
 * l'autorité, et un message opaque le laisse sans moyen de comprendre.
 *
 * Prend le login BRUT et le fait normaliser par la RPC (0124) : §3.1 réserve le `lower()` à
 * Postgres. `String.toLowerCase()` ne suit pas les mêmes règles Unicode que `lower()` et 7 logins
 * GLA contiennent du non-ASCII — l'unicité resterait tenue par `login_key unique`, mais le message
 * dégraderait en « un autre membre » le jour où les deux divergent.
 */
export async function readLoginHolder(
  admin: Admin,
  login: string,
): Promise<{ profileId: string; displayName: string } | null> {
  const { data, error } = await admin.rpc('training_legacy_login_holder', { p_login: login }).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { profileId: data.profile_id, displayName: data.display_name ?? '—' } : null
}

/**
 * L'import complet, côté admin — MÊME CHAÎNE que le chatter, sans aucun raccourci : mêmes bornes de
 * validation, même contrôle de comptage, même recalcul d'agrégats, même UPDATE de streak, même
 * ordre d'écriture. C'est ce chemin qui traite les 36 comptes dont le mot de passe a été régénéré ;
 * s'il court-circuitait une étape, c'est par lui que la reprise fuirait.
 *
 * La réservation (`claim_settle`) est déjà posée par l'appelant : ici on écrit, on contrôle, on
 * recalcule, puis on clôt — et c'est cette clôture que le trigger observe pour écrire le journal.
 */
export async function adminLegacySync(
  admin: Admin,
  args: { profileId: string; login: string },
): Promise<{ sessions: number; newSessions: number; cases: number; messages: number }> {
  const stats = await runLegacyImport({ admin, profileId: args.profileId, login: args.login })
  await closeLegacySync(admin, { profileId: args.profileId, sessionsCount: stats.sessions })
  return stats
}

/**
 * Marque le rattachement comme DÉTACHÉ — la ligne SURVIT et l'identifiant reste réservé.
 *
 * Un `delete` rendrait le login immédiatement réclamable par n'importe qui, ce qui ferait de
 * « détacher puis réclamer » le vrai chemin de vol, en deux dialogues et deux lignes de journal non
 * corrélées. Avec `detached_at`, la même personne peut re-réclamer son propre login (c'est une
 * réparation) mais un AUTRE profil exige la libération explicite, tracée à part.
 *
 * `linked_by` est repointé sur l'admin qui agit : le trigger de journal s'en sert comme
 * `created_by`, sans quoi le détachement serait attribué au membre lui-même.
 */
export async function markLegacyDetached(admin: Admin, profileId: string, adminId: string): Promise<void> {
  const { error } = await admin
    .from('training_legacy_claims')
    .update({ detached_at: new Date().toISOString(), sync_started_at: null, linked_by: adminId })
    .eq('profile_id', profileId)
  if (error) throw new Error(error.message)
}

/** Le message de refus d'un plafond, côté admin : nommé, jamais l'oracle générique du chatter. */
function beginMessage(code: string): string {
  if (code === 'LEGACY_LOCKED') return 'Récupération bloquée pour ce membre (10 tentatives échouées) — débloquez-la d’abord.'
  if (code === 'LEGACY_RESYNC_COOLDOWN') return 'Historique déjà synchronisé il y a moins d’une heure — réessayez plus tard.'
  if (code === 'LEGACY_SYNC_RUNNING') return 'Une récupération est déjà en cours pour ce membre.'
  return 'Trop de tentatives récentes sur ce membre — réessayez dans quelques minutes.'
}

/**
 * Ouvre la tentative au nom du MEMBRE CIBLE (c'est son historique) en traçant l'admin dans
 * `linked_by`. Le rate-limit s'applique donc à la cible : un membre verrouillé à 10 échecs bloque
 * aussi le rattachement admin — voulu, l'admin dispose du bouton « Débloquer » juste à côté.
 */
async function begin(admin: Admin, profileId: string, login: string) {
  try {
    return await legacyClaimBegin(admin, { profileId, login, ip: await clientIp() })
  } catch (err) {
    if (err instanceof LegacyBeginError) throw new BusinessError(beginMessage(err.code))
    throw err
  }
}

/** Traduit les trois refus de `claim_settle` en phrases qui disent quoi faire. */
async function refuse(admin: Admin, args: { profileId: string; login: string; code: string }): Promise<never> {
  if (args.code === 'sync_running') throw new BusinessError('Une récupération est déjà en cours pour ce membre.')
  if (args.code === 'taken') {
    const holder = await readLoginHolder(admin, args.login)
    throw new BusinessError(`« ${args.login} » est déjà rattaché à ${holder?.displayName ?? 'un autre membre'}. Détachez-le d’abord.`)
  }
  const mine = await readLegacyClaim(admin, args.profileId)
  throw new BusinessError(`Ce membre est déjà rattaché à « ${mine?.loginDisplay ?? '—'} ». Détachez-le d’abord.`)
}

export const GLA_DOWN = 'L’ancienne plateforme est injoignable — réessayez plus tard.'

/**
 * Le corps commun du rattachement et de la resynchronisation admin — MÊME CHAÎNE, MÊME ORDRE que
 * le chemin chatter : `claim_begin` (rate-limit + trace) → lecture GLA → `claim_settle` (réservation
 * AVANT l'import) → import → clôture. Rend la phrase à afficher.
 *
 * Ne fait AUCUN `revalidatePath` : ce module est neutre, la revalidation appartient à l'action.
 */
export async function linkAndSync(
  admin: Admin,
  args: { profileId: string; rawLogin: string; adminId: string },
): Promise<string> {
  const { profileId, rawLogin, adminId } = args
  const attemptId = await begin(admin, profileId, rawLogin)

  // Lecture GLA : l'aperçu a déjà été montré, mais on RE-RÉSOUT le login exact ici — c'est lui qui
  // sert à lire les sessions (index utilisable) et qui est stocké en `login_display`.
  let account: Awaited<ReturnType<typeof readAccountSummary>>
  try {
    account = await readAccountSummary(rawLogin)
  } catch (err) {
    Sentry.captureException(err)
    await legacyClaimSettle(admin, { attemptId, ok: false, loginDisplay: '' })
    throw new BusinessError(GLA_DOWN)
  }
  if (!account) {
    await legacyClaimSettle(admin, { attemptId, ok: false, loginDisplay: '' })
    throw new BusinessError(`Aucun compte « ${rawLogin} » sur l’ancienne plateforme.`)
  }

  // `ok = true` sans mot de passe : c'est exactement D7 — l'admin EST l'autorité.
  const verdict = await legacyClaimSettle(admin, {
    attemptId,
    ok: true,
    loginDisplay: account.login,
    linkedBy: adminId,
  })
  if (verdict !== 'new' && verdict !== 'resync') {
    // Le login EXACT de GLA, pas la saisie : c'est celui que l'admin reconnaîtra, et la
    // normalisation du `login_key` est faite par la RPC (§3.1), jamais ici.
    await refuse(admin, { profileId, login: account.login, code: verdict })
  }

  let stats: Awaited<ReturnType<typeof adminLegacySync>>
  try {
    stats = await adminLegacySync(admin, { profileId, login: account.login })
  } catch (err) {
    Sentry.captureException(err)
    // GLA est tombée AVANT la première écriture : parler de « récupération partielle » serait
    // faux (zéro ligne écrite) et enverrait l'admin chercher un problème chez nous.
    if (err instanceof LegacyUnreachableError) throw new BusinessError(GLA_DOWN)
    // La réservation est posée, l'import ne l'est pas : l'état « incomplet » est lisible en base
    // (`last_sync_at` reste null) et se rattrape par « Resynchroniser ». Le dire transforme un
    // incident en un clic — un « Erreur inattendue » laisserait l'admin sans geste.
    const done = await readLegacyClaim(admin, profileId)
    throw new BusinessError(
      `Récupération partielle (${done?.sessionsCount ?? 0} sessions) — relancez « Resynchroniser » pour terminer.`,
    )
  }
  if (stats.sessions === 0) return 'Compte rattaché — aucune session à reprendre.'
  if (stats.newSessions === 0) return `Historique déjà à jour — ${stats.sessions} sessions.`
  return `Historique repris : ${stats.newSessions} sessions reprises (${stats.sessions} au total).`
}
