'use server'

// Server Actions du Catalogue de formation — ADMIN uniquement (contrôle en tête de handler,
// patron §4 des guidelines : `requireAdminProfile()` UNE fois, refus = BusinessError, jamais de
// redirect). Client SESSION (`createClient`) : la RLS `*_admin_write` (0113) reste le rempart.
// Pas de suppression de module ni de cas : on DÉSACTIVE. Refus en impersonation, comme Membres.
// Actions des CAS : voir actions-cases.ts (split, > 300 lignes) — helpers partagés (garde admin,
// stamp, revalidation) dans actions-shared.ts.

import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { slugify, uniqueSlug } from '@/lib/slug'
import { moduleForm, moveInput, toggleInput, type ModuleInput } from './schema'
import { requireCatalogAdmin, revalidateCatalog, stampBy, type Db } from './actions-shared'

// ======================= MODULES =======================

/**
 * Crée (id null) ou modifie un module ET ses axes / sections (diff par id : ajout, modif,
 * suppression — axes : suppressions d'abord puis clés en deux passes (cf. syncAxes) ; sections :
 * ajouts/modifs puis suppressions). Retourne le `code` (le dialog navigue dessus après création).
 */
export async function saveModule(raw: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction({
    schema: moduleForm,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const row = {
        title: d.title,
        emoji: d.emoji,
        description: d.description,
        objective_label: d.objectiveLabel,
        course_md: d.courseMd,
        ...stampBy(admin.id),
      }
      let moduleId: string
      let code: string
      // Pas de transaction côté supabase-js : une écriture partielle reste possible si un
      // appel échoue à mi-chemin. Le `finally` garantit au moins qu'elle soit VISIBLE (cache
      // invalidé), plutôt que masquée par une page pré-édition encore servie depuis le cache.
      try {
        if (d.id) {
          const { data: cur, error } = await supabase.from('training_modules').select('id, code').eq('id', d.id).maybeSingle()
          if (error) throw new Error(error.message)
          if (!cur) throw new BusinessError('Module introuvable')
          const { error: uErr } = await supabase.from('training_modules').update(row).eq('id', d.id)
          if (uErr) throw new Error(uErr.message)
          moduleId = cur.id
          code = cur.code
        } else {
          const { data: existing, error: cErr } = await supabase
            .from('training_modules')
            .select('code, position')
            .order('position', { ascending: false })
          if (cErr) throw new Error(cErr.message)
          code = uniqueSlug(slugify(d.title), new Set((existing ?? []).map((m) => m.code)))
          const position = (existing?.[0]?.position ?? -10) + 10
          const { data: created, error: iErr } = await supabase
            .from('training_modules')
            .insert({ ...row, code, position })
            .select('id')
            .single()
          if (iErr) throw new Error(iErr.message)
          moduleId = created.id
        }
        // Secrets (table admin, RLS `*_admin`) : le client session d'un admin passe.
        const { error: sErr } = await supabase
          .from('training_module_secrets')
          .upsert({ module_id: moduleId, scoring_notes: d.scoringNotes }, { onConflict: 'module_id' })
        if (sErr) throw new Error(sErr.message)
        await syncAxes(supabase, moduleId, d.axes)
        await syncSections(supabase, moduleId, d.sections)
      } finally {
        revalidateCatalog()
      }
      return { code }
    },
  })
}

/**
 * Axes : diff par id, en 3 temps pour ne jamais heurter `unique (module_id, key)` sur une
 * édition légitime — (1) suppressions D'ABORD (une clé libérée peut être reprise juste après :
 * ex. supprimer l'axe B « k2 » et renommer A en « k2 » dans le même save), (2) deux passes
 * d'update pour les axes conservés (clé temporaire puis clé finale : échanger les clés de deux
 * axes existants collisionnerait sur l'état intermédiaire en une seule passe), (3) inserts des
 * nouveaux axes. Le refus « Deux axes ont la même clé » ne peut donc plus se déclencher que sur
 * une VRAIE collision (ex. édition concurrente) — le `refine` Zod garantit déjà l'absence de
 * doublon dans le payload lui-même.
 */
