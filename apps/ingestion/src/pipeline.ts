import { randomUUID } from 'node:crypto'
import {
  fetchTeamMoney,
  fetchMoneyTeamDay,
  fetchDashboardStats,
  fetchDashboardSubscriptions,
  login,
  type MoneyTeamDay,
} from '@glagency/mypuls'
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  dayChecks,
  expectedDayTotals,
  identityIssueRow,
  resolveDayIdentity,
  summarizeRun,
  type IngestDayResult,
  type IngestRunSummary,
} from '@glagency/core'
import { decodeEntities, normLabel } from './norm'

type Db = ReturnType<typeof createAdminClient>
/** Récupère+parse la page money-team d'un jour. Injectable : Node=cheerio, Worker=HTMLRewriter. */
type FetchMoneyTeam = (day: string, cookie: string) => Promise<MoneyTeamDay>

/** Dépendances runtime injectables (défauts = implémentations Node/cheerio). */
export interface PipelineDeps {
  fetchMoneyTeam?: FetchMoneyTeam
  /**
   * Cap de la fenêtre de rattrapage (défaut MAX_CATCHUP=60, OK en Node). Le Worker doit
   * passer une valeur BASSE : le plan Free plafonne à 50 sous-requêtes/invocation.
   * Estimation à la lecture du code (2026-10-05), À MESURER EN RECETTE :
   *  - par jour ≈ 13 à 15 : `/team/money` paginé par 100 lignes (≈ 5 pour 400-500 lignes, 408
   *    le 11/09), 2 money-team (page + fragment résumé), 1 upsert creator_daily, 2 + 2 pour
   *    chatter_daily et chatter_creator_daily (delete + insert), 1 `finish_chatter_day`, et 0 à 2
   *    si fiches ou alias neufs ;
   *  - fixe ≈ 8 ici (creators, sonde 0183, chatters, alias, fiches reliées, max(date), 2 séries
   *    dashboard), plus ce que le Worker ajoute autour (session, ingest_runs, insights, Sentry :
   *    worker.ts).
   * Un rattrapage de 3 jours (≈ 40-45 rien qu'en jours) approche ou dépasse donc le plafond ;
   * au-delà, les fetch suivants échouent (y compris ingest_runs et Sentry). Le rattrapage étant
   * auto-cicatrisant nuit après nuit, un cap bas se résorbe seul.
   */
  maxCatchup?: number
  /**
   * Cookie de session MyPuls déjà obtenu (worker : `refreshCookie()`, auto-renouvelé, 0109).
   * Fourni → on ne re-login pas ici. Absent → fallback `login()` (cookie env / mot de passe).
   */
  cookie?: string
}

/**
 * Pipeline quotidien → upsert creator_daily. Sources par ordre de priorité :
 * dashboard/stats + dashboard/subscriptions (session web : CA complet ventilé + nouveaux
 * abonnés + abonnés actifs), fallback /team/money (API : messagerie seule) si le dashboard
 * est indisponible. Idempotent (upsert `creator_id,date`). Auto-cicatrisant : sans argument,
 * rattrape depuis le dernier jour connu (souvent partiel) jusqu'à aujourd'hui.
 * Écrit aussi le brut dans apps/ingestion/raw/<date>.json.
 *
 * Attribution par chatteur : depuis le dashboard money-team (session web). Chaque vente y porte
 * l'id MyPuls de son compte (bouton « Éditer ») → fiche résolue PAR ID, puis trois contrôles de
 * fiabilité par jour (spec 2026-10-01-identite-chatteur-mypuls). Cf. ingestChatterDay.
 *
 * TODO (suite) : runRules → insights.
 */

const PRIV: Record<string, string> = {
  alice_prvv: 'Alice (privé)',
  carlaprive: 'Carla (privé)',
  juliepvv: 'Julie (privé)',
}
const MAX_CATCHUP = 60
const round = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

// Normalisation d'un label scrapé → clé de rapprochement `chatter_alias` : voir norm.ts
// (extraite pour être partagée avec le scrape spenders — même clé de résolution partout).

/** Valeurs dashboard d'un (modèle, jour) : CA ventilé (€) + abonnés (comptes). */
interface DashDay {
  ca: number
  ppv: number
  tips: number
  renew: number
  newSubs: number
  renewals: number
  subsActive: number
}

/**
 * Séries dashboard sur [from..to] (bornes incluses) → Map<date, Map<nom modèle, DashDay>>.
 * `+=` partout : plusieurs pseudos MyPuls peuvent pointer vers le même modèle.
 */
