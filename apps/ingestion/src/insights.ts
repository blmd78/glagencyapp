import {
  buildQuotaInsights,
  type ChatterDayInput,
  type ChatterModelDayInput,
  type QuotaTargets,
  type WeekWindow,
  mondayOf,
  addDays,
  weekLabel,
} from '@glagency/core'
import { createAdminClient, type Json } from '@glagency/db'

type Db = ReturnType<typeof createAdminClient>

/**
 * Génération des insights hebdo « Quotas » (spec 2026-07-03).
 * Fenêtre évaluée : S-1 complète si les données l'atteignent, sinon la semaine du
 * dernier jour ingéré (amorçage, cartes « n j de données »). Chaque appel INSÈRE une
 * nouvelle génération (PK insight_key+generated_at) — les états UI (insight_states,
 * ancrés sur la clé stable) survivent. Appelé après chaque run du Worker + CLI locale.
 */


async function fetchWindow(db: Db, start: string, end: string): Promise<Omit<WeekWindow, 'label'>> {
  const [{ data: chd, error: e1 }, { data: ccd, error: e2 }] = await Promise.all([
    db
      .from('chatter_daily')
      .select('chatter_id, date, ca, propose, vendu, presence_active_h, presence_idle_h, reactivite_sec')
      .gte('date', start)
      .lte('date', end),
    db
      .from('chatter_creator_daily')
      .select('chatter_id, creator_id, date, ca')
      .gte('date', start)
      .lte('date', end),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const days: ChatterDayInput[] = (chd ?? []).map((r) => ({
    chatterId: r.chatter_id,
    date: r.date,
    ca: r.ca ?? 0,
    propose: r.propose ?? 0,
    vendu: r.vendu ?? 0,
    presenceActiveH: r.presence_active_h ?? 0,
    presenceIdleH: r.presence_idle_h ?? 0,
    reactiviteSec: r.reactivite_sec,
  }))
  const modelDays: ChatterModelDayInput[] = (ccd ?? []).map((r) => ({
    chatterId: r.chatter_id,
    creatorId: r.creator_id,
    date: r.date,
    ca: r.ca ?? 0,
  }))
  const daysWithData = new Set(days.map((d) => d.date)).size
  return { start, daysWithData, days, modelDays }
}

export async function generateWeeklyInsights(
  db: Db,
): Promise<{ generated: number; weekStart: string }> {
  // Dernier jour ingéré = borne de vérité.
  const { data: mx, error: eMax } = await db
    .from('chatter_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
  if (eMax) throw eMax
  const maxDate = mx?.[0]?.date as string | undefined
  if (!maxDate) return { generated: 0, weekStart: '—' }

  // Semaine évaluée = la semaine COMPLÈTE la plus récente : celle de maxDate si son
  // dimanche est ingéré (cas du run de la nuit dim.→lun. : maxDate = dimanche), sinon la
  // précédente. Ancrer sur maxDate et pas sur l'horloge : le run de 23h05 UTC tourne
  // avant minuit UTC, l'horloge donnerait la bascule avec un jour de retard.
  const maxMonday = mondayOf(maxDate)
  const candidateMonday =
    maxDate >= addDays(maxMonday, 6) ? maxMonday : addDays(maxMonday, -7)
  let evaluatedRaw: Omit<WeekWindow, 'label'> = await fetchWindow(
    db,
    candidateMonday,
    addDays(candidateMonday, 6),
  )
  if (evaluatedRaw.days.length === 0) {
    // Amorçage : aucune semaine complète avec données → semaine de maxDate, partielle.
    evaluatedRaw = await fetchWindow(db, maxMonday, maxDate)
  }
  const evaluated: WeekWindow = { ...evaluatedRaw, label: weekLabel(evaluatedRaw.start) }
  const nextMonday = addDays(evaluated.start, 7)
  // Toujours fournir la fenêtre « semaine en cours », même vide (lundi matin après la
  // bascule : 0 jour ingéré) — la colonne UI reste visible avec un état « en attente ».
  const currentWeek: WeekWindow =
    maxDate >= nextMonday
      ? { ...(await fetchWindow(db, nextMonday, maxDate)), label: weekLabel(nextMonday) }
      : { start: nextMonday, daysWithData: 0, days: [], modelDays: [], label: weekLabel(nextMonday) }

  // Référentiels : noms + quotas par modèle (creators.team_id → quotas).
  const [{ data: chatters }, { data: creators }, { data: quotas }] = await Promise.all([
    db.from('chatters').select('id, display_name'),
    db.from('creators').select('id, name, team_id'),
    db.from('quotas').select('team_id, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur'),
  ])
  const chatterNames = Object.fromEntries((chatters ?? []).map((c) => [c.id, c.display_name ?? '—']))
  const modelNames = Object.fromEntries((creators ?? []).map((c) => [c.id, c.name]))
  const byTeam = new Map(
    (quotas ?? []).map((q) => [
      q.team_id,
      {
        presenceH: q.presence_h,
        reactiviteS: q.reactivite_s,
        mediasProposes: q.medias_proposes,
        convPct: q.conv_pct,
        caEur: q.ca_eur,
      } satisfies QuotaTargets,
    ]),
  )
  const targetsByModel: Record<string, QuotaTargets> = {}
  for (const c of creators ?? []) {
    const t = c.team_id ? byTeam.get(c.team_id) : undefined
    if (t) targetsByModel[c.id] = t
  }

  const drafts = buildQuotaInsights({ evaluated, currentWeek, chatterNames, modelNames, targetsByModel })

  if (drafts.length) {
    const generatedAt = new Date().toISOString()
    const { error } = await db.from('insights').insert(
      drafts.map((d) => ({
        insight_key: d.key,
        generated_at: generatedAt,
        week_start: d.weekStart,
        severity: d.severity,
        chatter_id: d.chatterId,
        title: d.title,
        body: d.body,
        action_plan: d.actionPlan,
        kpis: d.kpis as unknown as Json,
        models: d.models as unknown as Json,
        week: d.week as unknown as Json,
      })),
    )
    if (error) throw error
  }
  return { generated: drafts.length, weekStart: evaluated.start }
}
