import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

/** Contrat de retour UNIQUE des Server Actions (spec 2026-07-16 §2.5). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Enchaîne les obligations d'une Server Action : garde d'auth → validation Zod →
 * handler. Erreur MÉTIER = retour typé (guard/fieldErrors) ; erreur TECHNIQUE =
 * capturée Sentry + message générique (jamais un message Supabase brut à l'écran).
 * La RLS reste le garde-fou réel — la garde ici est la défense en profondeur.
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
    Sentry.captureException(err)
    return { success: false, error: 'Erreur inattendue — réessaie ou préviens l’admin.' }
  }
}
