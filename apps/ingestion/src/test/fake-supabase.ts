/**
 * Faux client Supabase EN MÉMOIRE pour les tests de l'ingestion (pas un test : aucun `it` ici).
 *
 * Ne couvre QUE ce que lisent et écrivent `runPipeline` et `resolveIdentities` :
 *   - `from(t)` : select / insert / upsert / delete / update, filtres eq / is / not('…', 'is', …),
 *     order, range, limit — chaque écriture est journalisée dans `writes` ;
 *   - `rpc('finish_chatter_day')` refaite d'après la migration 0183 : ids posés ou refusés (même
 *     règle que `apply_chatter_identity`), anomalies (upsert sur `issue_key`), contrôles du client
 *     complétés (« contrôle non transmis », code inconnu), b_resume_ecrit / b_ventes_ecrites sommés
 *     sur l'état RÉEL des tables du faux, verdict écrit dans `ingest_day_checks`.
 * Sans 0183 (`has0183: false`), ses tables et sa RPC répondent l'erreur PostgREST d'un objet absent.
 * Pas de contraintes d'unicité ni de types : ce que les tests vérifient se lit dans les tables.
 */

type Row = Record<string, unknown>
type PgError = { code: string; message: string }
export type Result = { data: unknown; error: PgError | null }

export interface Write {
  table: string
  op: 'insert' | 'upsert' | 'delete' | 'update'
  rows: Row[]
}

