import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { getProfile, hasWriteAccess } from '@/lib/auth'
import type { PageSlug } from '@/config/workspaces'

/** Contrat de retour UNIQUE des Server Actions (spec 2026-07-16 §2.5). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Erreur MÉTIER tranchée côté base (contrainte unique, RPC anti-vol…) quand un pré-check
 * applicatif est impossible (ex. RLS cache les lignes des autres). `runAction` la renvoie
 * comme retour métier (message affiché tel quel, pas de Sentry) — réservée aux messages
 * français écrits par nous, jamais un `error.message` brut.
 */
export class BusinessError extends Error {}

/**
 * Enchaîne les obligations d'une Server Action : garde d'auth → validation Zod →
 * handler. Erreur MÉTIER = retour typé (guard/fieldErrors, ou `BusinessError` levée par le
 * handler quand seule la base peut trancher) ; erreur TECHNIQUE = capturée Sentry +
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
    if (err instanceof BusinessError) return { success: false, error: err.message }
    Sentry.captureException(err)
    return { success: false, error: 'Erreur inattendue — réessaie ou préviens l’admin.' }
  }
}

/** Garde « admin uniquement » pour runAction — remplace les 11 redéclarations locales. */
export async function adminGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Accès refusé' }
}

/** Garde « admin OU page autorisée » pour runAction (LECTURE / actions ouvertes au chatteur). */
export function pageGuard(slug: PageSlug) {
  return async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const profile = await getProfile()
    return profile && (profile.role === 'admin' || profile.pages.includes(slug))
      ? { ok: true }
      : { ok: false, error: 'Accès refusé' }
  }
}

/** Garde « admin OU manager/sous-manager ayant la page » pour runAction — ÉCRITURES
 *  réservées (miroir de la RLS `can_write_page`, 0060). Un chatteur est exclu. */
export function managerPageGuard(slug: PageSlug) {
  return async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const profile = await getProfile()
    return hasWriteAccess(profile, slug) ? { ok: true } : { ok: false, error: 'Accès refusé' }
  }
}
