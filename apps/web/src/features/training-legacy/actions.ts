'use server'

// Reprise de l'historique Good Luck Agency — le chemin du CHATTER (auto-réclamation).
//
// L'ORDRE EST FIGÉ (§3.2) et aucune étape ne se déplace :
//   claim_begin (rate-limit)  →  lecture GLA  →  vérification du mot de passe  →  claim_settle
// Aucune lecture de `training_legacy_claims` (autre que la sienne, faite par la RPC) avant le
// verdict de la preuve : un pré-check d'unicité en tête de handler suffirait à énumérer les 235
// logins existants ET à apprendre lesquels restent à voler, sans consommer une tentative d'échec.
//
// Gardes : `requirePageProfileLive('frm-entrainement')` — le suffixe `Live` refuse la consultation
// « en tant que ». C'est crucial : un admin en impersonation ne doit pas pouvoir réclamer un ancien
// compte au nom d'un chatter, sans quoi le journal ne saurait pas dire QUI a agi.
//
// ÉCRITURES en service-role (`training_legacy_claims` n'a AUCUNE policy d'écriture), toujours
// APRÈS la garde — `profile_id` vaut celui rendu par la garde, jamais une valeur venue de l'entrée.
//
// Le mot de passe saisi n'entre dans AUCUN log, aucun breadcrumb, aucun objet capturé : `runAction`
// ne capture que l'exception, pas l'entrée — cette propriété doit être PRÉSERVÉE.

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requirePageProfileLive, runAction, type ActionResult } from '@/lib/actions'
import {
  LegacyBeginError,
  clearLegacyAttempt,
  closeLegacySync,
  legacyClaimBegin,
  legacyClaimSettle,
  readLegacyClaim,
  type LegacyBeginCode,
  type LegacySettleCode,
} from '@/lib/gla/claim'
import { readAccount } from '@/lib/gla/client'
import { LegacySourceError } from '@/lib/gla/bounds'
import { LegacyCountMismatchError, LegacyUnreachableError, runLegacyImport } from '@/lib/gla/import'
import { verifyGlaPassword } from '@/lib/gla/verify'
import { clientIp } from '@/lib/http/client-ip'
import * as M from './messages'
import { legacyClaimForm, legacyResyncInput } from './schema'
import type { LegacyClaimResult } from './types'

type Admin = ReturnType<typeof createAdminClient>

const revalidateMe = () => revalidatePath('/formation/ma-formation')

/**
 * Les cinq refus de `claim_begin` n'ont que TROIS textes. Le gel par login (`LEGACY_LOGIN_FROZEN`)
 * rend exactement celui du plafond par profil : un texte propre en ferait un signal
 * « ce login est activement ciblé », donc un outil de reconnaissance.
 */
function beginMessage(code: LegacyBeginCode): string {
  if (code === 'LEGACY_LOCKED') return M.LOCKED
  if (code === 'LEGACY_RESYNC_COOLDOWN') return M.RESYNC_COOLDOWN
  if (code === 'LEGACY_SYNC_RUNNING') return M.SYNC_RUNNING
  // LEGACY_RATE_LIMITED, LEGACY_LOGIN_FROZEN — et LEGACY_INPUT_INVALID, que le schéma Zod a déjà
  // filtré : lui donner un texte distinct dirait à l'attaquant que sa saisie a franchi la porte.
  return M.RATE_LIMITED
}

/** Ouvre la tentative et traduit le refus. Toute tentative ouverte DOIT être réglée ensuite. */
async function begin(admin: Admin, args: { profileId: string; login: string }): Promise<string> {
  try {
    return await legacyClaimBegin(admin, { ...args, ip: await clientIp() })
  } catch (err) {
    if (err instanceof LegacyBeginError) throw new BusinessError(beginMessage(err.code))
    throw err
  }
}

/**
 * Lecture du compte chez GLA. Une panne de la plateforme d'en face NEUTRALISE la tentative
 * (`cleared_at`) : sans ça, une indisponibilité fait grimper le compteur cumulé de quelqu'un qui
 * n'a rien fait de mal, et le verrouille à 10 jusqu'à intervention admin.
 */
