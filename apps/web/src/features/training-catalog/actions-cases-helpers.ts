// Helpers de saveCase (actions-cases.ts) — module SANS 'use server' : jamais appelés depuis le
// client, seulement par le handler de saveCase.

import { BusinessError } from '@/lib/actions'
import { slugify, uniqueSlug } from '@/lib/slug'
import type { CaseInput } from './schema'
import type { Db } from './actions-shared'

/** Chaque créneau d'un défi doit rejouer un cas SOLO du même module. */
export async function assertArenaRefs(supabase: Db, moduleId: string, refs: string[]) {
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

export async function insertChildren(supabase: Db, caseId: string, d: CaseInput) {
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
      }
    })
    const { data: created, error } = await supabase.from('training_case_boss_fans').insert(rows).select('id, code')
    if (error) throw new Error(error.message)
    // Secrets (table admin) : associés au fan créé par `code` — unique dans ce cas (uniqueSlug ci-dessus).
    const bySlug = new Map(d.fans.map((f, i) => [rows[i].code, f]))
    const secrets = (created ?? []).map((row) => {
      const f = bySlug.get(row.code)!
      return { fan_id: row.id, budget_cap: f.budgetCap, nego_threshold: f.negoThreshold, nego_where: f.negoWhere, meet_when: f.meetWhen, meet_where: f.meetWhere, derails: f.derails }
    })
    const { error: sErr } = await supabase.from('training_boss_fan_secrets').insert(secrets)
    if (sErr) throw new Error(sErr.message)
  }
}