async function fetchDashboardRange(
  from: string,
  to: string,
  cookie: string,
  resolveCreator: (creatorId: number, label: string) => string | null,
): Promise<Map<string, Map<string, DashDay>>> {
  const [stats, subs] = await Promise.all([
    fetchDashboardStats(from, to, cookie),
    fetchDashboardSubscriptions(from, to, cookie),
  ])
  const out = new Map<string, Map<string, DashDay>>()
  const entry = (date: string, name: string): DashDay => {
    let m = out.get(date)
    if (!m) {
      m = new Map()
      out.set(date, m)
    }
    let e = m.get(name)
    if (!e) {
      e = { ca: 0, ppv: 0, tips: 0, renew: 0, newSubs: 0, renewals: 0, subsActive: 0 }
      m.set(name, e)
    }
    return e
  }
  for (const ds of stats.datasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    stats.labels.forEach((date, i) => {
      const e = entry(date, name)
      e.ca += ds.data[i] ?? 0
      e.ppv += ds.breakdown.ppv?.[i] ?? 0
      e.tips += ds.breakdown.tips?.[i] ?? 0
      e.renew += ds.breakdown.renew?.[i] ?? 0
    })
  }
  for (const ds of subs.newSubsDatasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    subs.labels.forEach((date, i) => {
      const e = entry(date, name)
      e.newSubs += ds.data[i] ?? 0
      e.renewals += ds.renewals?.[i] ?? 0
    })
  }
  for (const ds of subs.totalSubsDatasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    subs.labels.forEach((date, i) => {
      entry(date, name).subsActive += ds.data[i] ?? 0
    })
  }
  return out
}

/** État d'identité d'un run : lu une fois en tête, mis à jour au fil des écritures de chaque jour. */
interface IdentityCtx {
  nameToChatter: Map<string, string>
  aliasToChatter: Map<string, string>
  emailToChatter: Map<string, string>
  chatterByMypulsId: Map<string, string>
  mypulsIdByChatter: Map<string, string | null>
  linkedChatters: Set<string>
  /** `normLabel` mémoïsé pour tout le run (budget CPU du Worker) : même résultat, calculé une fois par libellé. */
  norm: (s: string) => string
}

/** `normLabel` mémoïsé : fonction pure, le cache (un par run, jamais global au Worker) ne change aucun résultat. */
function memoNorm(): (s: string) => string {
  const cache = new Map<string, string>()
  return (s) => {
    let v = cache.get(s)
    if (v === undefined) {
      v = normLabel(s)
      cache.set(s, v)
    }
    return v
  }
}

/** Retour de `finish_chatter_day` (0183) — `Returns: Json`, contrat local documenté. */
interface FinishDay {
  status: 'ok' | 'a_verifier'
  checks: { code: string; ok: boolean; detail: string }[]
  refused: { chatter_id: string; mypuls_user_id: string }[]
}

/** Retour de `finish_chatter_day` lu tel quel : une forme inattendue est une ERREUR, jamais un verdict par défaut. */
function finishDayOf(day: string, data: unknown): FinishDay {
  const d = data as Partial<FinishDay> | null
  if (!d || (d.status !== 'ok' && d.status !== 'a_verifier') || !Array.isArray(d.checks) || !Array.isArray(d.refused)) {
    throw new Error(`${day} : réponse inattendue de finish_chatter_day — ${String(JSON.stringify(data)).slice(0, 200)}`)
  }
  return d as FinishDay
}

/**
 * Garde de déploiement : la migration 0183 (`ingest_day_checks`, `finish_chatter_day`…) est-elle en
 * base ? Sans elle, le relevé chatteurs écrirait ses chiffres puis échouerait à `finish_chatter_day` :
 * des jours écrits, jamais contrôlés. On le SUSPEND donc pour tout le run (creator_daily continue).
 * UNE lecture, aucune écriture : la table et la RPC naissent de la même migration. Rend null si 0183
 * est là, le motif si la table est ABSENTE. Toute autre erreur (passagère) LÈVE : le run échoue avant
 * toute écriture, et le rattrapage de la nuit suivante reprend ces jours — suspendre ici laisserait
 * des jours chatteurs vides que le rattrapage (reparti du dernier creator_daily) ne revisiterait pas.
 */
async function migration0183Missing(db: Db): Promise<string | null> {
  const { error } = await db.from('ingest_day_checks').select('day').limit(1)
  if (!error) return null
  // PGRST205 : table absente du cache de schéma (PostgREST ≥ 12.2) ; 42P01 : relation inexistante (avant).
  if (error.code === 'PGRST205' || error.code === '42P01') return 'migration 0183 absente : relevé chatteurs suspendu'
  throw new Error(`sonde de la migration 0183 (ingest_day_checks) en échec : ${error.message}`)
}

