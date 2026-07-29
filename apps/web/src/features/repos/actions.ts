'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0016 : has_page('repos') en lecture ET écriture).
// Zod ci-dessous non partagé côté client (la grille n'est pas un form RHF, juste des
// ComboboxMultiple/Checkbox contrôlés qui sauvegardent à chaque clic) → reste inline
// (cf. docs/guidelines-standard-feature.md §5, même décision que quotas/actions.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  BusinessError,
  runAction,
  noGuard,
  requireAdminProfile,
  requireWriteProfile,
  type ActionResult,
} from '@/lib/actions'

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
    // Cases CHATTEURS (colonnes modèles) : admin OU manager/sous-manager porteur de la page
    // (miroir RLS can_write_page('repos'), 0060) — les managers posent/décalent les repos de
    // leurs chatters. Cases ENCADREMENT (managers/policiers) : admin uniquement.
    // Contrôle en tête de handler (patron §4) : le profil sert aussi à `updated_by`.
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireWriteProfile('repos')
      const { weekStart, day, col, chatterIds, names } = values
      if ((col === 'managers' || col === 'policiers') && profile.role !== 'admin')
        throw new BusinessError('Accès refusé')

      const supabase = await createClient()

      // Périmètre hiérarchique (0087) : un non-admin ne peut MODIFIER (ajouter/retirer) que
      // des chatters visibles sous son RLS profiles — son sous-arbre. Le delta se calcule
      // contre la cellule actuelle : les chatters des autres équipes déjà posés transitent
      // intacts dans l'upsert (l'UI les resoummet tels quels), seuls les IDs qui changent
      // sont contrôlés. Les jetons texte legacy (`names`) n'ont pas d'ID → non contrôlables.
      if (profile.role !== 'admin') {
        const { data: currentRow, error: readErr } = await supabase
          .from('rest_planning_cells')
          .select('chatter_ids')
          .eq('week_start', weekStart)
          .eq('day', day)
          .eq('col', col)
          .maybeSingle()
        if (readErr) throw new Error(readErr.message)
        const before = new Set(currentRow?.chatter_ids ?? [])
        const after = new Set(chatterIds)
        const changed = [...new Set([...before, ...after])].filter(
          (id) => before.has(id) !== after.has(id),
        )
        if (changed.length) {
          // Sous RLS, seuls les profils du sous-arbre répondent : tout ID manquant = hors équipe.
          const { data: visible, error: visErr } = await supabase
            .from('profiles')
            .select('id')
            .in('id', changed)
          if (visErr) throw new Error(visErr.message)
          if ((visible ?? []).length !== changed.length)
            throw new BusinessError('Tu ne peux modifier que les repos des chatters de ton équipe')
        }
      }

      // Écriture directe de la cellule telle que soumise (plus de MERGE de scope).
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
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireAdminProfile()

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
    // Admin, ou manager/sous-manager ayant la page `repos` (0060 — chatteur en lecture
    // seule) : les managers/sous-managers gèrent la case « envoyé Telegram ».
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireWriteProfile('repos')

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