async function syncAxes(supabase: Db, moduleId: string, axes: ModuleInput['axes']) {
  const { data: current, error } = await supabase.from('training_module_axes').select('id').eq('module_id', moduleId)
  if (error) throw new Error(error.message)
  const keep = new Set(axes.map((a) => a.existingId).filter((id): id is string => !!id))
  const dup = (e: { code?: string; message: string }) =>
    e.code === '23505' ? new BusinessError('Deux axes ont la même clé', { axes: ['Clé déjà utilisée'] }) : new Error(e.message)

  const toDelete = (current ?? []).map((a) => a.id).filter((id) => !keep.has(id))
  if (toDelete.length) {
    const { error: e } = await supabase.from('training_module_axes').delete().in('id', toDelete)
    if (e) throw new Error(e.message)
  }
  // Passe A : clé temporaire — ne peut collisionner qu'avec un axe littéralement nommé
  // `zz_tmp_N` (clé valide au format mais improbable en usage réel) ; accepté.
  for (const [i, a] of axes.entries()) {
    if (!a.existingId) continue
    const { error: e } = await supabase.from('training_module_axes').update({ key: `zz_tmp_${i}` }).eq('id', a.existingId).eq('module_id', moduleId)
    if (e) throw new Error(e.message)
  }
  // Passe B : clé définitive + reste des champs — seule cette passe (et les inserts) peut
  // encore heurter l'unique (module_id, key), sur une vraie collision.
  for (const [i, a] of axes.entries()) {
    if (!a.existingId) continue
    const { error: e } = await supabase
      .from('training_module_axes')
      .update({ key: a.key, name: a.name, description: a.description, position: i * 10 })
      .eq('id', a.existingId)
      .eq('module_id', moduleId)
    if (e) throw dup(e)
  }
  for (const [i, a] of axes.entries()) {
    if (a.existingId) continue
    const { error: e } = await supabase
      .from('training_module_axes')
      .insert({ module_id: moduleId, key: a.key, name: a.name, description: a.description, position: i * 10 })
    if (e) throw dup(e)
  }
}

/** Sections : diff par id ; une nouvelle section reçoit un code slug unique dans le module.
 *  Supprimer une section remet `section_id` des cas à null (FK on delete set null). */
async function syncSections(supabase: Db, moduleId: string, sections: ModuleInput['sections']) {
  const { data: current, error } = await supabase.from('training_module_sections').select('id, code').eq('module_id', moduleId)
  if (error) throw new Error(error.message)
  const keep = new Set(sections.map((s) => s.existingId).filter((id): id is string => !!id))
  const taken = new Set((current ?? []).map((s) => s.code))
  for (const [i, s] of sections.entries()) {
    const values = { module_id: moduleId, title: s.title, emoji: s.emoji, description: s.description, position: i * 10 }
    if (s.existingId) {
      const { error: e } = await supabase.from('training_module_sections').update(values).eq('id', s.existingId).eq('module_id', moduleId)
      if (e) throw new Error(e.message)
    } else {
      const code = uniqueSlug(slugify(s.title), taken)
      taken.add(code)
      const { error: e } = await supabase.from('training_module_sections').insert({ ...values, code })
      if (e) throw new Error(e.message)
    }
  }
  const toDelete = (current ?? []).map((s) => s.id).filter((id) => !keep.has(id))
  if (toDelete.length) {
    const { error: e } = await supabase.from('training_module_sections').delete().in('id', toDelete)
    if (e) throw new Error(e.message)
  }
}

/** Active / désactive un module (un module inactif cache ses cas dans Modules). */
export async function toggleModule(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: toggleInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, active }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('training_modules')
        .update({ active, ...stampBy(admin.id) })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Module introuvable')
      revalidateCatalog()
    },
  })
}

/** Déplace un module d'un cran (échange les positions avec son voisin) — patron scripts. */
export async function moveModule(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, direction }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_modules').select('id, position').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Module introuvable')
      const { data: neighbor, error: nErr } = await supabase
        .from('training_modules')
        .select('id, position')
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (nErr) throw new Error(nErr.message)
      if (!neighbor) throw new BusinessError('Déjà en bout de liste')
      // Échange des positions (2 updates — un échec au milieu laisse au pire un doublon de
      // position, corrigé au prochain déplacement). Inline plutôt qu'un helper générique :
      // `supabase.from(<union de tables>)` n'est pas appelable en TS.
      try {
        const { error: e1 } = await supabase.from('training_modules').update({ position: neighbor.position, ...stampBy(admin.id) }).eq('id', cur.id)
        if (e1) throw new Error(e1.message)
        const { error: e2 } = await supabase.from('training_modules').update({ position: cur.position, ...stampBy(admin.id) }).eq('id', neighbor.id)
        if (e2) throw new Error(e2.message)
      } finally {
        revalidateCatalog()
      }
    },
  })
}