async function readAccountOrFail(admin: Admin, attemptId: string, login: string) {
  try {
    return await readAccount(login)
  } catch (err) {
    Sentry.captureException(err)
    await clearLegacyAttempt(admin, attemptId)
    throw new BusinessError(M.GLA_DOWN)
  }
}

/** Les trois refus rendus par `claim_settle` — les seuls messages explicites, tous POST-preuve. */
async function refuseSettle(admin: Admin, profileId: string, code: LegacySettleCode): Promise<never> {
  if (code === 'sync_running') throw new BusinessError(M.SYNC_RUNNING)
  if (code === 'taken') {
    // Une collision est l'une des deux seules situations où quelqu'un de légitime reste bloqué :
    // l'admin doit la voir.
    Sentry.captureMessage('Reprise GLA : identifiant déjà rattaché à un autre profil', {
      level: 'warning',
      extra: { profileId },
    })
    throw new BusinessError(M.TAKEN)
  }
  // 'other_login' : on lit SA PROPRE ligne (jamais celle de la cible) pour nommer le login déjà
  // rattaché — l'information n'apprend rien à personne, le profil connaît déjà son état.
  const mine = await readLegacyClaim(admin, profileId)
  Sentry.captureMessage('Reprise GLA : profil déjà rattaché à un autre identifiant', {
    level: 'warning',
    extra: { profileId },
  })
  throw new BusinessError(M.otherLogin(mine?.loginDisplay ?? '—'))
}

/**
 * L'import lui-même, partagé par la réclamation et la resynchronisation : ordre §5.9, contrôle de
 * comptage §3.9, recalcul §3.8, streak §3.7, puis clôture de la ligne de rattachement — c'est CET
 * update que le trigger observe pour écrire le journal `member_events`.
 *
 * `sync_started_at` n'est PAS relâché en cas d'échec : sa fenêtre de 5 minutes est le seul
 * garde-fou qui empêche de relancer en boucle une lecture de 57 Mo sur la production GLA quand
 * `last_sync_at` est encore `null` (le cooldown d'une heure ne mord pas dans cet état).
 */
async function importAndClose(admin: Admin, profileId: string, login: string): Promise<LegacyClaimResult> {
  let stats
  try {
    stats = await runLegacyImport({ admin, profileId, login })
  } catch (err) {
    Sentry.captureException(err)
    // Quatre familles d'échec, quatre messages — jamais un 500 générique, jamais un silence.
    // L'indisponibilité de GLA vient EN PREMIER : elle survient avant la première écriture, et
    // « une partie de votre historique est déjà en place » serait faux (zéro ligne écrite).
    if (err instanceof LegacyUnreachableError) throw new BusinessError(M.GLA_DOWN)
    if (err instanceof LegacyCountMismatchError) throw new BusinessError(M.INCOMPLETE)
    if (err instanceof LegacySourceError) throw new BusinessError(M.IMPOSSIBLE)
    throw new BusinessError(M.INTERRUPTED)
  }
  await closeLegacySync(admin, { profileId, sessionsCount: stats.sessions })
  revalidateMe()
  return {
    message: M.successMessage(stats),
    sessions: stats.sessions,
    newSessions: stats.newSessions,
    cases: stats.cases,
    messages: stats.messages,
    loginDisplay: login,
  }
}

/**
 * RÉCLAMER son ancien compte — identifiant + mot de passe de Good Luck Agency.
 *
 * Le seul point d'entrée de toute l'application (aucun doublon sur `/formation/modules` ni dans le
 * menu). Un porteur de `frm-suivi` SANS `frm-entrainement` ne le voit jamais : c'est voulu, son
 * recours est le filet admin.
 */
