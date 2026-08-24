'use server'

// LE FILET ADMIN de la reprise Good Luck Agency (D7) — rattacher un ancien login à un membre SANS
// son mot de passe, resynchroniser, détacher, libérer un identifiant, lever un verrou.
//
// Garde : `requireAdminProfileLive()` — ADMIN STRICT, jamais « qui a la page Membres ». Un manager
// porteur de la page ne voit pas le bloc ET se le voit refuser côté serveur ; le suffixe `Live`
// refuse en outre la consultation « en tant que » (sans elle, le journal ne saurait pas dire QUI a
// agi — or c'est toute la parade aux 4 mots de passe GLA devinables).
//
// Les MESSAGES sont EXPLICITES ici, contrairement au chemin chatter : l'argument d'oracle ne
// s'applique pas, l'admin est déjà l'autorité, et un message opaque le laisse sans moyen de
// comprendre.
//
// D7 N'EST PAS BORNÉ, et c'est un choix : un admin peut rattacher n'importe lequel des 248 logins à
// n'importe quel membre. Le borner aux seuls comptes qui le justifient casserait sa raison d'être —
// il doit aussi couvrir le chatter qui a simplement oublié son mot de passe. Ce qui borne le risque
// est ailleurs : garde admin stricte, aperçu avant validation, détachement doux, journal.

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { BusinessError, noGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { readLegacyClaim } from '@/lib/gla/claim'
import { readAccountSummary, searchLogins } from '@/lib/gla/client'
import { detachLegacySessions } from '@/lib/gla/detach'
import {
  GLA_DOWN,
  linkAndSync,
  markLegacyDetached,
  readLegacyAdminState,
  readLoginHolder,
  type LegacyAdminState,
} from './legacy-link'

const profileInput = z.object({ profileId: z.uuid() })
const loginInput = z.object({ profileId: z.uuid(), login: z.string().trim().min(1).max(64) })

const DETACH_BLOCKED = 'Ancienne plateforme injoignable — le détachement serait irréversible.'
const NO_CLAIM = 'Ce membre n’est rattaché à aucun ancien compte.'

const revalidateMembers = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/formation/ma-formation')
}

/** L'état du bloc « Ancienne plateforme », chargé à l'ouverture de l'onglet (patron `loadMemberEvents`). */
export async function loadLegacyState(raw: unknown): Promise<ActionResult<LegacyAdminState>> {
  return runAction({
    schema: profileInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      await requireAdminProfileLive()
      return readLegacyAdminState(createAdminClient(), profileId)
    },
  })
}

/**
 * Autocomplétion du login. OBLIGATOIRE et pas un confort : sans elle l'admin tape à l'aveugle un
 * login parmi 248, dont 162 portent des majuscules et 7 du non-ASCII — une faute de frappe donne un
 * échec, une faute PLAUSIBLE rattache le mauvais historique et brûle un `login_key` unique.
 *
 * Servie par une Server Action ADMIN, jamais par une route publique : c'est un annuaire de 248
 * logins attaquables.
 */
export async function searchLegacyLogins(raw: unknown): Promise<ActionResult<string[]>> {
  return runAction({
    schema: z.object({ prefix: z.string().trim().min(1).max(64) }),
    input: raw,
    guard: noGuard,
    handler: async ({ prefix }) => {
      await requireAdminProfileLive()
      try {
        return await searchLogins(prefix)
      } catch (err) {
        Sentry.captureException(err)
        throw new BusinessError(GLA_DOWN)
      }
    },
  })
}

/**
 * L'aperçu de confirmation (§2.4) : l'admin valide un FAIT — « Axel93 — 214 sessions, dernière le
 * 23/08 », ou « déjà rattaché à Marie D. » — pas une chaîne de caractères.
 */
export async function previewLegacyLogin(
  raw: unknown,
): Promise<ActionResult<{ login: string; sessions: number; lastAt: number | null; takenBy: string | null } | null>> {
  return runAction({
    schema: z.object({ login: z.string().trim().min(1).max(64) }),
    input: raw,
    guard: noGuard,
    handler: async ({ login }) => {
      await requireAdminProfileLive()
      const admin = createAdminClient()
      let account: Awaited<ReturnType<typeof readAccountSummary>>
      try {
        account = await readAccountSummary(login)
      } catch (err) {
        Sentry.captureException(err)
        throw new BusinessError(GLA_DOWN)
      }
      if (!account) return null
      const holder = await readLoginHolder(admin, account.login)
      return { ...account, takenBy: holder?.displayName ?? null }
    },
  })
}

