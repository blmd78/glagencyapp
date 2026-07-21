'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess, type Profile } from '@/lib/auth'
import { runAction, BusinessError, type ActionResult } from '@/lib/actions'
import { reportInput, deleteReportInput } from './schema'
import { assignedCreatorIds } from './services/get-police-reports'

const noGuard = async () => ({ ok: true as const })

/** Miroir de la RLS d'écriture : page police + (droit d'écriture OU rôle police fonctionnel). */
async function requireReporter(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  const isFunctionalPolice = profile.baseRole === 'police' && profile.pages.includes('police')
  return hasWriteAccess(profile, 'police') || isFunctionalPolice ? profile : null
}

/** Le modèle doit être dans le périmètre de l'auteur (admin = tout). MÊME source que la
 *  lecture et les options (profile_creators) — cf. assignedCreatorIds. */
async function creatorInScope(profile: Profile, creatorId: string): Promise<boolean> {
  const scope = await assignedCreatorIds(profile)
  return scope === null || scope.has(creatorId)
}

/** Crée ou met à jour la fiche du soir (upsert sur (author_id, creator_id, day)) + ses lignes. */
export async function upsertPoliceReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reportInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireReporter()
      if (!profile) throw new BusinessError('Accès refusé')
      if (!(await creatorInScope(profile, values.creatorId)))
        throw new BusinessError('Modèle hors de ton périmètre')
      const supabase = await createClient()
      // Les chatteurs des lignes doivent appartenir AU modèle (sinon un writer pourrait injecter,
      // via l'action ou la RPC en direct, un chatteur d'un autre modèle — la RLS des lignes ne
      // contrôle que la propriété de l'en-tête, pas l'appartenance chatteur↔modèle). RLS
      // `chatter_creators` scopée → cohérent avec `creatorInScope` ci-dessus.
      if (values.lines.length) {
        const { data: allowed, error: cErr } = await supabase
          .from('chatter_creators')
          .select('chatter_id')
          .eq('creator_id', values.creatorId)
        if (cErr) throw new Error(cErr.message)
        const allowedIds = new Set((allowed ?? []).map((r) => r.chatter_id))
        if (values.lines.some((l) => !allowedIds.has(l.chatterId)))
          throw new BusinessError('Un chatteur sélectionné n’appartient pas à ce modèle')
      }
      // Upsert en-tête + remplacement complet des lignes en UNE transaction (RPC `0073`,
      // SECURITY INVOKER → la RLS s'applique, `author = auth.uid()` posé côté SQL). Atomique :
      // plus de fenêtre « rapport sans lignes » si l'insert échouait après le delete.
      const { error } = await supabase.rpc('upsert_police_report', {
        p_creator_id: values.creatorId,
        p_day: values.day,
        p_ca: values.ca,
        p_non_traitees: values.nonTraitees,
        p_absents: values.absents,
        // `?? undefined` : `alerte` est nullable (Zod → null si vide) mais le param RPC a un
        // `default null` → on omet l'argument plutôt que d'envoyer null (types Supabase = optionnel).
        p_alerte: values.alerte ?? undefined,
        p_lines: values.lines.map((l) => ({
          chatter_id: l.chatterId,
          a_marche: l.aMarche,
          a_regler: l.aRegler,
        })),
      })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/rapport-police')
    },
  })
}

export async function deletePoliceReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteReportInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const profile = await requireReporter()
      if (!profile) throw new BusinessError('Accès refusé')
      const supabase = await createClient()
      // .eq('author_id') : on ne supprime que le sien (la RLS le garantit déjà).
      const { data, error } = await supabase
        .from('police_reports')
        .delete()
        .eq('id', id)
        .eq('author_id', profile.id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Ce rapport n’existe plus ou n’est pas le tien')
      revalidatePath('/chatter/rapport-police')
    },
  })
}
