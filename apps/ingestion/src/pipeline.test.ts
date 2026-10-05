import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseChatterSummary,
  parseMoneyTeamDirectory,
  parseMoneyTeamPageTotals,
  parseMoneyTeamSales,
  type MoneyTeamDay,
  type MoneyTx,
} from '@glagency/mypuls'
import { FakeSupabase, type Result } from './test/fake-supabase'
import { runPipeline } from './pipeline'

// Câblage du pipeline de nuit (ingestChatterDay dans runPipeline) sur les captures du dépôt, contre un
// faux Supabase qui refait ce que calcule finish_chatter_day (0183). Hors ligne : MyPuls est simulé
// (team/money et dashboard), la page money-team est lue par les VRAIS parseurs cheerio.

const h = vi.hoisted(() => ({ db: null as unknown, teamMoney: [] as unknown[] }))
vi.mock('@glagency/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@glagency/db')>()),
  createAdminClient: () => h.db,
}))
vi.mock('@glagency/mypuls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@glagency/mypuls')>()),
  fetchTeamMoney: async () => h.teamMoney,
  fetchDashboardStats: async () => ({ labels: [], datasets: [] }),
  fetchDashboardSubscriptions: async () => ({ labels: [], newSubsDatasets: [], totalSubsDatasets: [] }),
  login: async () => {
    throw new Error('login interdit en test : le cookie est injecté')
  },
}))

const DAY = '2026-09-06'
const fixture = (f: string) =>
  readFileSync(new URL(`../../../packages/mypuls/src/endpoints/__fixtures__/${f}`, import.meta.url), 'utf8')
const IDENTITY_PAGE = fixture('money-team-identity.html')

/** Une ligne du fragment « Résumé chatteur », au balisage de chatter-summary.html (8 colonnes). */
const summaryRow = (name: string, ppv: string, tips: string) =>
  `<tr class="chatter-row"><td><div class="fw-bold">${name}</div></td><td>-</td><td>0</td><td>0</td><td>0%</td>` +
  `<td>${ppv} EUR</td><td>${tips} EUR</td><td>0,00 EUR</td></tr>`

/** Ce que rend fetchMoneyTeamDay (cheerio) pour une page + un fragment de résumé. */
const parsedDay = (page: string, summary: string): MoneyTeamDay => ({
  chatters: parseChatterSummary(summary),
  transactions: parseMoneyTeamSales(page),
  directory: parseMoneyTeamDirectory(page),
  pageTotals: parseMoneyTeamPageTotals(page),
})

/** Page « identité » (4 ventes, 267,68 €) + un résumé qui lui correspond au centime. */
const identityDay = (summary = summaryRow('Lionel', '158,57', '0,00') + summaryRow('Serge', '0,00', '70,79')) =>
  parsedDay(IDENTITY_PAGE, summary)

const EMPTY_DAY: MoneyTeamDay = {
  chatters: [],
  transactions: [],
  directory: [],
  pageTotals: { salesCount: 0, net: [{ currency: 'EUR', amount: 0 }] },
}

const tx = (creator: string, amount: number, type: string) => ({ creator, amount, type }) as unknown as MoneyTx
/** Le /team/money du jour de la page identité : mêmes ventes, côté API. */
const IDENTITY_API = [
  tx('Claire_sps', 146.57, 'Média privé'),
  tx('Lolafps', 12, 'Média privé'),
  tx('Sarahcbr', 38.32, 'Média privé'),
  tx('Claire_sps', 70.79, 'Pourboires'),
]

const creator = (id: string, name: string) => ({ id, name, is_private: false, mypuls_creator_id: null })
const CREATORS = [creator('cr-claire', 'Claire'), creator('cr-lola', 'Lola'), creator('cr-sarah', 'Sarah')]
const chatter = (id: string, display_name: string, mypuls_user_id: string | null = null) => ({
  id,
  display_name,
  email: null,
  mypuls_user_id,
})
const CHATTERS = [chatter('ch-lionel', 'Lionel'), chatter('ch-indet', 'Indéterminé (Sarahcbr)')]

function setup(o: { seed?: Record<string, Record<string, unknown>[]>; api?: MoneyTx[]; has0183?: boolean } = {}) {
  const db = new FakeSupabase({ creators: CREATORS, chatters: CHATTERS, chatter_alias: [], profiles: [], ...o.seed })
  db.has0183 = o.has0183 ?? true
  h.db = db
  h.teamMoney = o.api ?? IDENTITY_API
  return db
}