/**
 * Attribution par chatteur d'un jour, depuis le dashboard money-team (session web) :
 * résumé → chatter_daily, ventes → chatter_creator_daily. Fiche de chaque ligne : l'id MyPuls
 * d'abord (`resolveDayIdentity`). Puis UN appel `finish_chatter_day` : ids, anomalies et les
 * trois contrôles de fiabilité du jour, persistés (spec § 2-3).
 */
async function ingestChatterDay(
  db: Db,
  day: string,
  cookie: string,
  ctx: IdentityCtx,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
  fetchMoneyTeam: FetchMoneyTeam,
  /** CA PPV + pourboires du jour selon l'API (creator_daily), en centimes : total indépendant de la page. */
  apiCaCents: number | null,
): Promise<{
  chatterRows: number
  pairRows: number
  newChatterNames: string[]
  droppedTx: string[]
  reliabilityAlerts: string[]
  /** Avertissements techniques qui ne dégradent PAS le run (journal ingest_runs seulement). */
  warnings: string[]
}> {
  const mt = await fetchMoneyTeam(day, cookie)
  const warnings: string[] = []
  // Annuaire des équipes (JSON `assignableUsersByCreator`) : libellé d'un compte DANS l'équipe de chaque
  // modèle. Absent alors que la page a des ventes = markup changé (spec : « JSON absent → warning »). Les
  // ventes portent leur id, donc rien n'est faux : averti, pas dégradé.
  if (mt.transactions.length && !mt.directory.some((d) => d.source === 'assignable')) {
    warnings.push(
      `${day} : annuaire des équipes MyPuls (JSON assignableUsersByCreator) absent ou illisible sur une page à ${mt.transactions.length} vente(s) — markup changé ? (avertissement, pas une dégradation)`,
    )
  }

  // Un SEUL chemin de fabrication du libellé (décodage entités + trim) : la résolution utilise
  // la même clé que l'enregistrement — sinon un libellé à entité HTML se perd.
  const labelOf = (s: string) => decodeEntities(s).trim()
  // CA d'une ligne de résumé = PPV + tips, PAS la colonne « CA Total » lue : la même valeur que
  // `summary_cents` (expectedDayTotals) et que chatter_daily.ca (CHECK) — l'invariant par compte (a)
  // et b1 (en base) comparent ainsi la même chose.
  const summary = mt.chatters.map((c) => ({ label: labelOf(c.name), ca: c.caPpv + c.caTips }))
  const sales = mt.transactions.map((t) => ({ label: labelOf(t.chatter), mypulsUserId: t.mypulsUserId, amount: t.amount }))
  const idn = resolveDayIdentity({
    day,
    summary,
    sales,
    directory: mt.directory.map((d) => ({ mypulsUserId: d.mypulsUserId, label: labelOf(d.label) })),
    state: {
      chatterByMypulsId: ctx.chatterByMypulsId,
      mypulsIdByChatter: ctx.mypulsIdByChatter,
      aliasOf: (n: string) => ctx.aliasToChatter.get(n),
      byName: (raw: string) => ctx.nameToChatter.get(raw),
      byEmail: (n: string) => ctx.emailToChatter.get(n),
      linkedChatters: ctx.linkedChatters,
    },
    norm: ctx.norm,
    newId: randomUUID,
  })
  // Totaux attendus sur TOUTES les lignes lues, AVANT toute mise de côté : c'est ce qui fait échouer
  // b1/b2 (calculés en base) quand une ligne n'est pas écrite. Montant net de la page = Σ de TOUTES
  // les cartes « Montant net · <devise> » : tout le CA est en euros (décision de Benoit, 2026-09-21),
  // même une carte étiquetée USD (Carla, 3623). Aucune carte → null → b_total_page échoue (D12).
  const expected = expectedDayTotals({
    summary: mt.chatters,
    sales: mt.transactions,
    page: {
      salesCount: mt.pageTotals.salesCount,
      net: mt.pageTotals.net.length ? mt.pageTotals.net.reduce((s, n) => s + n.amount, 0) : null,
    },
  })
  // Contrôles calculés AVANT toute mise à jour de l'état : `mypulsIdOf` doit lire l'état d'avant le jour.
  const checks = dayChecks({
    summary,
    sales,
    identity: idn,
    mypulsIdOf: (id) => ctx.mypulsIdByChatter.get(id) ?? null,
    expected,
    apiCaCents,
  })

  // Fiches et alias neufs. L'état du run suit CHAQUE écriture dès qu'elle a réussi : si la suite du
  // jour échoue, les jours suivants voient quand même ces fiches et ces alias (sinon : fiche en
  // double, alias repointé par l'upsert).
  if (idn.newChatters.length) {
    const { error } = await db.from('chatters').insert(
      idn.newChatters.map((c) => ({
        id: c.id,
        display_name: c.displayName,
        mypuls_user_id: c.mypulsUserId,
        active: true,
        access_revoked: false,
      })),
    )
    if (error) throw error
    for (const c of idn.newChatters) {
      // Un nom déjà connu garde sa fiche (homonyme créé pour un autre id), comme l'ancien code.
      if (!ctx.nameToChatter.has(c.displayName)) ctx.nameToChatter.set(c.displayName, c.id)
      ctx.mypulsIdByChatter.set(c.id, c.mypulsUserId)
      if (c.mypulsUserId) ctx.chatterByMypulsId.set(c.mypulsUserId, c.id)
    }
  }
  if (idn.newAliases.length) {
    const { error } = await db.from('chatter_alias').upsert(
      idn.newAliases.map((a) => ({
        chatter_id: a.chatterId,
        raw_label: a.rawLabel,
        raw_label_norm: a.rawLabelNorm,
        source: 'scrape',
      })),
      { onConflict: 'raw_label' },
    )
    if (error) throw error
    for (const a of idn.newAliases) ctx.aliasToChatter.set(a.rawLabelNorm, a.chatterId)
  }

  // chatter_daily — agrégé par chatter_id (deux lignes résumé peuvent viser le même chatteur via
  // une variante de libellé). ca = ppv + tips → respecte le CHECK. Une ligne sans fiche sûre
  // (libellé à plusieurs comptes non départagé, membres multiples) n'est PAS écrite : b1 la voit.
  const cdAgg = new Map<
    string,
    { ppv: number; tips: number; propose: number; vendu: number; react: number[] }
  >()
  mt.chatters.forEach((c, i) => {
    const cid = idn.summaryChatter[i]
    if (!cid) return
    const a = cdAgg.get(cid) ?? { ppv: 0, tips: 0, propose: 0, vendu: 0, react: [] }
    a.ppv += c.caPpv
    a.tips += c.caTips
    a.propose += c.propose
    a.vendu += c.vendu
    if (c.reactiviteSec != null) a.react.push(c.reactiviteSec)
    cdAgg.set(cid, a)
  })
  const cdRows = [...cdAgg.entries()].map(([chatter_id, a]) => {
    const ppv = round(a.ppv)
    const tips = round(a.tips)
    return {
      chatter_id,
      date: day,
      ca: round(ppv + tips),
      ca_ppv: ppv,
      ca_tips: tips,
      propose: a.propose,
      vendu: a.vendu,
      // `null` et NON 0 : le tableau MyPuls a perdu sa colonne « Présence » le 2026-09-03 (0149).
      // 0 se lirait « n'a pas travaillé » sur l'onglet Chatteurs, qui affiche « — » sur null.
      presence_active_h: null,
      presence_idle_h: null,
      reactivite_sec: a.react.length
        ? Math.round(a.react.reduce((s, x) => s + x, 0) / a.react.length)
        : null,
    }
  })
  // Remplacement par jour : chatter_daily reflète UNIQUEMENT le résumé lu. Gardé par la longueur du
  // RÉSUMÉ LU, pas des lignes écrites : un scrape vide ne vide rien (b1 le signale), mais un résumé
  // dont toutes les lignes sont mises de côté vide bien le jour — d'anciennes lignes restées en
  // base pourraient sinon faire passer b1.
  if (mt.chatters.length) {
    const del = await db.from('chatter_daily').delete().eq('date', day)
    if (del.error) throw del.error
    if (cdRows.length) {
      const { error } = await db.from('chatter_daily').insert(cdRows)
      if (error) throw error
    }
  }

  // chatter_creator_daily : agrège les ventes par (chatteur, modèle).
  const pair = new Map<
    string,
    { chatter_id: string; creator_id: string; ca: number; ppv: number; tips: number; vendu: number }
  >()
  // Raison → montant écarté. Invariant : jamais silencieux (journal), et b2 (en base) échoue.
  // Une vente sans fiche sûre (id MyPuls aux membres multiples, sans fiche par libellé) est
  // écartée comme une vente de modèle inconnu : JAMAIS écrite sur une fiche devinée.
  const dropped = new Map<string, number>()
  mt.transactions.forEach((t, i) => {
    const cid = idn.saleChatter[i]
    const cname = pseudoToName(t.creator)
    const crid = cname ? nameToId.get(cname) : undefined
    if (!cid || !crid) {
      const label = labelOf(t.chatter) || '(vide)'
      const reason = cid
        ? `modèle inconnu « ${t.creator} »`
        : t.mypulsUserId
          ? `id MyPuls ${t.mypulsUserId} « ${label} » sans fiche sûre`
          : `chatteur non résolu « ${label} »`
      dropped.set(reason, (dropped.get(reason) ?? 0) + t.amount)
      return
    }
    const key = `${cid}|${crid}`
    const p = pair.get(key) ?? { chatter_id: cid, creator_id: crid, ca: 0, ppv: 0, tips: 0, vendu: 0 }
    p.ca += t.amount
    if (t.type === 'Média privé') {
      p.ppv += t.amount
      p.vendu += 1
    } else if (t.type === 'Pourboires') p.tips += t.amount
    pair.set(key, p)
  })
  const ccdRows = [...pair.values()].map((p) => ({
    chatter_id: p.chatter_id,
    creator_id: p.creator_id,
    date: day,
    ca: round(p.ca),
    ca_ppv: round(p.ppv),
    ca_tips: round(p.tips),
    propose: 0,
    vendu: p.vendu,
  }))
  // Même garde que chatter_daily, sur les ventes LUES (toutes écartées → le jour est vidé, b2 échoue).
  if (mt.transactions.length) {
    const del = await db.from('chatter_creator_daily').delete().eq('date', day)
    if (del.error) throw del.error
    if (ccdRows.length) {
      const { error } = await db.from('chatter_creator_daily').insert(ccdRows)
      if (error) throw error
    }
  }

  // Fin de journée, APRÈS les écritures : ids + anomalies + contrôles b1/b2 EN BASE + verdict
  // persisté. UN appel par jour (budget Worker). Une erreur remonte : jour en échec, run dégradé.
  // Anomalies : une par clé, garanti par `resolveDayIdentity` (la RPC garderait sinon la dernière).
  const { data, error } = await db.rpc('finish_chatter_day', {
    p_day: day,
    p_links: idn.links.map((l) => ({ chatter_id: l.chatterId, mypuls_user_id: l.mypulsUserId })),
    p_issues: idn.issues.map((i) => identityIssueRow(i, 'ingestion')),
    p_expected: expected,
    p_checks: checks,
  })
  if (error) throw error
  const fin = finishDayOf(day, data)

  // Ids posés : l'état du run les suit (un lien refusé par la base n'y entre pas).
  const refusedKeys = new Set(fin.refused.map((r) => `${r.chatter_id}|${r.mypuls_user_id}`))
  for (const l of idn.links) {
    if (refusedKeys.has(`${l.chatterId}|${l.mypulsUserId}`)) continue
    ctx.chatterByMypulsId.set(l.mypulsUserId, l.chatterId)
    ctx.mypulsIdByChatter.set(l.chatterId, l.mypulsUserId)
  }

  const failed = fin.checks.filter((c) => c.ok !== true)
  console.log(
    `[ingestion] ${day}: money-team → ${cdRows.length} chatteurs, ${ccdRows.length} paires — fiabilité ${fin.status}`,
  )
  return {
    chatterRows: cdRows.length,
    pairRows: ccdRows.length,
    newChatterNames: idn.newChatters.map((c) => c.displayName),
    droppedTx: [...dropped.entries()].map(([reason, amount]) => `${reason} : ${amount.toFixed(2)} €`),
    reliabilityAlerts: [
      ...idn.technical,
      ...failed.map((c) => `${day} : contrôle ${c.code} en échec — ${c.detail}`),
      // Filet : « à vérifier » sans contrôle en échec lisible ne doit pas passer pour un jour sain.
      ...(fin.status === 'a_verifier' && failed.length === 0
        ? [`${day} : jour « à vérifier » sans contrôle en échec lisible — voir ingest_day_checks`]
        : []),
    ],
    warnings,
  }
}