const TABLES_0183 = new Set(['ingest_day_checks', 'chatter_identity_issues'])
const KNOWN_CHECKS = ['a_resume_ventes', 'b_resume_ecrit', 'b_ventes_ecrites', 'b_total_page', 'c_fiche_compte', 'c_lien_refuse']
const REQUIRED_CHECKS = ['a_resume_ventes', 'b_total_page', 'c_fiche_compte']
const arr = (x: Row | Row[]): Row[] => (Array.isArray(x) ? x : [x])

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  writes: Write[] = []
  rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  reads: string[] = []
  /** Migration 0183 appliquée (tables `ingest_day_checks`, `chatter_identity_issues`, RPC). */
  has0183 = true
  /** Réponse imposée de `finish_chatter_day` (forme inattendue) : la RPC n'écrit alors rien. */
  rpcResponse?: Result
  /** Erreur imposée à une opération `<table>:<op>` (ex. `ingest_day_checks:select`). */
  errors = new Map<string, PgError>()

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => ({ ...r }))
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  }

  writesTo(table: string): Write[] {
    return this.writes.filter((w) => w.table === table)
  }

  from(table: string): Query {
    return new Query(this, table)
  }

  async rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    this.rpcCalls.push({ fn, args })
    if (fn !== 'finish_chatter_day' || !this.has0183) {
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } }
    }
    if (this.rpcResponse) return this.rpcResponse
    return { data: this.finishChatterDay(args), error: null }
  }

  /** Miroir de `finish_chatter_day` (0183), sans le SQL. */
  private finishChatterDay(args: Record<string, unknown>): Row {
    const day = args.p_day as string
    const chatters = this.rows('chatters')
    const refused: Row[] = []
    let linked = 0
    for (const l of (args.p_links ?? []) as { chatter_id: string; mypuls_user_id: string }[]) {
      const self = chatters.find((c) => c.id === l.chatter_id)
      if (self && self.mypuls_user_id === l.mypuls_user_id) continue
      if (!l.chatter_id || !l.mypuls_user_id || chatters.some((c) => c.mypuls_user_id === l.mypuls_user_id)) {
        refused.push({ ...l })
        continue
      }
      if (self && (self.mypuls_user_id ?? null) === null) {
        self.mypuls_user_id = l.mypuls_user_id
        linked++
      } else refused.push({ ...l })
    }
    const issues = this.rows('chatter_identity_issues')
    for (const i of (args.p_issues ?? []) as Row[]) {
      const at = issues.findIndex((x) => x.issue_key === i.issue_key)
      if (at >= 0) issues[at] = { ...issues[at], ...i }
      else issues.push({ ...i })
    }

    const sent = Array.isArray(args.p_checks) ? (args.p_checks as Row[]) : []
    const checks: Row[] = sent.map((c) =>
      KNOWN_CHECKS.includes(c.code as string) ? { ...c } : { code: c.code ?? '?', ok: false, detail: 'code de contrôle inconnu' },
    )
    for (const code of REQUIRED_CHECKS) {
      if (!checks.some((c) => c.code === code)) checks.push({ code, ok: false, detail: 'contrôle non transmis' })
    }
    const inBase = (table: string) =>
      Math.round(this.rows(table).filter((r) => r.date === day).reduce((s, r) => s + Number(r.ca), 0) * 100)
    const cd = inBase('chatter_daily')
    const ccd = inBase('chatter_creator_daily')
    const expected = (args.p_expected ?? {}) as Record<string, number | null>
    checks.push(
      { code: 'b_resume_ecrit', ok: cd === expected.summary_cents, detail: `chatter_daily : ${cd} c en base, ${expected.summary_cents} c lus` },
      { code: 'b_ventes_ecrites', ok: ccd === expected.sales_cents, detail: `chatter_creator_daily : ${ccd} c en base, ${expected.sales_cents} c lus` },
    )
    if (refused.length) checks.push({ code: 'c_lien_refuse', ok: false, detail: `${refused.length} id(s) MyPuls non posé(s)` })
    const status = checks.every((c) => c.ok === true) ? 'ok' : 'a_verifier'

    const verdicts = this.rows('ingest_day_checks')
    const verdict = {
      day,
      status,
      checks,
      totals: { ...expected, chatter_daily_cents: cd, chatter_creator_daily_cents: ccd },
      checked_at: new Date().toISOString(),
    }
    const at = verdicts.findIndex((v) => v.day === day)
    if (at >= 0) verdicts[at] = verdict
    else verdicts.push(verdict)
    return { linked, refused, status, checks }
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | Write['op'] = 'select'
  private payload: Row[] = []
  private patch: Row = {}
  private conflict: string[] = []
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string): this {
    return this
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert'
    this.payload = arr(rows)
    return this
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = 'upsert'
    this.payload = arr(rows)
    this.conflict = (opts?.onConflict ?? 'id').split(',').map((c) => c.trim())
    return this
  }
  delete(): this {
    this.op = 'delete'
    return this
  }
  update(patch: Row): this {
    this.op = 'update'
    this.patch = patch
    return this
  }
  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value)
    return this
  }
  is(col: string, value: null): this {
    this.filters.push((r) => (r[col] ?? null) === value)
    return this
  }
  not(col: string, operator: string, value: null): this {
    if (operator !== 'is') throw new Error(`faux Supabase : not(…, '${operator}') non géré`)
    this.filters.push((r) => (r[col] ?? null) !== value)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.sorts.push({ col, asc: opts?.ascending !== false })
    return this
  }
  range(from: number, to: number): this {
    this.start = from
    this.end = to
    return this
  }
  limit(n: number): this {
    this.end = this.start + n - 1
    return this
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(onFulfilled, onRejected)
  }

  private exec(): Result {
    const forced = this.db.errors.get(`${this.table}:${this.op}`)
    if (forced) return { data: null, error: forced }
    if (!this.db.has0183 && TABLES_0183.has(this.table)) {
      return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.table}' in the schema cache` } }
    }
    const rows = this.db.rows(this.table)
    const match = (r: Row) => this.filters.every((f) => f(r))
    if (this.op === 'select') {
      this.db.reads.push(this.table)
      const out = rows.filter(match).map((r) => ({ ...r }))
      for (const s of [...this.sorts].reverse()) {
        out.sort((a, b) => {
          const x = String(a[s.col] ?? '')
          const y = String(b[s.col] ?? '')
          return (x < y ? -1 : x > y ? 1 : 0) * (s.asc ? 1 : -1)
        })
      }
      return { data: out.slice(this.start, this.end + 1), error: null }
    }
    if (this.op === 'insert') {
      rows.push(...this.payload.map((r) => ({ ...r })))
      this.db.writes.push({ table: this.table, op: 'insert', rows: this.payload })
      return { data: null, error: null }
    }
    if (this.op === 'upsert') {
      for (const r of this.payload) {
        const at = rows.findIndex((x) => this.conflict.every((c) => x[c] === r[c]))
        if (at >= 0) rows[at] = { ...rows[at], ...r }
        else rows.push({ ...r })
      }
      this.db.writes.push({ table: this.table, op: 'upsert', rows: this.payload })
      return { data: null, error: null }
    }
    const hit = rows.filter(match)
    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter((r) => !match(r))
      this.db.writes.push({ table: this.table, op: 'delete', rows: hit })
      return { data: null, error: null }
    }
    for (const r of hit) Object.assign(r, this.patch)
    this.db.writes.push({ table: this.table, op: 'update', rows: hit.map((r) => ({ ...r })) })
    return { data: null, error: null }
  }
}
