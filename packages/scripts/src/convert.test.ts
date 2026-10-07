import { describe, expect, it } from 'vitest'
import { normalizeDraft, parseScriptDraft, validateScriptDraft } from '@glagency/core'
import { CONVERT_EXAMPLE, CONVERT_MODEL, CONVERT_SYSTEM, SCRIPT_DRAFT_SCHEMA, convertToDraft, type ConvertClient } from './convert'

const DRAFT = {
  name: 'Soirée révisions',
  description: 'Vente',
  isSequence: false,
  items: [{ type: 'message', title: '#1 — Transition', content: 'et du coup…', price: 0, media: [], pendingMedia: null, chainDelays: [] }],
}
type Captured = Record<string, unknown>
function fakeClient(message: Record<string, unknown>, captured: Captured[] = []): ConvertClient {
  return {
    beta: {
      messages: {
        stream: (params: Captured) => {
          captured.push(params)
          return { finalMessage: async () => message }
        },
      },
    },
  } as unknown as ConvertClient
}
const ok = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  stop_details: null,
  content: [{ type: 'text', text }],
  usage: { input_tokens: 9000, output_tokens: 7000 },
})

/** Tout objet du schéma : additionalProperties false + toutes ses propriétés requises (structured outputs). */
function objects(s: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(s)) s.forEach((x) => objects(x, out))
  else if (s && typeof s === 'object') {
    const o = s as Record<string, unknown>
    if (o.type === 'object') out.push(o)
    Object.values(o).forEach((v) => objects(v, out))
  }
  return out
}

describe('SCRIPT_DRAFT_SCHEMA', () => {
  it('chaque objet est fermé et entièrement requis', () => {
    const all = objects(SCRIPT_DRAFT_SCHEMA)
    expect(all.length).toBeGreaterThanOrEqual(5)
    for (const o of all) {
      expect(o.additionalProperties).toBe(false)
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort())
    }
  })
  it('pas de contrainte numérique ni de longueur (non supportées : vérifiées par validateScriptDraft)', () => {
    expect(JSON.stringify(SCRIPT_DRAFT_SCHEMA)).not.toMatch(/"(minimum|maximum|minLength|maxLength|minItems|maxItems)"/)
  })
})

describe('CONVERT_SYSTEM', () => {
  it('mode Séquence par défaut, Banque seulement pour une bibliothèque sans ordre', () => {
    expect(CONVERT_SYSTEM).toContain('isSequence = true pour un déroulé (KYC, vente')
    expect(CONVERT_SYSTEM).toContain('isSequence = false seulement pour une bibliothèque de messages sans ordre')
    expect(CONVERT_SYSTEM).not.toContain('isSequence = false.')
  })
  it('suit les conventions des scripts montés à la main dans MyPuls (relevé du 2026-10-07)', () => {
    expect(CONVERT_SYSTEM).toContain('« ⏩ À la suite »')
    expect(CONVERT_SYSTEM).toContain('« ⏩ » suivi du libellé du chemin')
    expect(CONVERT_SYSTEM).toContain('content = "."')
    expect(CONVERT_SYSTEM).not.toContain('« #N — Suite »')
  })
})

describe('CONVERT_EXAMPLE', () => {
  it('est un brouillon valide, sans ajustement, aux conventions MyPuls, et figure dans le prompt', () => {
    expect(parseScriptDraft(JSON.parse(JSON.stringify(CONVERT_EXAMPLE)))).toEqual(CONVERT_EXAMPLE)
    expect(normalizeDraft(CONVERT_EXAMPLE).notes).toEqual([])
    expect(validateScriptDraft(CONVERT_EXAMPLE)).toEqual([])
    const branches = CONVERT_EXAMPLE.items.filter((it) => it.type === 'branch')
    expect(branches.length).toBeGreaterThanOrEqual(1)
    for (const b of branches) {
      for (const p of b.paths) {
        expect(p.messages[0]!.title).toBe(p.label)
        for (const m of p.messages.slice(1)) expect(m.title).toBe(`⏩ ${p.label}`)
      }
    }
    expect(CONVERT_EXAMPLE.items.some((it) => it.type === 'message' && it.pendingMedia && it.pendingMedia.price > 0)).toBe(true)
    expect(CONVERT_SYSTEM).toContain(JSON.stringify(CONVERT_EXAMPLE))
  })
})

describe('convertToDraft', () => {
  it('appelle Claude Opus 5.5 en sortie structurée, avec repli serveur, et rend le brouillon + la consommation', async () => {
    const captured: Captured[] = []
    const r = await convertToDraft(fakeClient(ok(JSON.stringify(DRAFT)), captured), { title: 'Script', text: '#1 — Transition\n> et du coup…' })
    expect(r).toEqual({ draft: DRAFT, usage: { input: 9000, output: 7000 } })
    const p = captured[0]!
    expect(p.model).toBe(CONVERT_MODEL)
    expect(p.fallbacks).toBe('default')
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(p.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: SCRIPT_DRAFT_SCHEMA } })
    expect(JSON.stringify(p.messages)).toContain('<page>')
  })
  it('refus du modèle → erreur explicite', async () => {
    const refusal = { ...ok(''), stop_reason: 'refusal', stop_details: { category: 'general_harms' } }
    await expect(convertToDraft(fakeClient(refusal), { title: 'S', text: 'x' })).rejects.toThrow('conversion refusée par le modèle (general_harms)')
  })
  it('sortie tronquée → erreur explicite', async () => {
    await expect(convertToDraft(fakeClient(ok('{"name":', 'max_tokens')), { title: 'S', text: 'x' })).rejects.toThrow(
      'conversion tronquée (max_tokens)',
    )
  })
})
