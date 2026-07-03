/**
 * Résumé d'un run d'ingestion — logique pure (testée), consommée par apps/ingestion.
 * Un run peut « réussir » techniquement en ayant silencieusement rien ingéré (login
 * money-team KO, jours en échec avalés par le rattrapage, parseurs qui renvoient vide
 * sans throw quand le markup change) : c'est le statut `degraded` qui rend ces cas
 * visibles (alerte Sentry + ligne ingest_runs).
 * `failed` (crash complet du pipeline) est posé par l'appelant, pas ici.
 */

export interface IngestDayResult {
  date: string
  creatorRows: number
  chatterRows: number
  pairRows: number
  source: 'dashboard' | 'api'
  error?: string
}

export interface IngestRunSummary {
  status: 'ok' | 'degraded'
  loginOk: boolean
  dashboardOk: boolean
  /** false = rejeu explicite d'un jour précis (les règles « zéro ligne » ne s'appliquent pas). */
  catchup: boolean
  days: IngestDayResult[]
  warnings: string[]
  durationMs: number
}

export function summarizeRun(input: {
  loginOk: boolean
  dashboardOk: boolean
  catchup: boolean
  days: IngestDayResult[]
  warnings: string[]
  durationMs: number
}): IngestRunSummary {
  const warnings = [...input.warnings]
  const totalCreatorRows = input.days.reduce((s, d) => s + d.creatorRows, 0)
  const totalChatterRows = input.days.reduce((s, d) => s + d.chatterRows, 0)
  const failedDays = input.days.filter((d) => d.error)

  // dashboardOk=false compte aussi : le fallback /team/money écrit des creator_daily
  // PARTIELS (messagerie seule, subs à 0) qui peuvent écraser un jour déjà complet —
  // il faut l'alerte (Sentry ne fire que sur degraded) pour rejouer le jour à la main.
  let degraded = !input.loginOk || !input.dashboardOk || failedDays.length > 0

  // Les règles « zéro ligne » ne valent que pour un rattrapage : rejouer explicitement
  // un vieux jour légitimement vide n'est pas une dégradation.
  if (input.catchup && totalCreatorRows === 0) {
    degraded = true
    warnings.push('aucune ligne creator_daily upsertée sur tout le run')
  }
  // Login OK mais zéro chatteur sur toute la fenêtre = page money-team probablement
  // cassée : les parseurs renvoient vide SANS throw quand le markup change, et le
  // delete/insert de chatter_daily étant gardé par length, le dashboard gèlerait
  // silencieusement sur les dernières données connues.
  if (input.catchup && input.loginOk && totalChatterRows === 0) {
    degraded = true
    warnings.push('aucune ligne chatter_daily malgré un login money-team OK (markup changé ?)')
  }

  return {
    status: degraded ? 'degraded' : 'ok',
    loginOk: input.loginOk,
    dashboardOk: input.dashboardOk,
    catchup: input.catchup,
    days: input.days,
    warnings,
    durationMs: input.durationMs,
  }
}
