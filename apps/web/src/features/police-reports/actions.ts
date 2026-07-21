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
      // 1) upsert de l'en-tête (author = self).
      const { data: header, error: hErr } = await supabase
        .from('police_reports')
        .upsert(
          {
            author_id: profile.id,
            creator_id: values.creatorId,
            day: values.day,
            ca: values.ca,
            non_traitees: values.nonTraitees,
            absents: values.absents,
            alerte: values.alerte,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'author_id,creator_id,day' },
        )
        .select('id')
        .single()
      if (hErr || !header) throw new Error(hErr?.message ?? 'Échec de l’enregistrement')
      // 2) remplacer les lignes : delete puis insert (fiche du soir, volume faible).
      const { error: dErr } = await supabase.from('police_report_lines').delete().eq('report_id', header.id)
      if (dErr) throw new Error(dErr.message)
      if (values.lines.length) {
        const { error: iErr } = await supabase.from('police_report_lines').insert(
          values.lines.map((l) => ({ report_id: header.id, chatter_id: l.chatterId, observation: l.observation })),
        )
        if (iErr) throw new Error(iErr.message)
      }
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
