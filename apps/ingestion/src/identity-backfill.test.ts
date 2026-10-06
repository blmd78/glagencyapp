import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackfillPlan, IdentityIssue, LotDecision } from '@glagency/core'
import { applyExitCode, applyLot, historyCoverage, nightlyWindow, nightlyWindowStartedBetween } from './identity-backfill'
import { FakeSupabase, type Result } from './test/fake-supabase'

// Fenêtres d'ingestion nocturne (UTC) où un `--apply` ne démarre pas : 22:55 → 00:20 et 04:20 → 05:30,
// bornes comprises à la minute. Une fusion pendant un run fausserait ses contrôles.

const at = (iso: string) => new Date(`${iso}Z`)
const SOIR = '22:55 → 00:20 UTC (crons de 23:05 et 00:00)'
const MATIN = '04:20 → 05:30 UTC (crons de 04:30 et 05:00)'

describe('nightlyWindow — bornes à la minute', () => {
  it.each<[string, string | null]>([
    ['2026-10-05T22:54:59', null],
    ['2026-10-05T22:55:00', SOIR],
    ['2026-10-05T23:59:59', SOIR],
    ['2026-10-06T00:00:00', SOIR],
    ['2026-10-06T00:20:59', SOIR],
    ['2026-10-06T00:21:00', null],
    ['2026-10-06T04:19:59', null],
    ['2026-10-06T04:20:00', MATIN],
    ['2026-10-06T05:30:59', MATIN],
    ['2026-10-06T05:31:00', null],
    ['2026-10-06T12:00:00', null],
  ])('%s UTC → %s', (iso, expected) => {
    expect(nightlyWindow(at(iso))).toBe(expected)
  })
})

describe('nightlyWindowStartedBetween — une fenêtre a-t-elle DÉMARRÉ dans ]from, to] ?', () => {
  it('début de fenêtre exactement à `to` → compté (borne haute incluse)', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T22:54:59.999'), at('2026-10-05T22:55:00'))).toBe(SOIR)
  })

  it('début de fenêtre exactement à `from` → non compté (borne basse exclue)', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T22:55:00'), at('2026-10-05T23:30:00'))).toBeNull()
  })

  it('faits lus avant une fenêtre déjà FINIE au lancement → périmés quand même', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T21:00:00'), at('2026-10-06T01:00:00'))).toBe(SOIR)
  })

  it('d’un jour sur l’autre : la fenêtre du matin du lendemain est vue', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T23:00:00'), at('2026-10-06T04:19:59'))).toBeNull()
    expect(nightlyWindowStartedBetween(at('2026-10-05T23:00:00'), at('2026-10-06T04:20:00'))).toBe(MATIN)
  })

  it('aucun début de fenêtre dans l’intervalle → null', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-06T06:00:00'), at('2026-10-06T22:54:59'))).toBeNull()
  })
})

// ─── applyLot : la fiche VIDÉE est supprimée après chaque fusion (décision de Benoit, 2026-10-06) ─────────
// merge_chatters laisse les `insights` sur la fiche vidée ; delete_empty_chatter refuse une fiche encore
// référencée : le faux joue ces deux règles (cf. migration 0183) pour que le test échoue si l'ordre change.

const KEEP_A = '00000000-0000-4000-8000-0000000000a1'
const OLD_A = '00000000-0000-4000-8000-0000000000a2'
const KEEP_B = '00000000-0000-4000-8000-0000000000b1'
const OLD_B = '00000000-0000-4000-8000-0000000000b2'

const group = (line: number, slug: string, keep: string, old: string, mypulsUserId: string): LotDecision => ({
  lines: [{ line, action: 'fusionner', slug, keep, old, expectedId: null }],
  ok: true,
  mypulsUserId,
  reasons: [],
})
const GROUP_A = group(1, 'alice', KEEP_A, OLD_A, '1001')
const GROUP_B = group(2, 'bob', KEEP_B, OLD_B, '1002')
const EMPTY_PLAN: BackfillPlan = { links: [], merges: [], issues: [], corrupted: [] }
const COMPLETE = historyCoverage({ from: '2026-09-01', to: '2026-10-05', daysRead: 35, stop: null, teamMoneyFailures: [] })
const NAMES = new Map([
  [KEEP_A, 'Alice'],
  [OLD_A, 'Alice (mail)'],
  [KEEP_B, 'Bob'],
  [OLD_B, 'Bob (mail)'],
])
const insight = (chatter_id: string, insight_key: string) => ({
  chatter_id,
  insight_key,
  generated_at: '2026-10-05T10:00:00Z',
  week_start: '2026-09-28',
  title: insight_key,
})