/**
 * `creator_daily` d'un jour : dashboard prioritaire (CA complet ventilé + abonnés),
 * `/team/money` (API) en fallback par modèle. Union des modèles vus par les deux sources.
 */
async function ingestCreatorDay(
  db: Db,
  day: string,
  dash: Map<string, Map<string, DashDay>> | null,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
): Promise<{ rows: number; source: 'dashboard' | 'api'; caCents: number }> {
  const tx = await fetchTeamMoney(day)
  const agg = new Map<string, { ca: number; ppv: number; tips: number; renew: number }>()
  for (const t of tx) {
    const name = pseudoToName(t.creator)
    if (!name) continue
    const a = agg.get(name) ?? { ca: 0, ppv: 0, tips: 0, renew: 0 }
    const amt = Number(t.amount) || 0
    a.ca += amt
    if (t.type === 'Média privé') a.ppv += amt
    else if (t.type === 'Pourboires') a.tips += amt
    else if (t.type === 'Renouvellement abonnement') a.renew += amt
    agg.set(name, a)
  }
  const dd = dash?.get(day)
  const names = new Set([...agg.keys(), ...(dd?.keys() ?? [])])
  const rows = [...names]
    .filter((n) => nameToId.has(n))
    .map((n) => {
      const a = agg.get(n)
      const d = dd?.get(n)
      return {
        creator_id: nameToId.get(n)!,
        date: day,
        ca: round(d ? d.ca : (a?.ca ?? 0)),
        ca_ppv: round(d ? d.ppv : (a?.ppv ?? 0)),
        ca_tips: round(d ? d.tips : (a?.tips ?? 0)),
        ca_renew: round(d ? d.renew : (a?.renew ?? 0)),
        subs_active: d?.subsActive ?? 0,
        new_subs: d?.newSubs ?? 0,
        renew_subs: d?.renewals ?? 0,
      }
    })
  if (rows.length) {
    const { error } = await db.from('creator_daily').upsert(rows, { onConflict: 'creator_id,date' })
    if (error) throw error
  }
  const subsTotal = rows.reduce((s, r) => s + r.new_subs, 0)
  console.log(
    `[ingestion] ${day}: ${tx.length} tx → ${rows.length} modèles (${dd ? 'dashboard' : 'api'}, +${subsTotal} subs)`,
  )
  // CA PPV + pourboires du jour écrit dans creator_daily, en centimes : le total INDÉPENDANT de la page
  // money-team que `dayChecks` oppose à un jour servi vide (b_total_page).
  const caCents = rows.reduce((s, r) => s + Math.round(r.ca_ppv * 100) + Math.round(r.ca_tips * 100), 0)
  return { rows: rows.length, source: dd ? 'dashboard' : 'api', caCents }
}

