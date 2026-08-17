'use server'

// Server Actions du Catalogue de formation — ADMIN uniquement (contrôle en tête de handler,
// patron §4 des guidelines : `requireAdminProfile()` UNE fois, refus = BusinessError, jamais de
// redirect). Client SESSION (`createClient`) : la RLS `*_admin_write` (0113) reste le rempart.
// Pas de suppression de module ni de cas : on DÉSACTIVE. Refus en impersonation, comme Membres.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requireAdminProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { slugify, uniqueSlug } from '@/lib/slug'
import { caseForm, idInput, moduleForm, moveInput, toggleInput, type CaseInput, type ModuleInput } from './schema'

type Db = Awaited<ReturnType<typeof createClient>>

const revalidateCatalog = () => {
  revalidatePath('/formation/catalogue')
  // Les pages Modules (liste + [code]) lisent les mêmes tables : 'layout' couvre tout le segment.
  revalidatePath('/formation/modules', 'layout')
}

/** Admin + pas en « en tant que » — une seule requête profil. */
async function requireCatalogAdmin() {
  const admin = await requireAdminProfile()
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  return admin
}

const stampBy = (adminId: string) => ({ updated_at: new Date().toISOString(), updated_by: adminId })

// ======================= MODULES =======================

/**
 * Crée (id null) ou modifie un module ET ses axes / sections (diff par id : ajout, modif,
 * suppression — ajouts/modifs d'abord, suppressions ensuite). Retourne le `code` (le dialog
 * navigue dessus après création).
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
        scoring_notes: d.scoringNotes,
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

// ======================= CAS =======================

/**
 * Crée (id null) ou modifie un cas. Vérifs métier UNE fois : module existant, section du même
 * module, créneaux de défi = solos du même module, sorte immuable. En édition, les enfants
 * (messages / créneaux / fans) sont REMPLACÉS en bloc — rien ne les référence encore (les
 * sessions futures stockeront un instantané du cas joué).
 */
export async function saveCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: caseForm,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: mod, error: mErr } = await supabase.from('training_modules').select('id').eq('id', d.moduleId).maybeSingle()
      if (mErr) throw new Error(mErr.message)
      if (!mod) throw new BusinessError('Module introuvable')
      if (d.sectionId) {
        const { data: sec, error: sErr } = await supabase
          .from('training_module_sections')
          .select('id')
          .eq('id', d.sectionId)
          .eq('module_id', d.moduleId)
          .maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (!sec) throw new BusinessError('Cette section n’appartient pas au module', { sectionId: ['Section inconnue pour ce module'] })
      }
      if (d.kind === 'arena') await assertArenaRefs(supabase, d.moduleId, d.slots.map((s) => s.refCaseId))

      const solo = d.kind === 'solo'
      // `module_id` n'est PAS dans `row` : immuable en édition (vérifié ci-dessous, symétrique
      // à `kind`), passé explicitement à la création seulement.
      const row = {
        section_id: d.sectionId,
        title: d.title,
        phase: d.phase,
        difficulty: d.difficulty,
        max_turns: d.maxTurns,
        reaction_max_s: solo ? null : d.reactionMaxS,
        is_sale: d.isSale,
        context: d.context,
        objective: d.objective,
        target_line: d.targetLine,
        fan_name: solo ? d.fanName : null,
        fan_brief: solo ? d.fanBrief : null,
        expected: solo ? d.expected : null,
        ...stampBy(admin.id),
      }
      let caseId: string
      try {
        if (d.id) {
          const { data: cur, error } = await supabase.from('training_cases').select('id, kind, module_id').eq('id', d.id).maybeSingle()
          if (error) throw new Error(error.message)
          if (!cur) throw new BusinessError('Cas introuvable')
          if (cur.kind !== d.kind) throw new BusinessError('La sorte d’un cas ne se change pas — crée un nouveau cas')
          if (cur.module_id !== d.moduleId) throw new BusinessError('Un cas ne change pas de module — duplique-le dans l’autre module')
          const { error: uErr } = await supabase.from('training_cases').update(row).eq('id', d.id)
          if (uErr) throw new Error(uErr.message)
          caseId = cur.id
          for (const table of ['training_case_messages', 'training_case_arena_slots', 'training_case_boss_fans'] as const) {
            const { error: dErr } = await supabase.from(table).delete().eq('case_id', caseId)
            if (dErr) throw new Error(dErr.message)
          }
        } else {
          const [{ data: last, error: pErr }, { data: codes, error: kErr }] = await Promise.all([
            supabase.from('training_cases').select('position').eq('module_id', d.moduleId).order('position', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('training_cases').select('code'),
          ])
          if (pErr) throw new Error(pErr.message)
          if (kErr) throw new Error(kErr.message)
          const code = uniqueSlug(slugify(d.title), new Set((codes ?? []).map((c) => c.code)))
          const { data: created, error: iErr } = await supabase
            .from('training_cases')
            .insert({ ...row, module_id: d.moduleId, kind: d.kind, code, position: (last?.position ?? -10) + 10 })
            .select('id')
            .single()
          if (iErr) throw new Error(iErr.message)
          caseId = created.id
        }
        await insertChildren(supabase, caseId, d)
      } finally {
        revalidateCatalog()
      }
    },
  })
}

