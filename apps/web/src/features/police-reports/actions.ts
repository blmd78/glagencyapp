'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { canWritePolice, getProfile, type Profile } from '@/lib/auth'
import { getCreatorScope } from '@/lib/services/creator-scope'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { reportInput, deleteReportInput } from './schema'

/** Contrôle d'écriture Police — `canWritePolice` (lib/auth, SOURCE UNIQUE, miroir RLS 0078) ;
 *  même garde que le Tracker (l'audit 2026-08-06 en a trouvé quatre copies manuscrites). */
async function requireReporter(): Promise<Profile> {
  const profile = await getProfile()
  if (!canWritePolice(profile)) throw new BusinessError('Accès refusé')
  return profile
}

/** Crée ou met à jour la fiche du soir (upsert sur (author_id, creator_id, day)) + ses lignes. */
export async function upsertPoliceReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reportInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireReporter()
      // PÉRIMÈTRE PAR MODÈLE côté ÉCRITURE (audit 2026-08-06) : la lecture est bornée en SQL
      // (`getPoliceReports`), l'écriture doit l'être aussi — sinon un encadrant cloisonné
      // publiait des rapports sur des modèles qu'il ne peut même pas relire.
      const scope = await getCreatorScope(profile.id, profile.baseRole)
      if (scope && !scope.has(values.creatorId))
        throw new BusinessError('Ce modèle n’est pas dans ton périmètre')
      const supabase = await createClient()
      // On garde aussi, au niveau de l'ACTION, l'INTÉGRITÉ par modèle des lignes — un chatteur
      // d'un rapport sur le modèle
      // M doit être un membre role chatteur ASSIGNÉ à M. Défense en profondeur INCOMPLÈTE : un appel
      // RPC `upsert_police_report` direct (grant authenticated) la contourne — la RLS des lignes ne
      // contrôle que la propriété de l'en-tête, pas l'appartenance chatteur↔modèle (dette pré-existante,
      // héritée de 0073 ; à porter un jour dans le RPC/trigger). Client admin car la RLS
      // `profile_creators` (0054) cloisonne par équipe, pas par modèle.
      if (values.lines.length) {
        const admin = createAdminClient()
        const { data: allowed, error: cErr } = await admin
          .from('profile_creators')
          .select('profile_id, profiles!inner(role)')
          .eq('creator_id', values.creatorId)
          .eq('profiles.role', 'chatteur')
        if (cErr) throw new Error(cErr.message)
        const allowedIds = new Set((allowed ?? []).map((r) => r.profile_id))
        if (values.lines.some((l) => !allowedIds.has(l.chatterId)))
          throw new BusinessError('Un chatter sélectionné n’appartient pas à ce modèle')
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