/**
 * État d'identité du run : fiches, alias, e-mails, ids MyPuls et fiches reliées à un membre, lus une
 * fois en tête de run puis mis à jour au fil des écritures de chaque jour (`ingestChatterDay`).
 */
async function loadIdentity(db: Db): Promise<IdentityCtx> {
  // Ces selects sont le SOCLE de la résolution d'identité : un échec silencieux donnerait des
  // maps vides → duplication massive + re-pointage des alias. On THROW. fetchAll : un select nu
  // tronqué à 1000 lignes donnerait des maps INCOMPLÈTES (pas vides) → le garde-fou ne verrait
  // rien passer.
  const { data: chatterRows, error: chattersErr } = await fetchAll((f, t) =>
    db.from('chatters').select('id, display_name, email, mypuls_user_id').order('id').range(f, t),
  )
  if (chattersErr) throw chattersErr
  // Une seule normalisation pour tout le run : chargement ET résolution de chaque jour.
  const norm = memoNorm()
  const nameToChatter = new Map<string, string>()
  const emailToChatter = new Map<string, string>()
  const chatterByMypulsId = new Map<string, string>()
  const mypulsIdByChatter = new Map<string, string | null>()
  for (const c of chatterRows ?? []) {
    if (c.display_name) nameToChatter.set(c.display_name.trim(), c.id)
    // Les pages money-team étiquettent parfois par EMAIL (constaté sur juin) : repli
    // de rapprochement label → email connu, à la même normalisation que les alias.
    if (c.email) emailToChatter.set(norm(c.email), c.id)
    mypulsIdByChatter.set(c.id, c.mypuls_user_id ?? null)
    if (c.mypuls_user_id) chatterByMypulsId.set(c.mypuls_user_id, c.id)
  }
  // fetchAll : même socle d'identité — chatter_alias grossit à chaque nouveau libellé
  // scrapé jamais vu (bootstrap), aucune borne native.
  const { data: aliasRows, error: aliasErr } = await fetchAll((f, t) =>
    db.from('chatter_alias').select('chatter_id, raw_label_norm').order('id').range(f, t),
  )
  if (aliasErr) throw aliasErr
  const aliasToChatter = new Map<string, string>()
  // Re-normalise les norms STOCKÉS (posés avant le durcissement de normLabel — emojis,
  // apostrophes) : la clé du map suit toujours la normalisation courante.
  for (const a of aliasRows ?? []) aliasToChatter.set(norm(a.raw_label_norm), a.chatter_id)
  // Fiches reliées à un membre : celles que la paie lit. Entre deux fiches candidates pour un même
  // id, c'est elle qui le reçoit (spec § 2). +1 sous-requête par run (`chatter_id` est unique, 0079).
  const { data: linkedRows, error: linkedErr } = await fetchAll((f, t) =>
    db.from('profiles').select('chatter_id').not('chatter_id', 'is', null).order('chatter_id').range(f, t),
  )
  if (linkedErr) throw linkedErr
  return {
    nameToChatter,
    aliasToChatter,
    emailToChatter,
    chatterByMypulsId,
    mypulsIdByChatter,
    linkedChatters: new Set(linkedRows.flatMap((p) => (p.chatter_id ? [p.chatter_id] : []))),
    norm,
  }
}

