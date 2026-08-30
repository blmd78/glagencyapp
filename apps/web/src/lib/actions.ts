import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { getProfile, hasPageAccess, hasWriteAccess, type Profile } from '@/lib/auth'
import { readStateCookie } from '@/lib/impersonation/session'
import type { PageSlug } from '@/config/workspaces'

/** Contrat de retour UNIQUE des Server Actions (spec 2026-07-16 §2.5). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Erreur MÉTIER : tout message français écrit PAR NOUS (jamais un `error.message` Supabase
 * brut) est une `BusinessError` — pas seulement les conflits que seule la base peut trancher.
 * `runAction` la renvoie comme retour métier (message affiché tel quel, pas de Sentry) ; une
 * `Error` nue reste TECHNIQUE (Sentry + message générique). `fieldErrors` (optionnel) pose le
 * message sur un champ précis du formulaire (mêmes clés que le schéma zod) au lieu du seul
 * message global, quand on connaît le champ fautif (ex. email déjà pris).
 */
export class BusinessError extends Error {
  readonly fieldErrors?: Record<string, string[]>

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.fieldErrors = fieldErrors
  }
}

/**
 * Enchaîne les obligations d'une Server Action : garde d'auth → validation Zod →
 * handler. Erreur MÉTIER = retour typé (guard/fieldErrors, ou `BusinessError` levée par le
 * handler — message + `fieldErrors` optionnels) ; erreur TECHNIQUE = capturée Sentry +
 * message générique (jamais un message Supabase brut à l'écran). La RLS reste le
 * garde-fou réel — la garde ici est la défense en profondeur.
 */
export async function runAction<S extends z.ZodType, T = void>(opts: {
  schema: S
  input: unknown
  guard: () => Promise<{ ok: true } | { ok: false; error: string }>
  handler: (values: z.infer<S>) => Promise<T>
}): Promise<ActionResult<T>> {
  // Tout le pipeline sous try : une garde qui THROW (ex. échec Supabase dans getProfile)
  // est capturée comme une erreur technique — pas d'unhandled rejection possible.
  try {
    const gate = await opts.guard()
    if (!gate.ok) return { success: false, error: gate.error }

    // (Plus d'audit Sentry par action : l'audit d'impersonation vit dans
    // `impersonation_sessions` — acteur, cible, fenêtre started_at→ended_at ; toute action
    // faite en impersonation est attribuable en croisant son horodatage avec cette fenêtre.
    // La capture par action était redondante ET bruyante — elle se déclenchait aussi sur les
    // lectures, et polluait la liste des issues Sentry de faux positifs, 2026-08-10.)

    const parsed = opts.schema.safeParse(opts.input)
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error)
      // Un refine métier SANS `path` (ex. « bilan requis pour Résolu ») doit remonter SON
      // message. Filtre sur `code === 'custom'` uniquement : un `invalid_type` racine
      // (input null/malformé) produirait un message anglais brut de Zod — jamais à l'UI.
      const rootMsg = parsed.error.issues.find(
        (i) => i.path.length === 0 && i.code === 'custom',
      )?.message
      return {
        success: false,
        error: rootMsg ?? 'Saisie invalide',
        fieldErrors: fieldErrors as Record<string, string[]>,
      }
    }

    return { success: true, data: await opts.handler(parsed.data) }
  } catch (err) {
    if (err instanceof BusinessError) {
      return { success: false, error: err.message, fieldErrors: err.fieldErrors }
    }
    Sentry.captureException(err)
    return { success: false, error: 'Erreur inattendue — réessaie ou préviens l’admin.' }
  }
}

// Messages de refus — dire POURQUOI le refus (un « Accès refusé » nu envoyait l'utilisateur
// demander à l'admin sans comprendre). Trois causes distinctes selon le garde qui bloque.
export const DENY_ADMIN = 'Action réservée aux administrateurs.'
export const DENY_PAGE = 'Cette section ne t’est pas attribuée — demande à un admin.'
export const DENY_WRITE = 'Modification réservée aux encadrants de cette section.'
/** Appelant qui n'est pas un encadrant (manager/admin) sur une action qui l'exige. */
export const DENY_STAFF = 'Action réservée aux encadrants.'

