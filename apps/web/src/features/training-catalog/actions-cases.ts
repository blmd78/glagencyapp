'use server'

// Server Actions des CAS du Catalogue — split de actions.ts (> 300 lignes) ; mêmes gardes :
// requireCatalogAdmin en tête de handler, BusinessError, revalidation en finally.

import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { slugify, uniqueSlug } from '@/lib/slug'
import { caseForm, idInput, moveInput, toggleInput } from './schema'
import { requireCatalogAdmin, revalidateCatalog, stampBy } from './actions-shared'
import { assertArenaRefs, insertChildren } from './actions-cases-helpers'

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