/** `explicitDay: null` = rattrapage (fenêtre depuis le dernier jour de creator_daily). */
const run = (day: MoneyTeamDay, explicitDay: string | null = DAY) => {
  const fetchMoneyTeam = vi.fn(async () => day)
  return { fetchMoneyTeam, summary: runPipeline(explicitDay ?? undefined, { cookie: 'PHPSESSID=test', fetchMoneyTeam }) }
}

const finishCalls = (db: FakeSupabase) => db.rpcCalls.filter((c) => c.fn === 'finish_chatter_day')
const verdict = (db: FakeSupabase, day = DAY) => db.rows('ingest_day_checks').find((r) => r.day === day) as
  | { status: string; checks: { code: string; ok: boolean; detail: string }[] }
  | undefined
const checkOf = (db: FakeSupabase, code: string, day = DAY) => verdict(db, day)?.checks.find((c) => c.code === code)
const caOf = (db: FakeSupabase, table: string, day = DAY) =>
  db.rows(table).filter((r) => r.date === day).map((r) => [r.chatter_id, r.ca])

afterEach(() => {
  vi.useRealTimers()
})

describe('runPipeline — journée money-team identifiée (capture du 06/09)', () => {
  it('jour juste : totaux attendus sur toutes les lignes, écritures, liens et verdict « ok »', async () => {
    const db = setup()
    const s = await run(identityDay()).summary

    expect(finishCalls(db)).toHaveLength(1)
    expect(finishCalls(db)[0]!.args.p_expected).toEqual({
      summary_cents: 22936,
      sales_cents: 26768,
      sales_count: 4,
      page_net_cents: 26768,
      page_sales_count: 4,
    })
    const serge = db.rows('chatters').find((c) => c.mypuls_user_id === '10504')
    expect(serge?.display_name).toBe('Serge')
    expect(caOf(db, 'chatter_daily')).toEqual([
      ['ch-lionel', 158.57],
      [serge?.id, 70.79],
    ])
    expect(db.rows('chatters').find((c) => c.id === 'ch-lionel')?.mypuls_user_id).toBe('1802')
    expect(verdict(db)?.status).toBe('ok')
    expect(s.status).toBe('ok')
    expect(s.days[0]).toMatchObject({ date: DAY, chatterRows: 2, pairRows: 4, reliabilityAlerts: 0 })
  })

  it('l’état d’identité suit les écritures : le 2e jour retrouve la fiche créée et l’id posé (ni doublon ni re-lien)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-07T23:10:00Z'))
    const db = setup({ seed: { creator_daily: [{ creator_id: 'cr-claire', date: '2026-09-05', ca: 1 }] } })
    const s = await run(identityDay(), null).summary

    expect(s.days.map((d) => d.date)).toEqual(['2026-09-06', '2026-09-07'])
    expect(db.rows('chatters').filter((c) => c.mypuls_user_id === '10504')).toHaveLength(1)
    expect(db.writesTo('chatters')).toHaveLength(1)
    const [d1, d2] = finishCalls(db)
    expect(d1!.args.p_links).toEqual([{ chatter_id: 'ch-lionel', mypuls_user_id: '1802' }])
    expect(d2!.args.p_links).toEqual([])
    expect(s.status).toBe('ok')
  })

  it('homonyme : la fiche créée pour 10504 désigne la fiche libre « Serge » (other_chatter_id transmis à la RPC)', async () => {
    const db = setup({ seed: { chatters: [...CHATTERS, chatter('ch-serge', 'Serge')] } })
    await run(identityDay()).summary

    const serge = db.rows('chatters').find((c) => c.mypuls_user_id === '10504')
    const issues = finishCalls(db)[0]!.args.p_issues as { issue_key: string; kind: string; chatter_id: string | null; other_chatter_id: string | null }[]
    expect(issues.map((i) => [i.kind, i.issue_key, i.chatter_id, i.other_chatter_id])).toEqual([
      ['homonyme', 'homonyme:ch-serge', 'ch-serge', null],
      ['fiche_creee', 'fiche:10504', serge?.id, 'ch-serge'],
    ])
  })

  it('lignes mises de côté (résumé ambigu, modèle inconnu) : comptées dans l’attendu, NON écrites, b1/b2 échouent', async () => {
    const db = setup({ seed: { creators: CREATORS.filter((c) => c.name !== 'Sarah') } })
    const s = await run(identityDay(summaryRow('Lionel', '158,57', '0,00') + summaryRow('Serge', '0,00', '50,00'))).summary

    expect(finishCalls(db)[0]!.args.p_expected).toMatchObject({ summary_cents: 20857, sales_cents: 26768, sales_count: 4 })
    expect(caOf(db, 'chatter_daily')).toEqual([['ch-lionel', 158.57]])
    const ccd = db.rows('chatter_creator_daily').filter((r) => r.date === DAY)
    expect(ccd.some((r) => r.chatter_id === 'ch-indet')).toBe(false)
    expect(Math.round(ccd.reduce((t, r) => t + Number(r.ca), 0) * 100)).toBe(26768 - 3832)
    expect(checkOf(db, 'b_resume_ecrit')?.ok).toBe(false)
    expect(checkOf(db, 'b_ventes_ecrites')?.ok).toBe(false)
    expect(verdict(db)?.status).toBe('a_verifier')
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('modèle inconnu « Sarahcbr »'))).toBe(true)
  })
})