function seed(): FakeSupabase {
  const db = new FakeSupabase({
    chatters: [KEEP_A, OLD_A, KEEP_B, OLD_B].map((id) => ({ id, display_name: NAMES.get(id) })),
    insights: [
      insight(OLD_A, 'quotas_2026-09-28_a1'),
      insight(OLD_A, 'quotas_2026-09-28_a2'),
      insight(KEEP_A, 'quotas_2026-09-28_k'),
      insight(OLD_B, 'quotas_2026-09-28_b1'),
    ],
  })
  db.rpcHandlers.set('merge_chatters', () => ({ data: { moved: true }, error: null }))
  // Miroir de delete_empty_chatter (0183) : refuse une fiche encore référencée par `insights`.
  db.rpcHandlers.set('delete_empty_chatter', (args) => {
    const id = args.p_id as string
    if (db.rows('insights').some((r) => r.chatter_id === id)) {
      return { data: null, error: { code: 'P0001', message: `fiche ${id} encore référencée dans insights.chatter_id` } }
    }
    db.tables.chatters = db.rows('chatters').filter((c) => c.id !== id)
    return { data: null, error: null }
  })
  return db
}

describe('applyLot — suppression de la fiche vidée après la fusion', () => {
  let dir: string
  let out: string[]
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'identity-apply-'))
    out = []
    // Horloge figée en milieu de journée : jamais dans une fenêtre d'ingestion nocturne.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const keep = (...a: unknown[]) => void out.push(a.map(String).join(' '))
    vi.spyOn(console, 'log').mockImplementation(keep)
    vi.spyOn(console, 'error').mockImplementation(keep)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  const run = (db: FakeSupabase, decisions: LotDecision[], plan: BackfillPlan = EMPTY_PLAN) =>
    applyLot(
      db as unknown as Parameters<typeof applyLot>[0],
      dir,
      decisions,
      plan,
      COMPLETE,
      NAMES,
      new Map(),
      new Date('2026-10-06T11:59:00Z'),
    )
  /** Dossier de sauvegarde de l'opération d'une ligne (un dossier par exécution, un sous-dossier par ligne). */
  const opDir = (line: string) => join(dir, 'sauvegardes', '2026-10-06T12-00-00-000Z', line)
  const calls = (db: FakeSupabase) => db.rpcCalls.map((c) => `${c.fn}:${String(c.args.p_old ?? c.args.p_id)}`)

  it('supprime la fiche vidée juste après sa fusion, et seulement elle', async () => {
    const db = seed()
    const r = await run(db, [GROUP_A])

    expect(calls(db)).toEqual([`merge_chatters:${OLD_A}`, `delete_empty_chatter:${OLD_A}`])
    expect(db.rows('chatters').map((c) => c.id)).toEqual([KEEP_A, KEEP_B, OLD_B])
    expect(r).toMatchObject({ done: 1, skippedLines: 0, mergedDeleted: ['alice'], mergedKept: [] })
    expect(applyExitCode(r)).toBe(0)
    expect(out.join('\n')).toContain('1 fusion(s) + fiche vidée supprimée (alice), 0 fusion(s) + fiche vidée GARDÉE')
  })

  it('sauvegarde les insights de la fiche vidée (CSV + JSON) puis les supprime, ceux de la gardée restent', async () => {
    const db = seed()
    await run(db, [GROUP_A])

    const saved = JSON.parse(readFileSync(join(opDir('01-alice'), 'sauvegarde_insights_fiche_videe.json'), 'utf8')) as {
      chatter_id: string
      insight_key: string
    }[]
    expect(saved.map((x) => x.insight_key)).toEqual(['quotas_2026-09-28_a1', 'quotas_2026-09-28_a2'])
    expect(saved.every((x) => x.chatter_id === OLD_A)).toBe(true)
    const csv = readFileSync(join(opDir('01-alice'), 'sauvegarde_insights_fiche_videe.csv'), 'utf8')
    expect(csv).toContain('quotas_2026-09-28_a1')
    expect(csv).toContain('quotas_2026-09-28_a2')

    // Une seule suppression d'insights, et seulement celles de la fiche vidée.
    const deletes = db.writesTo('insights').filter((w) => w.op === 'delete')
    expect(deletes).toHaveLength(1)
    expect(deletes[0]!.rows.map((x) => x.chatter_id)).toEqual([OLD_A, OLD_A])
    expect(db.rows('insights').map((x) => x.chatter_id).sort()).toEqual([KEEP_A, OLD_B].sort())
  })

  it('échec de delete_empty_chatter : fiche gardée, fusion faite, code 2, les autres groupes continuent', async () => {
    const db = seed()
    const ok = db.rpcHandlers.get('delete_empty_chatter')!
    db.rpcHandlers.set(
      'delete_empty_chatter',
      (args): Result | Promise<Result> =>
        args.p_id === OLD_A
          ? { data: null, error: { code: '23503', message: 'fiche encore référencée dans relances.chatter_id' } }
          : ok(args),
    )

    const r = await run(db, [GROUP_A, GROUP_B])

    // Le groupe B est traité malgré l'échec du groupe A : merge + delete, fiche supprimée.
    expect(calls(db)).toEqual([
      `merge_chatters:${OLD_A}`,
      `delete_empty_chatter:${OLD_A}`,
      `merge_chatters:${OLD_B}`,
      `delete_empty_chatter:${OLD_B}`,
    ])
    expect(db.rows('chatters').map((c) => c.id)).toEqual([KEEP_A, OLD_A, KEEP_B])
    expect(r.done).toBe(2)
    expect(r.mergedDeleted).toEqual(['bob'])
    expect(r.mergedKept).toHaveLength(1)
    expect(r.mergedKept[0]).toMatchObject({ slug: 'alice', oldId: OLD_A })
    expect(r.mergedKept[0]!.reason).toContain('delete_empty_chatter : fiche encore référencée dans relances.chatter_id')
    // Les insights d'Alice (vidée) étaient déjà supprimés avant l'échec : la raison le dit, la sauvegarde existe.
    expect(r.mergedKept[0]!.reason).toContain('ses 2 insight(s) sont déjà supprimés')
    expect(existsSync(join(opDir('01-alice'), 'sauvegarde_insights_fiche_videe.json'))).toBe(true)
    expect(applyExitCode(r)).toBe(2)
    expect(out.join('\n')).toContain(
      'fusion faite, fiche vidée gardée : delete_empty_chatter : fiche encore référencée dans relances.chatter_id',
    )
    expect(out.join('\n')).toContain('1 fusion(s) + fiche vidée supprimée (bob), 1 fusion(s) + fiche vidée GARDÉE (alice)')
    expect(out.join('\n')).toContain('code de sortie 2')
  })

  it('échec de la suppression des insights : sauvegarde déjà faite, delete_empty_chatter pas appelé, fiche gardée', async () => {
    const db = seed()
    db.errors.set('insights:delete', { code: '42501', message: 'permission denied for table insights' })

    const r = await run(db, [GROUP_A])

    expect(calls(db)).toEqual([`merge_chatters:${OLD_A}`])
    expect(db.rows('insights')).toHaveLength(4)
    expect(db.rows('chatters').map((c) => c.id)).toContain(OLD_A)
    const saved = JSON.parse(readFileSync(join(opDir('01-alice'), 'sauvegarde_insights_fiche_videe.json'), 'utf8')) as unknown[]
    expect(saved).toHaveLength(2)
    expect(r.mergedKept).toHaveLength(1)
    expect(r.mergedKept[0]!.reason).toBe('suppression des insights : permission denied for table insights')
    expect(applyExitCode(r)).toBe(2)
  })

  it("une fusion refusée par la base arrête toujours tout : rien n'est supprimé", async () => {
    const db = seed()
    db.rpcHandlers.set('merge_chatters', () => ({ data: null, error: { code: 'P0001', message: 'id déjà porté par une autre fiche' } }))

    await expect(run(db, [GROUP_A, GROUP_B])).rejects.toThrow(/apply interrompu à « fusion alice »/)

    expect(calls(db)).toEqual([`merge_chatters:${OLD_A}`])
    expect(db.rows('chatters')).toHaveLength(4)
    expect(db.rows('insights')).toHaveLength(4)
  })

  it('ne publie pas une anomalie qui vise une fiche supprimée (clé étrangère), mais publie les autres', async () => {
    const db = seed()
    const published: unknown[] = []
    db.rpcHandlers.set('apply_chatter_identity', (args) => {
      published.push(...(args.p_issues as unknown[]))
      return { data: null, error: null }
    })
    const issue = (issueKey: string, chatterId: string, otherChatterId: string | null): IdentityIssue => ({
      issueKey,
      kind: 'homonyme',
      mypulsUserId: null,
      label: null,
      chatterId,
      otherChatterId,
      day: null,
      amount: null,
      detail: 'test',
    })
    const plan: BackfillPlan = {
      ...EMPTY_PLAN,
      issues: [issue('vise-la-videe', KEEP_A, OLD_A), issue('vise-la-gardee', KEEP_A, null), issue('autre-groupe', KEEP_B, null)],
    }

    await run(db, [GROUP_A], plan)

    expect(published.map((p) => (p as { issue_key: string }).issue_key)).toEqual(['vise-la-gardee', 'autre-groupe'])
  })
})

describe('applyExitCode — 2 dès qu’il reste du travail, jamais 0 en silence', () => {
  it.each([
    [{ skippedLines: 0, mergedKept: [] }, 0],
    [{ skippedLines: 2, mergedKept: [] }, 2],
    [{ skippedLines: 0, mergedKept: [{ slug: 'x', oldId: 'y', reason: 'z' }] }, 2],
    [{ skippedLines: 1, mergedKept: [{ slug: 'x', oldId: 'y', reason: 'z' }] }, 2],
  ])('%j → %i', (r, code) => {
    expect(applyExitCode(r)).toBe(code)
  })
})