/** Chaque créneau d'un défi doit rejouer un cas SOLO du même module. */
async function assertArenaRefs(supabase: Db, moduleId: string, refs: string[]) {
  const ids = [...new Set(refs)]
  const { data, error } = await supabase.from('training_cases').select('id').in('id', ids).eq('module_id', moduleId).eq('kind', 'solo')
  if (error) throw new Error(error.message)
  const ok = new Set((data ?? []).map((c) => c.id))
  if (ids.some((id) => !ok.has(id))) {
    throw new BusinessError('Chaque conversation du défi doit rejouer un cas solo de ce module', {
      slots: ['Un cas choisi n’est pas un solo de ce module'],
    })
  }
}

async function insertChildren(supabase: Db, caseId: string, d: CaseInput) {
  if (d.kind === 'solo' && d.messages.length) {
    const { error } = await supabase
      .from('training_case_messages')
      .insert(d.messages.map((m, i) => ({ case_id: caseId, position: i * 10, speaker: m.speaker, body: m.body })))
    if (error) throw new Error(error.message)
  }
  if (d.kind === 'arena') {
    const { error } = await supabase
      .from('training_case_arena_slots')
      .insert(d.slots.map((s, i) => ({ case_id: caseId, position: i * 10, ref_case_id: s.refCaseId, display_name: s.displayName })))
    if (error) throw new Error(error.message)
  }
  if (d.kind === 'boss') {
    const taken = new Set<string>()
    const rows = d.fans.map((f, i) => {
      // code ≤ 30 (check SQL) : base 26 + suffixe éventuel.
      const code = uniqueSlug(slugify(f.name, 26), taken)
      taken.add(code)
      return {
        case_id: caseId,
        position: i * 10,
        code,
        name: f.name,
        age: f.age,
        job: f.job,
        city: f.city,
        color: f.color,
        persona: f.persona,
        opening_message: f.openingMessage,
        budget_cap: f.budgetCap,
        nego_threshold: f.negoThreshold,
        nego_where: f.negoWhere,
        meet_when: f.meetWhen,
        meet_where: f.meetWhere,
        derails: f.derails,
      }
    })
    const { error } = await supabase.from('training_case_boss_fans').insert(rows)
    if (error) throw new Error(error.message)
  }
}

/** Active / désactive un cas. Un SOLO joué dans un défi ne se désactive pas tant que le créneau existe. */
export async function toggleCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: toggleInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, active }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_cases').select('id, kind').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Cas introuvable')
      if (!active && cur.kind === 'solo') {
        const { data: slot, error: sErr } = await supabase
          .from('training_case_arena_slots')
          .select('case_id')
          .eq('ref_case_id', id)
          .limit(1)
          .maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (slot) {
          const { data: arena, error: aErr } = await supabase.from('training_cases').select('title').eq('id', slot.case_id).maybeSingle()
          if (aErr) throw new Error(aErr.message)
          throw new BusinessError(`Ce cas est joué dans le défi « ${arena?.title ?? '?'} » — retire-le d’abord`)
        }
      }
      const { error: tErr } = await supabase.from('training_cases').update({ active, ...stampBy(admin.id) }).eq('id', id)
      if (tErr) throw new Error(tErr.message)
      revalidateCatalog()
    },
  })
}

