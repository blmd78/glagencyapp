'use server'

// Server Actions (mutations) de la feature « quotas » — supabase-js + RLS.
// Écritures : table quotas (0005) et creators.excluded/excluded_reason uniquement
// (grant colonne 0006) ; réservées aux admins (guard ci-dessous + policies 0010).
// Zod ci-dessous non partagé côté client (les éditeurs ne sont pas des forms RHF,
// juste des inputs contrôlés) → reste inline (cf. docs/guidelines-standard-feature.md §5).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'

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
export async function saveQuotas(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: saveQuotasSchema,
    input: raw,
    guard: async () => {
      const profile = await getProfile()
      return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Accès refusé' }
    },
    handler: async ({ upserts, deletes }) => {
      // Mémoïsé par requête (`cache()`, lib/auth) — pas de round-trip DB supplémentaire
      // par rapport à l'appel déjà fait dans la garde.
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer

      const supabase = await createClient()

      // Upsert et delete portent sur des team_id DISJOINTS (l'éditeur route chaque équipe
      // vers l'un OU l'autre) → indépendants, exécutés en parallèle.
      const [upRes, delRes] = await Promise.all([
        upserts.length > 0
          ? supabase.from('quotas').upsert(
              upserts.map((q) => ({
                team_id: q.teamId,
                presence_h: q.presenceH,
                reactivite_s: q.reactiviteS,
                medias_proposes: q.mediasProposes,
                conv_pct: q.convPct,
                ca_eur: q.caEur,
                updated_at: new Date().toISOString(),
                updated_by: profile.id,
              })),
            )
          : Promise.resolve(null),
        deletes.length > 0
          ? supabase.from('quotas').delete().in('team_id', deletes)
          : Promise.resolve(null),
      ])

      // Revalide dès qu'une écriture a abouti, même si l'autre a échoué — sinon la page
      // continuerait d'afficher un état antérieur aux upserts persistés. L'échec lui-même
      // est une erreur technique (écriture Supabase) → jeté, jamais renvoyé brut à l'UI ;
      // runAction le capture (Sentry) et répond avec le message générique.
      const failed: string[] = []
      let wrote = false
      if (upRes) {
        if (upRes.error) failed.push(`sauvegarde des seuils (${upRes.error.message})`)
        else wrote = true
      }
      if (delRes) {
        if (delRes.error) failed.push(`retrait des quotas vidés (${delRes.error.message})`)
        else wrote = true
      }

      if (wrote) revalidatePath('/chatter/quotas')
      if (failed.length > 0) throw new Error(`Échec partiel — ${failed.join(' · ')}`)
    },
  })
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
export async function saveExclusions(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: saveExclusionsSchema,
    input: raw,
    guard: async () => {
      const profile = await getProfile()
      return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Accès refusé' }
    },
    handler: async ({ exclude, include }) => {
      const supabase = await createClient()

      // Ids disjoints par construction (une case = exclu OU inclus) → écritures parallèles.
      const [exRes, incRes] = await Promise.all([
        exclude.length > 0
          ? supabase
              .from('creators')
              .update({ excluded: true, excluded_reason: 'Exclu LTV (page Quotas)' })
              .in('id', exclude)
          : Promise.resolve(null),
        include.length > 0
          ? supabase
              .from('creators')
              .update({ excluded: false, excluded_reason: null })
              .in('id', include)
          : Promise.resolve(null),
      ])

      // Même règle que saveQuotas : écriture Supabase en échec = technique → throw.
      const failed: string[] = []
      let wrote = false
      if (exRes) {
        if (exRes.error) failed.push(`exclusion (${exRes.error.message})`)
        else wrote = true
      }
      if (incRes) {
        if (incRes.error) failed.push(`ré-inclusion (${incRes.error.message})`)
        else wrote = true
      }

      if (wrote) revalidatePath('/chatter/quotas')
      if (failed.length > 0) throw new Error(`Échec partiel — ${failed.join(' · ')}`)
    },
  })
}