describe('runPipeline — total de page (cartes « Montant net »)', () => {
  it('somme de TOUTES les cartes de devise, USD compris (tout le CA est en euros)', async () => {
    const db = setup()
    const day = identityDay()
    day.pageTotals = { salesCount: 4, net: [{ currency: 'EUR', amount: 200 }, { currency: 'USD', amount: 67.68 }] }
    await run(day).summary

    expect(finishCalls(db)[0]!.args.p_expected).toMatchObject({ page_net_cents: 26768, page_sales_count: 4 })
    expect(checkOf(db, 'b_total_page')?.ok).toBe(true)
  })

  it('aucune carte (capture historique sans .kpi-card) → total null, b_total_page échoue', async () => {
    const db = setup({ api: [] })
    await run(parsedDay(fixture('money-team-page.html'), fixture('chatter-summary.html'))).summary

    expect(finishCalls(db)[0]!.args.p_expected).toMatchObject({ page_net_cents: null, page_sales_count: null })
    expect(checkOf(db, 'b_total_page')).toMatchObject({ ok: false })
    expect(checkOf(db, 'b_total_page')?.detail).toContain('total de page introuvable')
  })
})

describe('runPipeline — réponse de finish_chatter_day lue strictement', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['sans statut', { linked: 0, refused: [] }],
    ['checks non tableau', { status: 'ok', checks: 'x', refused: [] }],
    ['statut inconnu', { status: 'peut-être', checks: [], refused: [] }],
    ['refused absent', { status: 'ok', checks: [] }],
  ])('%s → le jour est en erreur, jamais un verdict par défaut', async (_nom, data) => {
    const db = setup()
    db.rpcResponse = { data, error: null } satisfies Result
    const s = await run(identityDay()).summary

    expect(s.days[0]?.error).toContain('réponse inattendue de finish_chatter_day')
    expect(s.status).toBe('degraded')
  })
})

describe('runPipeline — un jour n’est vidé que si des lignes ont été lues', () => {
  const stale = {
    chatter_daily: [{ chatter_id: 'ch-lionel', date: DAY, ca: 99 }],
    chatter_creator_daily: [{ chatter_id: 'ch-lionel', creator_id: 'cr-claire', date: DAY, ca: 99 }],
  }

  it('page vide (0 résumé, 0 vente) : rien n’est effacé, et b1/b2 en base signalent les vieilles lignes', async () => {
    const db = setup({ seed: stale, api: [] })
    await run(EMPTY_DAY).summary

    expect(db.writes.filter((w) => w.op === 'delete')).toEqual([])
    expect(caOf(db, 'chatter_daily')).toEqual([['ch-lionel', 99]])
    expect(caOf(db, 'chatter_creator_daily')).toEqual([['ch-lionel', 99]])
    expect(checkOf(db, 'b_resume_ecrit')?.ok).toBe(false)
    expect(verdict(db)?.status).toBe('a_verifier')
  })

  it('résumé lu mais entièrement mis de côté : le jour EST vidé (les vieilles lignes ne font pas passer b1)', async () => {
    const db = setup({ seed: stale })
    await run(identityDay(summaryRow('Serge', '0,00', '50,00'))).summary

    expect(db.writesTo('chatter_daily').map((w) => w.op)).toEqual(['delete'])
    expect(caOf(db, 'chatter_daily')).toEqual([])
    expect(checkOf(db, 'b_resume_ecrit')?.ok).toBe(false)
  })
})