/** Déplace un cas d'un cran dans SON module. */
export async function moveCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, direction }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_cases').select('id, module_id, position').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Cas introuvable')
      const { data: neighbor, error: nErr } = await supabase
        .from('training_cases')
        .select('id, position')
        .eq('module_id', cur.module_id)
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (nErr) throw new Error(nErr.message)
      if (!neighbor) throw new BusinessError('Déjà en bout de liste')
      try {
        const { error: e1 } = await supabase.from('training_cases').update({ position: neighbor.position, ...stampBy(admin.id) }).eq('id', cur.id)
        if (e1) throw new Error(e1.message)
        const { error: e2 } = await supabase.from('training_cases').update({ position: cur.position, ...stampBy(admin.id) }).eq('id', neighbor.id)
        if (e2) throw new Error(e2.message)
      } finally {
        revalidateCatalog()
      }
    },
  })
}

/** Duplique un cas (« Copie de … », INACTIF, en fin de module) avec ses messages / créneaux / fans. */
export async function duplicateCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: idInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: src, error } = await supabase
        .from('training_cases')
        // `!case_id` : deux FK de arena_slots vers training_cases → indice obligatoire (PGRST201).
        .select('*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!src) throw new BusinessError('Cas introuvable')
      const [{ data: last, error: pErr }, { data: codes, error: kErr }] = await Promise.all([
        supabase.from('training_cases').select('position').eq('module_id', src.module_id).order('position', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('training_cases').select('code'),
      ])
      if (pErr) throw new Error(pErr.message)
      if (kErr) throw new Error(kErr.message)
      const title = `Copie de ${src.title}`.slice(0, 80)
      const code = uniqueSlug(slugify(title), new Set((codes ?? []).map((c) => c.code)))
      try {
        const { data: created, error: iErr } = await supabase
          .from('training_cases')
          .insert({
            module_id: src.module_id,
            section_id: src.section_id,
            code,
            kind: src.kind,
            title,
            phase: src.phase,
            difficulty: src.difficulty,
            max_turns: src.max_turns,
            reaction_max_s: src.reaction_max_s,
            is_sale: src.is_sale,
            context: src.context,
            objective: src.objective,
            target_line: src.target_line,
            fan_name: src.fan_name,
            fan_brief: src.fan_brief,
            expected: src.expected,
            position: (last?.position ?? -10) + 10,
            active: false,
            ...stampBy(admin.id),
          })
          .select('id')
          .single()
        if (iErr) throw new Error(iErr.message)
        const caseId = created.id
        if (src.training_case_messages.length) {
          const { error: e } = await supabase.from('training_case_messages').insert(
            src.training_case_messages.map((m) => ({ case_id: caseId, position: m.position, speaker: m.speaker, body: m.body })),
          )
          if (e) throw new Error(e.message)
        }
        if (src.training_case_arena_slots.length) {
          const { error: e } = await supabase.from('training_case_arena_slots').insert(
            src.training_case_arena_slots.map((s) => ({ case_id: caseId, position: s.position, ref_case_id: s.ref_case_id, display_name: s.display_name })),
          )
          if (e) throw new Error(e.message)
        }
        if (src.training_case_boss_fans.length) {
          const { error: e } = await supabase.from('training_case_boss_fans').insert(
            src.training_case_boss_fans.map((f) => ({
              case_id: caseId,
              position: f.position,
              code: f.code,
              name: f.name,
              age: f.age,
              job: f.job,
              city: f.city,
              color: f.color,
              persona: f.persona,
              opening_message: f.opening_message,
              budget_cap: f.budget_cap,
              nego_threshold: f.nego_threshold,
              nego_where: f.nego_where,
              meet_when: f.meet_when,
              meet_where: f.meet_where,
              derails: f.derails,
            })),
          )
          if (e) throw new Error(e.message)
        }
      } finally {
        revalidateCatalog()
      }
    },
  })
}
