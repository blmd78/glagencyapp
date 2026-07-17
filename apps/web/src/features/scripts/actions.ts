'use server'

// Server Actions des scripts de chat — écriture ADMIN uniquement (garde en retour
// d'erreur, pas de redirect), lecture cloisonnée par le RLS (migration 0040).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, adminGuard, type ActionResult } from '@/lib/actions'
import { itemInput } from './schema'

/** Crée (id null → en fin de script) ou modifie un item du script d'un modèle. */
export async function saveScriptItem(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: itemInput,
    input: raw,
    guard: async () => {
      const admin = await adminGuard()
      if (!admin.ok) return admin
      // Parse défensif de `raw` (capturé par fermeture) : si invalide, laissé au safeParse
      // de runAction — pas de duplication de message (pattern insights/actions.ts).
      const parsed = itemInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const d = parsed.data
      // Édition : un id d'item d'un AUTRE modèle (creatorId incohérent) est un cas métier
      // atteignable en usage normal (item réassigné entre-temps) → message précis ici.
      if (d.id) {
        const supabase = await createClient()
        const { data } = await supabase
          .from('script_items')
          .select('id')
          .eq('id', d.id)
          .eq('creator_id', d.creatorId)
          .maybeSingle()
        if (!data) return { ok: false, error: 'Item introuvable' }
      }
      return { ok: true }
    },
    handler: async (d) => {
      // Mémoïsé par requête (cache(), lib/auth) — pas de round-trip DB supplémentaire par
      // rapport à l'appel déjà fait dans la garde.
      const admin = await getProfile()
      if (!admin) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const supabase = await createClient()

      const row = {
        kind: d.kind,
        label: d.label,
        body: d.body,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      }
      if (d.id) {
        // .eq creator_id : un couple (creatorId, id d'item d'un AUTRE modèle) incohérent ne
        // re-parente/écrase rien. Le cas métier courant est déjà rejeté par le guard — un
        // 0-row ICI n'est qu'une race ultra-serrée résiduelle → throw (technique, générique).
        const { data, error } = await supabase
          .from('script_items')
          .update(row)
          .eq('id', d.id)
          .eq('creator_id', d.creatorId)
          .select('id')
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('Item introuvable')
      } else {
        const { data: last } = await supabase
          .from('script_items')
          .select('position')
          .eq('creator_id', d.creatorId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
        const { error } = await supabase
          .from('script_items')
          .insert({ ...row, creator_id: d.creatorId, position: (last?.position ?? 0) + 10 })
        if (error) throw new Error(error.message)
      }
      revalidatePath('/chatter/scripts')
    },
  })
}

/** Supprime un item du script. */
export async function deleteScriptItem(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: adminGuard,
    handler: async (id) => {
      const supabase = await createClient()
      const { error } = await supabase.from('script_items').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/scripts')
    },
  })
}

// Zod non partagé côté client (appelé directement, pas via un form RHF) → reste inline
// (cf. docs/guidelines-standard-feature.md §5, même choix que features/quotas/actions.ts).
const moveInput = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })

/** Déplace un item d'un cran (échange les positions avec son voisin). */
export async function moveScriptItem(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveInput,
    input: raw,
    guard: async () => {
      const admin = await adminGuard()
      if (!admin.ok) return admin
      const parsed = moveInput.safeParse(raw)
      if (!parsed.success) return { ok: true }
      const { id, direction } = parsed.data
      const supabase = await createClient()

      const { data: cur } = await supabase
        .from('script_items')
        .select('id, creator_id, position')
        .eq('id', id)
        .maybeSingle()
      if (!cur) return { ok: false, error: 'Item introuvable' }

      // Voisin immédiat dans le sens demandé (positions espacées mais pas forcément régulières).
      const { data: neighbor } = await supabase
        .from('script_items')
        .select('id')
        .eq('creator_id', cur.creator_id)
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (!neighbor) return { ok: false, error: 'Déjà en bout de script' }
      return { ok: true }
    },
    handler: async ({ id, direction }) => {
      const admin = await getProfile()
      if (!admin) throw new Error('Session expirée') // impossible si le guard a laissé passer
      const supabase = await createClient()

      // Relu (le guard a déjà validé l'existence — un échec ici n'est qu'une race
      // ultra-serrée résiduelle → throw générique, même raisonnement que saveScriptItem).
      const { data: cur } = await supabase
        .from('script_items')
        .select('id, creator_id, position')
        .eq('id', id)
        .maybeSingle()
      if (!cur) throw new Error('Item introuvable')

      const { data: neighbor } = await supabase
        .from('script_items')
        .select('id, position')
        .eq('creator_id', cur.creator_id)
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (!neighbor) throw new Error('Déjà en bout de script')

      // Échange des positions (2 updates — un échec au milieu laisse au pire un doublon de
      // position sans perte de données, corrigé au prochain déplacement).
      const { error: e1 } = await supabase
        .from('script_items')
        .update({
          position: neighbor.position,
          updated_at: new Date().toISOString(),
          updated_by: admin.id,
        })
        .eq('id', cur.id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase
        .from('script_items')
        .update({ position: cur.position, updated_at: new Date().toISOString(), updated_by: admin.id })
        .eq('id', neighbor.id)
      if (e2) throw new Error(e2.message)

      revalidatePath('/chatter/scripts')
    },
  })
}
