import { createAdminClient } from '@glagency/db'
import { startOfMonth, endOfMonth } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { PoliceReport, ReportOption } from '../types'

/**
 * Rapports du soir, filtrables par modèle ou par chatteur (la vue par chatteur donne la valeur,
 * évolution soir après soir). Police NON cloisonné (cf. 0078 — RLS `police_reports_read` = admin OU
 * page Police) : tout porteur de la page voit tous les rapports. Volume potentiellement > 1000
 * lignes (mois / non filtré) → `fetchAll` (anti-troncature silencieuse PostgREST).
 */
export async function getPoliceReports(
  filter: { creatorId?: string; chatterId?: string; day?: string; month?: string },
): Promise<PoliceReport[]> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Requête FRAÎCHE des rapports (rebâtie à chaque page pour `fetchAll`). Ordre DÉTERMINISTE
  // `day desc, id` : requis par la pagination ET utile au regroupement par jour côté historique.
  // Chaîne de `.select()` UNIQUE (littéral) : postgrest-js exige un type littéral pour résoudre
  // l'embed `lines` (sinon fallback silencieux `GenericStringError`, repéré au typecheck).
  const buildReports = (from?: number, to?: number) => {
    let q = supabase
      .from('police_reports')
      .select(
        'id, creator_id, day, ca, non_traitees, absents, alerte, author_id, created_at, lines:police_report_lines(id, chatter_id, a_marche, a_regler)',
      )
      .order('day', { ascending: false })
      .order('id')
    if (filter.creatorId) q = q.eq('creator_id', filter.creatorId)
    // `day` (mono-jour) et `month` (plage du mois) mutuellement exclusifs (la page n'en passe qu'un).
    if (filter.day) q = q.eq('day', filter.day)
    else if (filter.month) q = q.gte('day', startOfMonth(filter.month)).lte('day', endOfMonth(filter.month))
    if (from !== undefined && to !== undefined) q = q.range(from, to)
    return q
  }

  // Jour = borné à une journée → requête simple. Sinon (mois ou non filtré), `police_reports` peut
  // dépasser 1000 lignes → `fetchAll` pagine (anti-troncature silencieuse PostgREST, guideline
  // data-loading). Crucial ici : le filtre chatteur est appliqué en JS APRÈS le fetch — sans
  // pagination, la troncature amputerait des rapports avant même ce filtre.
  const reportsPromise = filter.day ? buildReports() : fetchAll((from, to) => buildReports(from, to))

  const [reportsRes, creatorsRes, profilesRes] = await Promise.all([
    reportsPromise,
    // Résolveurs de noms (client admin) : `fetchAll` — `creators`/`profiles` peuvent dépasser
    // 1000 lignes dans une agence, sinon des noms manqueraient silencieusement (→ « ? »).
    fetchAll((from, to) => admin.from('creators').select('id, name').order('id').range(from, to)),
    fetchAll((from, to) => admin.from('profiles').select('id, display_name').order('id').range(from, to)),
  ])
  if (reportsRes.error) throw new Error(reportsRes.error.message)
  // Résolutions de noms : une erreur technique doit REMONTER (→ Sentry) plutôt que dégrader
  // silencieusement en « ? ». Ces requêtes passent par le client admin → un échec ici est un
  // vrai problème d'infra, pas un cas nominal.
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)

  const creatorName: Record<string, string> = {}
  for (const c of creatorsRes.data ?? []) if (c.id && c.name) creatorName[c.id] = c.name
  // `chatter_id` des lignes = un MEMBRE (profiles) → noms résolus via profiles, comme l'auteur.
  const nameById: Record<string, string> = {}
  for (const p of profilesRes.data ?? []) if (p.id && p.display_name) nameById[p.id] = p.display_name
  const chatterName = nameById
  const authorName = nameById

  return (reportsRes.data ?? [])
    .map((r) => ({
      id: r.id,
      creatorId: r.creator_id,
      creatorName: creatorName[r.creator_id] ?? '?',
      day: r.day,
      ca: r.ca,
      nonTraitees: r.non_traitees,
      absents: r.absents,
      alerte: r.alerte,
      authorName: r.author_id ? (authorName[r.author_id] ?? null) : null,
      authorId: r.author_id ?? null,
      createdAt: r.created_at,
      lines: (r.lines ?? []).map((l) => ({
        id: l.id,
        chatterId: l.chatter_id,
        chatterName: chatterName[l.chatter_id] ?? '?',
        aMarche: l.a_marche,
        aRegler: l.a_regler,
      })),
    }))
    .filter((rep) => !filter.chatterId || rep.lines.some((l) => l.chatterId === filter.chatterId))
}

/** TOUS les modèles de l'agence (Police NON cloisonné, cf. 0078) — client admin (la RLS
 *  `creators_scoped_read` cloisonnerait par modèle assigné, ce qu'on ne veut plus ici). */
export async function getReportOptions(): Promise<ReportOption[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creators').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }))
}

/**
 * Membres role chatteur groupés PAR MODÈLE (assignations `profile_creators`), en UNE passe, via le
 * client admin. Police NON cloisonné (cf. 0078) → TOUS les modèles, aucun filtre par appelant. Clé =
 * `creatorId` ; le formulaire lit `byModel[modèle sélectionné]` côté client (les lignes d'un rapport
 * sur le modèle M = chatteurs assignés à M).
 */
export async function getChattersByModel(): Promise<Record<string, ReportOption[]>> {
  const admin = createAdminClient()
  const [linksRes, profilesRes] = await Promise.all([
    fetchAll((from, to) => admin.from('profile_creators').select('profile_id, creator_id').order('profile_id').order('creator_id').range(from, to)),
    fetchAll((from, to) => admin.from('profiles').select('id, display_name, role').order('id').range(from, to)),
  ])
  if (linksRes.error) throw new Error(linksRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  const chatteurName: Record<string, string> = {}
  for (const p of profilesRes.data ?? []) if (p.role === 'chatteur' && p.id && p.display_name) chatteurName[p.id] = p.display_name
  const byModel: Record<string, ReportOption[]> = {}
  for (const l of linksRes.data ?? []) {
    const name = chatteurName[l.profile_id]
    if (!name) continue // le membre n'est pas un chatteur
    ;(byModel[l.creator_id] ??= []).push({ id: l.profile_id, name })
  }
  for (const k of Object.keys(byModel)) byModel[k].sort((a, b) => a.name.localeCompare(b.name))
  return byModel
}
