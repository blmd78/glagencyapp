'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0016 : has_page('repos') en lecture ET écriture).
// Zod ci-dessous non partagé côté client (la grille n'est pas un form RHF, juste des
// ComboboxMultiple/Checkbox contrôlés qui sauvegardent à chaque clic) → reste inline
// (cf. docs/guidelines-standard-feature.md §5, même décision que quotas/actions.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MODEL_COL_KEYS, encadrementRight, isEncadrementCol } from './types'
import {
  BusinessError,
  runAction,
  noGuard,
  requireAdminProfile,
  requirePageProfile,
  requireWriteProfile,
  DENY_WRITE,
  type ActionResult,
} from '@/lib/actions'
import { hasWriteAccess } from '@/lib/auth'

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
    // Cases CHATTEURS (colonnes modèles) : admin OU manager/sous-manager porteur de la page,
    // pour N'IMPORTE quel chatteur (0095 : plus d'assignation). Cases ENCADREMENT : règle
    // hiérarchique par colonne (0103, `encadrementRight`) — c'est la seule écriture ouverte au
    // POLICIER, qui n'est ni admin ni `profile.manager` et échouerait donc sur
    // `requireWriteProfile`. L'ÉCRITURE passe par le RPC `save_repos_cell` (0090, réécrit en
    // 0095/0103, SECURITY DEFINER) — droits et colonnes contrôlés en SQL ; les policies
    // d'écriture directes de rest_planning_cells restent admin-only (0076) : un non-admin ne PEUT
    // écrire que via ce RPC. Les gardes ci-dessous ne sont qu'un miroir (message propre sans
    // aller-retour) ; l'enforcement réel est en base.
    guard: noGuard,
    handler: async (values) => {
      const { weekStart, day, col, chatterIds, names } = values
      // Socle commun : avoir la page. Le droit d'ÉCRIRE se décide ensuite, PAR COLONNE.
      const profile = await requirePageProfile('repos')
      const autorise = isEncadrementCol(col)
        ? profile.role === 'admin' || encadrementRight(profile.baseRole, col) !== 'non'
        : hasWriteAccess(profile, 'repos')
      if (!autorise) throw new BusinessError(DENY_WRITE)

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
          throw new BusinessError(DENY_WRITE)
        throw new Error(error.message)
      }
      revalidatePath('/chatter/repos')
    },
  })
}

// Édition de la compo (MODÈLES) d'une colonne — réservée admin (garde back + policy RLS is_admin).
const colMembersInput = z.object({
  col: z.enum(MODEL_COL_KEYS), // colonnes modèles uniquement (g1..g30, miroir SQL 0105)
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

const copyInput = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

/**
 * Copie le setup de la semaine PRÉCÉDENTE vers `weekStart` — RPC `copy_repos_week` (0093) :
 * admin uniquement, refuse si la semaine cible a déjà du contenu (jamais d'écrasement).
 * Retourne le nombre de cases copiées (0 = semaine précédente vide).
 */
export async function copyReposWeek(raw: unknown): Promise<ActionResult<number>> {
  return runAction({
    schema: copyInput,
    input: raw,
    guard: noGuard,
    handler: async ({ weekStart }) => {
      await requireAdminProfile()
      const supabase = await createClient()
      const { data, error } = await supabase.rpc('copy_repos_week', { p_to: weekStart })
      if (error) {
        if (error.message.includes('repos_semaine_non_vide'))
          throw new BusinessError('Cette semaine contient déjà des repos — rien n’a été écrasé')
        if (error.message.includes('repos_acces_refuse')) throw new BusinessError(DENY_WRITE)
        throw new Error(error.message)
      }
      revalidatePath('/chatter/repos')
      return data ?? 0
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
