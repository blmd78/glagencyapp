'use server'

// Server Actions du planning des repos — supabase-js + RLS (page `repos` requise,
// cf. migration 0016 : has_page('repos') en lecture ET écriture).
// Zod ci-dessous non partagé côté client (la grille n'est pas un form RHF, juste des
// ComboboxMultiple/Checkbox contrôlés qui sauvegardent à chaque clic) → reste inline
// (cf. docs/guidelines-standard-feature.md §5, même décision que quotas/actions.ts).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { getChatterScope } from '@/lib/scope'
import { runAction, type ActionResult } from '@/lib/actions'

/** Garde d'action : admin, ou page `repos` accordée (les sous-managers gèrent le planning). */
async function requireRepos() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('repos')) return null
  return profile
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
    guard: async () => {
      const profile = await requireRepos()
      if (!profile) return { ok: false, error: 'Accès refusé' }
      // Vérif de périmètre AVANT le handler (guard capture `raw`, safeParse défensif —
      // pattern insights/actions.ts `setInsightState`) : un non-admin ne peut pas soumettre
      // un chatteur hors de ses modèles assignés.
      const parsed = cellInput.safeParse(raw)
      if (!parsed.success) return { ok: true } // saisie invalide : laissé au safeParse de runAction
      const scope = await getChatterScope(profile)
      if (scope.chatterIds !== null && parsed.data.chatterIds.some((id) => !scope.chatterIds!.has(id)))
        return { ok: false, error: 'Accès refusé (chatteur hors de votre périmètre)' }
      return { ok: true }
    },
    handler: async (values) => {
      // Mémoïsé par requête (`cache()`, lib/auth) — pas de round-trip DB supplémentaire par
      // rapport à l'appel déjà fait dans la garde.
      const profile = await requireRepos()
      if (!profile) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const { weekStart, day, col } = values
      let { chatterIds, names } = values

      const supabase = await createClient()

      // Non-admin : sa vue est cloisonnée à ses chatteurs (cf. get-repos) → MERGE non destructif.
      // Le guard a déjà rejeté tout id hors scope soumis ; ici on préserve les ids hors scope
      // existants et le texte legacy (invisible pour lui) — sinon il écraserait des repos qu'il
      // ne voit pas.
      const scope = await getChatterScope(profile)
      if (scope.chatterIds !== null) {
        const { data: existing, error: existingErr } = await supabase
          .from('rest_planning_cells')
          .select('chatter_ids, names')
          .eq('week_start', weekStart)
          .eq('day', day)
          .eq('col', col)
          .maybeSingle()
        if (existingErr) throw new Error(existingErr.message)
        const hidden = (existing?.chatter_ids ?? []).filter((id) => !scope.chatterIds!.has(id))
        chatterIds = [...hidden, ...chatterIds]
        names = existing?.names ?? ''
      }

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
    guard: async () => {
      const profile = await getProfile()
      return profile?.role === 'admin' ? { ok: true } : { ok: false, error: 'Accès refusé' }
    },
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