/** RATTACHER un ancien login à un membre — sans mot de passe (D7), chaîne d'import complète. */
export async function linkLegacyAccount(raw: unknown): Promise<ActionResult<string>> {
  return runAction({
    schema: loginInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId, login }) => {
      const caller = await requireAdminProfileLive()
      const out = await linkAndSync(createAdminClient(), { profileId, rawLogin: login, adminId: caller.id })
      revalidateMembers()
      return out
    },
  })
}

/** RESYNCHRONISER depuis la fiche membre — même cooldown d'une heure que côté chatter. */
export async function resyncLegacyAccount(raw: unknown): Promise<ActionResult<string>> {
  return runAction({
    schema: profileInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      const caller = await requireAdminProfileLive()
      const admin = createAdminClient()
      const claim = await readLegacyClaim(admin, profileId)
      if (!claim || claim.detachedAt) throw new BusinessError(NO_CLAIM)
      const out = await linkAndSync(admin, { profileId, rawLogin: claim.loginKey, adminId: caller.id })
      revalidateMembers()
      return out
    },
  })
}

/**
 * DÉTACHER — destructif, et refusé si GLA est injoignable : le détachement supprime des lignes
 * qu'on ne sait reconstruire QU'EN RELISANT GLA. Sans la source, il serait définitif.
 */
export async function unlinkLegacyAccount(raw: unknown): Promise<ActionResult<string>> {
  return runAction({
    schema: profileInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      const caller = await requireAdminProfileLive()
      const admin = createAdminClient()
      const claim = await readLegacyClaim(admin, profileId)
      if (!claim || claim.detachedAt) throw new BusinessError(NO_CLAIM)

      // Sonde de disponibilité AVANT la première suppression — et le login doit exister encore.
      let account: Awaited<ReturnType<typeof readAccountSummary>>
      try {
        account = await readAccountSummary(claim.loginKey)
      } catch (err) {
        Sentry.captureException(err)
        throw new BusinessError(DETACH_BLOCKED)
      }
      if (!account) throw new BusinessError(DETACH_BLOCKED)

      const stats = await detachLegacySessions(admin, profileId)
      await markLegacyDetached(admin, profileId, caller.id)
      revalidateMembers()
      return `Détaché — ${stats.removed} sessions reprises supprimées. Les sessions jouées ici ne sont pas touchées.`
    },
  })
}

/**
 * LIBÉRER l'identifiant : la ligne détachée est supprimée, le login redevient réclamable.
 * Un geste SÉPARÉ et tracé, précisément pour que « détacher puis réclamer » ne soit pas un chemin
 * de vol en deux dialogues non corrélés.
 */
export async function releaseLegacyLogin(raw: unknown): Promise<ActionResult<string>> {
  return runAction({
    schema: profileInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      await requireAdminProfileLive()
      const admin = createAdminClient()
      const claim = await readLegacyClaim(admin, profileId)
      if (!claim) throw new BusinessError(NO_CLAIM)
      if (!claim.detachedAt) throw new BusinessError('Détachez ce membre avant de libérer son identifiant.')
      // Le trigger écrit la ligne de journal « identifiant libéré » sur le DELETE.
      const { error } = await admin.from('training_legacy_claims').delete().eq('profile_id', profileId)
      if (error) throw new Error(error.message)
      revalidateMembers()
      return `Identifiant « ${claim.loginDisplay} » libéré — il peut être réclamé à nouveau.`
    },
  })
}

/**
 * LEVER LE VERROU : `cleared_at` sur les échecs du membre, jamais un `delete` — le déverrouillage
 * ne doit pas effacer la trace de ce qui a motivé le verrou. C'est la seule table qui dit qu'un
 * compte a été ciblé.
 */
export async function unlockLegacyClaim(raw: unknown): Promise<ActionResult<string>> {
  return runAction({
    schema: profileInput,
    input: raw,
    guard: noGuard,
    handler: async ({ profileId }) => {
      await requireAdminProfileLive()
      const { data, error } = await createAdminClient()
        .from('training_legacy_claim_attempts')
        .update({ cleared_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('ok', false)
        .is('cleared_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      revalidateMembers()
      return `Verrou levé — ${data?.length ?? 0} tentatives neutralisées.`
    },
  })
}
