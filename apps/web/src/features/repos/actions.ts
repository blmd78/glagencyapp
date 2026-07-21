'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0016 : has_page('repos') en lecture ET écriture).
// Zod ci-dessous non partagé côté client (la grille n'est pas un form RHF, juste des
// ComboboxMultiple/Checkbox contrôlés qui sauvegardent à chaque clic) → reste inline
// (cf. docs/guidelines-standard-feature.md §5, même décision que quotas/actions.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess } from '@/lib/auth'
import { runAction, adminGuard, type ActionResult } from '@/lib/actions'

/** Garde d'action : admin, ou manager/sous-manager ayant la page `repos` (0060 — chatteur
 *  en lecture seule). Les managers/sous-managers gèrent le planning des repos. */
async function requireRepos() {
  const profile = await getProfile()
  return hasWriteAccess(profile, 'repos') ? profile : null
}

const cellInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6),
  col: z.string().min(1).max(30),
  chatterIds: z.array(z.uuid()).max(200),
  names: z.string().max(1000),
})

export async function saveReposCell(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: cellInput,
    input: raw,
    // Ajout/retrait d'un repos dans une case = ADMIN uniquement (les managers sont en lecture
    // seule sur les cases ; seule la case « envoyé Telegram » leur reste, cf. setReposSent).
    guard: adminGuard,
    handler: async (values) => {
      // getProfile pour `updated_by` (traçabilité) — l'accès est déjà tranché par adminGuard.
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const { weekStart, day, col, chatterIds, names } = values

      const supabase = await createClient()

      // Admin-only : écriture directe de la cellule telle que soumise (plus de MERGE de scope).
      const { error } = await supabase.from('rest_planning_cells').upsert(
        {
          week_start: weekStart,
          day,
          col,
          chatter_ids: chatterIds,
          names: names.trim(),
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'week_start,day,col' },
      )
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/repos')
    },
  })
}

// Édition de la compo (MODÈLES) d'une colonne — réservée admin (garde back + policy RLS is_admin).
const colMembersInput = z.object({
  col: z.enum(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']), // colonnes modèles uniquement
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creatorIds: z.array(z.uuid()).max(50),
})

export async function saveReposColumnMembers(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: colMembersInput,
    input: raw,
    guard: adminGuard,
    handler: async (values) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer

      const supabase = await createClient()
      const { error } = await supabase.from('rest_planning_column_members').upsert(
        {
          col: values.col,
          effective_from: values.effectiveFrom,
          creator_ids: values.creatorIds,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'col,effective_from' },
      )
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/repos')
    },
  })
}

const sentInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sent: z.boolean(),
})

export async function setReposSent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sentInput,
    input: raw,
    guard: async () => {
      const profile = await requireRepos()
      return profile ? { ok: true } : { ok: false, error: 'Accès refusé' }
    },
    handler: async (values) => {
      const profile = await requireRepos()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer

      const supabase = await createClient()
      const { error } = await supabase.from('rest_planning_weeks').upsert(
        {
          week_start: values.weekStart,
          sent_telegram: values.sent,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'week_start' },
      )
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/repos')
    },
  })
}