export async function claimLegacyAccount(raw: unknown): Promise<ActionResult<LegacyClaimResult>> {
  return runAction({
    schema: legacyClaimForm,
    input: raw,
    guard: noGuard,
    handler: async ({ login, password }): Promise<LegacyClaimResult> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const admin = createAdminClient()

      const attemptId = await begin(admin, { profileId: profile.id, login })
      const account = await readAccountOrFail(admin, attemptId, login)
      // `verifyGlaPassword` calcule le sha256 MÊME quand le compte n'existe pas (sel factice) : le
      // temps de réponse ne doit pas dire quels logins existent, sinon le message générique ne sert
      // plus à rien.
      const ok = verifyGlaPassword(account, password)
      const verdict = await legacyClaimSettle(admin, {
        attemptId,
        ok,
        loginDisplay: account?.login ?? '',
        // L'AUTEUR DU GESTE, explicitement — pas `null`. Après un détachement admin, `linked_by`
        // pointe sur l'admin (c'est ce qui impute le détachement dans le journal) et
        // `claim_settle` fait `coalesce(p_linked_by, linked_by)` : sans cette valeur, la
        // ré-appropriation par le propriétaire serait journalisée AU NOM DE L'ADMIN. §7.6 fait de
        // l'imputation la raison d'être de `requirePageProfileLive` — la perdre ici la contredit.
        linkedBy: profile.id,
      })
      if (verdict === 'failed' || !account) throw new BusinessError(M.NOT_FOUND)
      if (verdict !== 'new' && verdict !== 'resync') await refuseSettle(admin, profile.id, verdict)

      // Le login EXACT lu dans `chatters`, jamais la saisie : `where login = $1` sur `sessions`
      // tient l'index, un `lower(login) = …` coûterait un balayage de 57 Mo sur une base en prod.
      return importAndClose(admin, profile.id, account.login)
    },
  })
}

/**
 * RESYNCHRONISER — le même bouton, le même code, aucun mot de passe.
 *
 * Ce n'est PAS une tentative de preuve : la propriété est déjà établie, la resynchronisation ne
 * prouve rien de neuf. Elle ne compte donc ni comme succès ni comme échec (colonne `resync` posée
 * par `claim_begin`, exclue de tous les compteurs) — sans quoi son succès remettrait le compteur
 * glissant à zéro et offrirait une force brute illimitée à qui possède déjà son propre compte.
 * Son seul plafond est le cooldown d'une heure.
 *
 * Sert AUSSI de « Reprendre la récupération » : un import interrompu laisse `last_sync_at` à
 * `null` et l'on relance exactement le même chemin, qui complète ce qui manque.
 */
export async function resyncLegacyAccount(raw: unknown): Promise<ActionResult<LegacyClaimResult>> {
  return runAction({
    schema: legacyResyncInput,
    input: raw ?? {},
    guard: noGuard,
    handler: async (): Promise<LegacyClaimResult> => {
      const profile = await requirePageProfileLive('frm-entrainement')
      const admin = createAdminClient()

      const claim = await readLegacyClaim(admin, profile.id)
      // Détaché : la resynchronisation n'a plus d'objet, il faut re-réclamer avec le mot de passe
      // (c'est ce que l'encart propose — il repasse en appel).
      if (!claim || claim.detachedAt) throw new BusinessError(M.NO_CLAIM)

      const attemptId = await begin(admin, { profileId: profile.id, login: claim.loginKey })
      // On RE-RÉSOUT le login chez GLA plutôt que de faire confiance à `login_display` : c'est ce
      // qui garantit que `readSessions` vise le bon compte. Sans ça, un `login_display` divergent
      // rendrait 0 session et le contrôle de comptage conclurait « déjà à jour » — précisément le
      // mensonge que §3.9 existe pour empêcher.
      const account = await readAccountOrFail(admin, attemptId, claim.loginKey)
      if (!account) {
        // Le compte a disparu de GLA depuis le rattachement : rien à resynchroniser, et surtout
        // pas de « déjà à jour » qui laisserait croire que tout va bien.
        await legacyClaimSettle(admin, { attemptId, ok: false, loginDisplay: claim.loginDisplay })
        throw new BusinessError(M.GLA_DOWN)
      }
      // `linkedBy` = le chatter lui-même : c'est LUI qui a cliqué, même si le rattachement d'origine
      // avait été posé par un admin (D7). Sans ça le journal continuerait d'imputer à l'admin.
      const verdict = await legacyClaimSettle(admin, {
        attemptId,
        ok: true,
        loginDisplay: account.login,
        linkedBy: profile.id,
      })
      if (verdict !== 'new' && verdict !== 'resync') await refuseSettle(admin, profile.id, verdict)

      return importAndClose(admin, profile.id, account.login)
    },
  })
}
