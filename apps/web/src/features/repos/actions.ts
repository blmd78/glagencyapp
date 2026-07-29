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
    // Cases CHATTEURS (colonnes modèles) : admin OU manager/sous-manager porteur de la page.
    // Cases ENCADREMENT (managers/policiers) : admin uniquement. L'ÉCRITURE passe par le RPC
    // `save_repos_cell` (0090, SECURITY DEFINER) qui porte TOUT le contrôle en SQL — droit
    // (can_write_page), colonne, et périmètre : les ids ajoutés/retirés doivent appartenir au
    // sous-arbre de l'appelant (managed_subtree, 0087), delta calculé sous verrou FOR UPDATE.
    // Les policies d'écriture directes de rest_planning_cells restent admin-only (0076) : un
    // non-admin ne PEUT écrire que via ce RPC. La garde app ci-dessous n'est qu'un miroir
    // (message propre sans aller-retour) ; l'enforcement réel est en base.
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireWriteProfile('repos')
      const { weekStart, day, col, chatterIds, names } = values
      if ((col === 'managers' || col === 'policiers') && profile.role !== 'admin')
        throw new BusinessError('Accès refusé')

      const supabase = await createClient()
      const { error } = await supabase.rpc('save_repos_cell', {
        p_week_start: weekStart,
        p_day: day,
        p_col: col,
        p_chatter_ids: chatterIds,
        p_names: names.trim(),
      })
      if (error) {
        // Sentinelles métier du RPC → messages utilisateur ; le reste = erreur technique
        // (throw : runAction capture Sentry + message générique).
        if (error.message.includes('repos_hors_equipe'))
          throw new BusinessError('Tu ne peux modifier que les repos des chatters de ton équipe')
        if (error.message.includes('repos_colonne_encadrement') || error.message.includes('repos_acces_refuse'))
          throw new BusinessError('Accès refusé')
        throw new Error(error.message)
      }
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