export async function runPipeline(explicitDay?: string, deps: PipelineDeps = {}): Promise<IngestRunSummary> {
  const startedMs = Date.now()
  const warnings: string[] = []
  const fetchMoneyTeam = deps.fetchMoneyTeam ?? fetchMoneyTeamDay
  const db = createAdminClient()

  const { data: creators, error } = await db
    .from('creators')
    .select('id, name, is_private, mypuls_creator_id')
  if (error) throw error
  const nameToId = new Map((creators ?? []).map((c) => [c.name as string, c.id as string]))
  // Tri longueur décroissante : un pseudo peut contenir plusieurs noms (« juliette_mims »
  // contient « Julie » ET « Juliette ») — le match le plus long doit gagner, pas l'ordre du select.
  const mains = (creators ?? [])
    .filter((c) => !c.is_private)
    .map((c) => c.name as string)
    .sort((a, b) => b.length - a.length)
  const pseudoToName = (pseudo: string): string | null => {
    const p = (pseudo || '').toLowerCase()
    return PRIV[p] ?? mains.find((n) => p.includes(n.toLowerCase())) ?? null
  }

  // Garde de déploiement (spec 2026-10-01, ordre de mise en prod) : sans 0183, AUCUNE écriture côté
  // chatteurs (chatter_daily, chatter_creator_daily, fiches, alias) pour tout le run — ni lecture de
  // la money-team ni de l'état d'identité. creator_daily continue comme avant ; le run est dégradé.
  const suspended = await migration0183Missing(db)
  if (suspended) console.warn(`[ingestion] ${suspended}`)

  // Résolution modèle : par mypuls_creator_id (déterministe) sinon par pseudo (fallback) + backfill
  // de l'id → dès le 2e run le mapping est stable même si le pseudo affiché change.
  const idToName = new Map<string, string>()
  for (const c of creators ?? []) {
    if (c.mypuls_creator_id) idToName.set(c.mypuls_creator_id, c.name as string)
  }
  const creatorBackfill = new Map<string, string>() // nom modèle → mypuls_creator_id à persister
  const resolveCreator = (creatorId: number, label: string): string | null => {
    const byId = idToName.get(String(creatorId))
    if (byId) return byId
    const byName = pseudoToName(label)
    if (byName && nameToId.has(byName) && !idToName.has(String(creatorId))) {
      creatorBackfill.set(byName, String(creatorId))
    }
    return byName
  }

  // Session web pour l'attribution par chatteur (dashboard money-team). Optionnelle :
  // si le login échoue, on ingère quand même creator_daily (API) sans casser le run.
  // Cookie injecté (worker auto-renouvelé) prioritaire ; sinon fallback login().
  let cookie: string | null = deps.cookie ?? null
  if (!cookie) {
    try {
      cookie = (await login()).cookie
    } catch (e) {
      warnings.push(`login money-team échoué → chatteurs ignorés : ${(e as Error).message}`)
      console.warn('[ingestion] login money-team échoué → chatteurs ignorés :', (e as Error).message)
    }
  }
  const identity = suspended ? null : await loadIdentity(db)

  const today = iso(new Date())
  const yesterday = addDays(today, -1)
  let days: string[]
  if (explicitDay) {
    days = [explicitDay]
  } else {
    const { data: mx } = await db
      .from('creator_daily')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
    const last = (mx?.[0]?.date as string | undefined) ?? undefined
    // Le cron tourne APRÈS minuit Paris : le dernier jour en base est déjà COMPLET —
    // on repart au jour SUIVANT (décision 2026-07-03 ; l'ancienne re-capture datait du
    // cron d'avant-minuit qui capturait une journée en cours). Le rattrapage couvre
    // toujours les nuits sautées (last+1 → today).
    const start = last ? addDays(last, 1) : yesterday
    const all: string[] = []
    for (let d = start; d <= today; d = addDays(d, 1)) all.push(d)
    // Fenêtre vide (run relancé alors qu'aujourd'hui est déjà en base) : re-scrape
    // d'aujourd'hui (idempotent) plutôt qu'un run à zéro jour marqué degraded à tort.
    if (all.length === 0) all.push(today)
    // ⚠️ Tronquer côté ANCIEN (slice(0, N)) : le prochain run repart de max(date) — si on
    // gardait les jours récents, les anciens deviendraient des trous définitifs (max(date)
    // aurait déjà avancé) ; en gardant les anciens, la fenêtre avance jusqu'à résorption.
    days = all.slice(0, deps.maxCatchup ?? MAX_CATCHUP)
    if (days.length < all.length) {
      warnings.push(
        `rattrapage tronqué à ${days.length} jour(s) sur ${all.length} en retard (cap sous-requêtes Worker) — reprendra à ${days[days.length - 1]}+1 au prochain run`,
      )
    }
  }

  // Séries dashboard (CA ventilé + abonnés) en une passe pour toute la fenêtre.
  const [first, last] = [days[0], days[days.length - 1]]
  let dash: Map<string, Map<string, DashDay>> | null = null
  if (cookie && first && last) {
    try {
      dash = await fetchDashboardRange(first, last, cookie, resolveCreator)
      console.log(`[ingestion] dashboard: séries ${first} → ${last} OK`)
      // Persiste les ids résolus par fallback pseudo → runs suivants déterministes.
      for (const [name, mypulsId] of creatorBackfill) {
        const id = nameToId.get(name)
        if (!id) continue
        await db.from('creators').update({ mypuls_creator_id: mypulsId }).eq('id', id).is('mypuls_creator_id', null)
        idToName.set(mypulsId, name)
      }
      if (creatorBackfill.size) {
        console.log(`[ingestion] mypuls_creator_id backfill : ${creatorBackfill.size} modèle(s)`)
      }
    } catch (e) {
      warnings.push(`dashboard indisponible → fallback /team/money : ${(e as Error).message}`)
      console.warn('[ingestion] dashboard indisponible → fallback /team/money :', (e as Error).message)
    }
  }

  const dayResults: IngestDayResult[] = []
  for (const day of days) {
    // Un jour qui échoue (429/500, session…) ne doit pas avorter le rattrapage des autres.
    const result: IngestDayResult = { date: day, creatorRows: 0, chatterRows: 0, pairRows: 0, source: 'api' }
    try {
      const creator = await ingestCreatorDay(db, day, dash, nameToId, pseudoToName)
      result.creatorRows = creator.rows
      result.source = creator.source
      if (cookie && identity) {
        const chatter = await ingestChatterDay(
          db, day, cookie, identity, nameToId, pseudoToName, fetchMoneyTeam, creator.caCents,
        )
        result.chatterRows = chatter.chatterRows
        result.pairRows = chatter.pairRows
        result.reliabilityAlerts = chatter.reliabilityAlerts.length
        if (chatter.newChatterNames.length) {
          warnings.push(`${day} : nouveau(x) chatteur(s) créé(s) — ${chatter.newChatterNames.join(', ')}`)
        }
        // Invariant : aucune transaction ne disparaît en silence — si la ventilation en a écarté
        // (chatteur non résolu, fiche incertaine, modèle inconnu), on le crie dans le journal.
        if (chatter.droppedTx.length) {
          warnings.push(`${day} : transactions NON ventilées — ${chatter.droppedTx.join(' · ')}`)
        }
        warnings.push(...chatter.reliabilityAlerts, ...chatter.warnings)
      }
    } catch (e) {
      result.error = (e as Error).message
      console.warn(`[ingestion] jour ${day} échoué (ignoré, on continue) :`, (e as Error).message)
    }
    dayResults.push(result)
  }

  return summarizeRun({
    loginOk: cookie !== null,
    dashboardOk: dash !== null,
    // Rejeu explicite d'un jour : les règles « zéro ligne » ne s'appliquent pas
    // (un vieux jour légitimement vide n'est pas une dégradation).
    catchup: !explicitDay,
    days: dayResults,
    warnings,
    durationMs: Date.now() - startedMs,
    // Jours dont les chatteurs n'ont PAS été relevés : à rejouer une fois 0183 appliquée (rien n'est perdu
    // côté MyPuls, mais le rattrapage de nuit ne revient pas dessus — il repart du dernier creator_daily).
    chatterSuspended: suspended
      ? `${suspended} — chatteurs non relevés ${first === last ? `le ${first}` : `du ${first} au ${last}`} : à rejouer jour par jour (pnpm ingest <jour>) une fois 0183 appliquée`
      : null,
  })
}