describe('runPipeline — garde « migration 0183 absente »', () => {
  const CHATTER_TABLES = ['chatter_daily', 'chatter_creator_daily', 'chatters', 'chatter_alias']

  it('table absente (PGRST205) → suspendu : aucune écriture chatteurs ni RPC, money-team non lu, creator_daily écrit, run dégradé et motif explicite', async () => {
    const db = setup({ has0183: false })
    const { fetchMoneyTeam, summary } = run(identityDay())
    const s = await summary

    expect(db.writes.filter((w) => CHATTER_TABLES.includes(w.table))).toEqual([])
    expect(db.rpcCalls).toEqual([])
    expect(fetchMoneyTeam).not.toHaveBeenCalled()
    expect(db.rows('creator_daily').map((r) => [r.creator_id, r.date])).toEqual([
      ['cr-claire', DAY],
      ['cr-lola', DAY],
      ['cr-sarah', DAY],
    ])
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('migration 0183 absente : relevé chatteurs suspendu'))).toBe(true)
    expect(s.days[0]).toMatchObject({ creatorRows: 3, chatterRows: 0, pairRows: 0 })
    expect(s.days[0]?.error).toBeUndefined()
  })

  it('relation absente (42P01, PostgREST plus ancien) → suspendu de même', async () => {
    const db = setup()
    db.errors.set('ingest_day_checks:select', { code: '42P01', message: 'relation "public.ingest_day_checks" does not exist' })
    const { fetchMoneyTeam, summary } = run(identityDay())
    const s = await summary

    expect(db.writes.filter((w) => CHATTER_TABLES.includes(w.table))).toEqual([])
    expect(fetchMoneyTeam).not.toHaveBeenCalled()
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('migration 0183 absente : relevé chatteurs suspendu'))).toBe(true)
  })

  it('erreur passagère de la sonde → le run échoue (throw) AVANT toute écriture : le rattrapage suivant reprendra ces jours', async () => {
    const db = setup()
    db.errors.set('ingest_day_checks:select', { code: '500', message: 'panne réseau' })
    const { fetchMoneyTeam, summary } = run(identityDay())

    await expect(summary).rejects.toThrow(/sonde de la migration 0183.*panne réseau/)
    expect(db.writes.filter((w) => CHATTER_TABLES.includes(w.table))).toEqual([])
    expect(db.writesTo('creator_daily')).toEqual([])
    expect(db.rpcCalls).toEqual([])
    expect(fetchMoneyTeam).not.toHaveBeenCalled()
  })

  it('0183 présente : la sonde ne fait que LIRE ingest_day_checks (aucune écriture hors RPC)', async () => {
    const db = setup()
    await run(identityDay()).summary

    expect(db.reads).toContain('ingest_day_checks')
    expect(db.writesTo('ingest_day_checks')).toEqual([])
  })
})

describe('runPipeline — jour vide servi par MyPuls', () => {
  it('0 vente, cartes à 0, mais l’API annonce 50 € → b_total_page échoue avec le montant, run dégradé', async () => {
    const db = setup({ api: [tx('Claire_sps', 50, 'Média privé')] })
    const s = await run(EMPTY_DAY).summary

    expect(checkOf(db, 'b_total_page')?.ok).toBe(false)
    expect(checkOf(db, 'b_total_page')?.detail).toContain("0 vente lue alors que l'API annonce 50,00 €")
    expect(verdict(db)?.status).toBe('a_verifier')
    expect(s.status).toBe('degraded')
  })

  it('0 vente et API vide → jour réellement vide : « ok »', async () => {
    const db = setup({ api: [] })
    const s = await run(EMPTY_DAY).summary

    expect(checkOf(db, 'b_total_page')?.ok).toBe(true)
    expect(verdict(db)?.status).toBe('ok')
    expect(s.status).toBe('ok')
  })
})

describe('runPipeline — annuaire des équipes absent', () => {
  it('JSON assignableUsersByCreator absent alors que des ventes existent → warning technique, PAS une dégradation', async () => {
    const db = setup()
    const page = IDENTITY_PAGE.replace(/<script>[\s\S]*?<\/script>/, '')
    const s = await run(parsedDay(page, summaryRow('Lionel', '158,57', '0,00') + summaryRow('Serge', '0,00', '70,79'))).summary

    expect(verdict(db)?.status).toBe('ok')
    expect(s.status).toBe('ok')
    expect(s.warnings.some((w) => w.includes('assignableUsersByCreator'))).toBe(true)
  })
})