/** Garde « admin uniquement » pour runAction — remplace les 11 redéclarations locales. */
export async function adminGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return profile?.role === 'admin' ? { ok: true } : { ok: false, error: DENY_ADMIN }
}

/** Garde « admin OU page autorisée » pour runAction (LECTURE / actions ouvertes au chatteur). */
export function pageGuard(slug: PageSlug) {
  return async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const profile = await getProfile()
    return profile && (profile.role === 'admin' || profile.pages.includes(slug))
      ? { ok: true }
      : { ok: false, error: DENY_PAGE }
  }
}

/** Garde « admin OU manager/sous-manager ayant la page » pour runAction — ÉCRITURES
 *  réservées (miroir de la RLS `can_write_page`, 0060). Un chatteur est exclu. */
export function managerPageGuard(slug: PageSlug) {
  return async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const profile = await getProfile()
    return hasWriteAccess(profile, slug) ? { ok: true } : { ok: false, error: DENY_WRITE }
  }
}

/** `runAction` exige un `guard` ; quand tout le contrôle vit dans le handler (patron §4 des
 *  guidelines — vérification UNE SEULE FOIS, en tête de handler), `noGuard` le satisfait
 *  sans rien vérifier ni requêter. */
export const noGuard = async () => ({ ok: true as const })

/**
 * Jumeau d'`adminGuard` côté HANDLER, pour les mutations dont le handler a besoin du profil
 * (updated_by, paid_by…) : une seule requête au lieu de guard + getProfile — `cache()` (React)
 * ne mémoïse pas hors rendu RSC (guidelines §4). Refus = `BusinessError`, même message
 * qu'`adminGuard`.
 */
export async function requireAdminProfile(): Promise<Profile> {
  const profile = await getProfile()
  if (profile?.role !== 'admin') throw new BusinessError(DENY_ADMIN)
  return profile
}

/** Jumeau de `managerPageGuard` côté HANDLER (écritures réservées, miroir RLS
 *  `can_write_page`) — même logique et même message que `requireAdminProfile`. */
export async function requireWriteProfile(slug: PageSlug): Promise<Profile> {
  const profile = await getProfile()
  if (!hasWriteAccess(profile, slug)) throw new BusinessError(DENY_WRITE)
  return profile
}

/** Jumeau de `pageGuard` côté HANDLER (LECTURE / actions ouvertes au chatteur). */
export async function requirePageProfile(slug: PageSlug): Promise<Profile> {
  const profile = await getProfile()
  if (!hasPageAccess(profile, slug)) throw new BusinessError(DENY_PAGE)
  return profile
}

/**
 * Consultation « en tant que » = LECTURE seule : aucune écriture au nom de la personne visitée.
 * Un admin qui consulte sous l'identité d'un autre a un profil parfaitement valide — c'est le
 * cookie d'état (`imp_sid`) qui distingue les deux, et rien d'autre.
 */
export const DENY_IMPERSONATION = 'Action indisponible en consultation (mode « en tant que »)'

async function denyIfImpersonating(): Promise<void> {
  if (await readStateCookie()) throw new BusinessError(DENY_IMPERSONATION)
}

/**
 * `requireAdminProfile` + refus en « en tant que » — garde des ÉCRITURES admin (Catalogue,
 * Recrutement, config de la Roue). Une seule requête profil, un seul message de refus.
 */
export async function requireAdminProfileLive(): Promise<Profile> {
  const profile = await requireAdminProfile()
  await denyIfImpersonating()
  return profile
}

/** `requirePageProfile` + refus en « en tant que » (Entraînement, Suivi…). */
export async function requirePageProfileLive(slug: PageSlug): Promise<Profile> {
  const profile = await requirePageProfile(slug)
  await denyIfImpersonating()
  return profile
}
