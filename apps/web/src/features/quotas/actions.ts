'use server'

// Server Actions (mutations) de la feature « quotas » — supabase-js + RLS.
// Écritures : table quotas (0005) et creators.excluded/excluded_reason uniquement
// (grant colonne 0006) ; réservées aux admins (requireAdmin + policies 0010).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Même convention de retour que les actions members. */
export type ActionResult = { success: true } | { success: false; error: string }

// ── Seuils journaliers ────────────────────────────────────────────────────────

const quotaUpsertSchema = z.object({
  teamId: z.uuid(),
  presenceH: z.number().gt(0).lte(24),
  reactiviteS: z.number().int().gt(0),
  mediasProposes: z.number().int().gte(0),
  convPct: z.number().gte(0).lte(100),
  caEur: z.number().gte(0),
})

const saveQuotasSchema = z.object({
  /** Lignes complètes (les 5 seuils) à créer/mettre à jour. */
  upserts: z.array(quotaUpsertSchema),
  /** team_id dont la ligne quotas doit être supprimée (= « non configuré »). */
  deletes: z.array(z.uuid()),
})

export type SaveQuotasInput = z.infer<typeof saveQuotasSchema>

/** Sauvegarde les seuils : upsert des lignes complètes, delete des lignes vidées. */
export async function saveQuotas(raw: SaveQuotasInput): Promise<ActionResult> {
  const { id: userId } = await requireAdmin()
  const parsed = saveQuotasSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Données invalides.' }

  const supabase = await createClient()

  const { upserts, deletes } = parsed.data
  const errors: string[] = []
  let wrote = false

  if (upserts.length > 0) {
    const { error } = await supabase.from('quotas').upsert(
      upserts.map((q) => ({
        team_id: q.teamId,
        presence_h: q.presenceH,
        reactivite_s: q.reactiviteS,
        medias_proposes: q.mediasProposes,
        conv_pct: q.convPct,
        ca_eur: q.caEur,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })),
    )
    if (error) errors.push(`sauvegarde des seuils : ${error.message}`)
    else wrote = true
  }

  if (deletes.length > 0) {
    const { error } = await supabase.from('quotas').delete().in('team_id', deletes)
    if (error) errors.push(`retrait des quotas vidés : ${error.message}`)
    else wrote = true
  }

  // Revalide dès qu'une écriture a abouti, même si l'autre a échoué —
  // sinon la page continuerait d'afficher un état antérieur aux upserts persistés.
  if (wrote) revalidatePath('/chatter/quotas')
  if (errors.length > 0) return { success: false, error: `Échec partiel — ${errors.join(' · ')}` }
  return { success: true }
}

// ── Exclusion LTV / CA global des comptes privés ─────────────────────────────

const saveExclusionsSchema = z.object({
  /** creator_id à exclure de la LTV / CA global. */
  exclude: z.array(z.uuid()),
  /** creator_id à ré-inclure. */
  include: z.array(z.uuid()),
})

export type SaveExclusionsInput = z.infer<typeof saveExclusionsSchema>

/** Bascule creators.excluded (seule colonne modifiable par le web, cf. migration 0006). */
export async function saveExclusions(raw: SaveExclusionsInput): Promise<ActionResult> {
  await requireAdmin()
  const parsed = saveExclusionsSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Données invalides.' }

  const supabase = await createClient()

  const { exclude, include } = parsed.data
  const errors: string[] = []
  let wrote = false

  if (exclude.length > 0) {
    const { error } = await supabase
      .from('creators')
      .update({ excluded: true, excluded_reason: 'Exclu LTV (page Quotas)' })
      .in('id', exclude)
    if (error) errors.push(`exclusion : ${error.message}`)
    else wrote = true
  }

  if (include.length > 0) {
    const { error } = await supabase
      .from('creators')
      .update({ excluded: false, excluded_reason: null })
      .in('id', include)
    if (error) errors.push(`ré-inclusion : ${error.message}`)
    else wrote = true
  }

  if (wrote) revalidatePath('/chatter/quotas')
  if (errors.length > 0) return { success: false, error: `Échec partiel — ${errors.join(' · ')}` }
  return { success: true }
}
