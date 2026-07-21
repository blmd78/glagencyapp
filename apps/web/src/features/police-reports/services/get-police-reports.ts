import { createAdminClient } from '@glagency/db'
import { startOfMonth, endOfMonth } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Profile } from '@/lib/auth'
import type { PoliceReport, ReportOption } from '../types'

/**
 * Périmètre MODÈLES de l'appelant : `null` pour un admin (tout), sinon l'ensemble des
 * `creator_id` de `profile_creators`. Source unique du cloisonnement (lecture + écriture +
 * options), alignée sur la RLS `creators_scoped_read` (0057). NE PAS utiliser
 * `getChatterScope.creatorIds` (dérivé de `chatter_creators`, écarte les modèles sans chatteur).
 */
export async function assignedCreatorIds(profile: Profile): Promise<Set<string> | null> {
  if (profile.role === 'admin') return null // couvre admin + superadmin (mappés 'admin')
  const supabase = await createClient()
  const { data, error } = await supabase.from('profile_creators').select('creator_id').eq('profile_id', profile.id)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.creator_id))
}

/**
 * Rapports lisibles par l'appelant, cloisonnés à SES modèles (admin = tout), filtrables par
 * modèle ou par chatteur — la vue par chatteur donne la valeur (évolution soir après soir).
 * Cloisonnement par modèle = ENFORCÉ EN RLS (`police_reports_read`, migration 0074 : profile_creators) ;
 * le `.filter(inScope)` ci-dessous n'est plus que la couche optimiste. Volume potentiellement
 * > 1000 lignes (mois / non filtré) → `fetchAll` (anti-troncature silencieuse PostgREST).
 */
export async function getPoliceReports(
  profile: Profile,
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

  const [scope, reportsRes, creatorsRes, chattersRes, profilesRes] = await Promise.all([
    assignedCreatorIds(profile),
    reportsPromise,
    // Résolveurs de noms (client admin) : `fetchAll` — `chatters`/`profiles` peuvent dépasser
    // 1000 lignes dans une agence, sinon des noms manqueraient silencieusement (→ « ? »).
    fetchAll((from, to) => admin.from('creators').select('id, name').order('id').range(from, to)),
    fetchAll((from, to) => admin.from('chatters').select('id, display_name').order('id').range(from, to)),
    fetchAll((from, to) => admin.from('profiles').select('id, display_name').order('id').range(from, to)),
  ])
  if (reportsRes.error) throw new Error(reportsRes.error.message)
  // Résolutions de noms : une erreur technique doit REMONTER (→ Sentry) plutôt que dégrader
  // silencieusement en « ? ». Ces requêtes passent par le client admin → un échec ici est un
  // vrai problème d'infra, pas un cas nominal.
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (chattersRes.error) throw new Error(chattersRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)

  const creatorName: Record<string, string> = {}
  for (const c of creatorsRes.data ?? []) if (c.id && c.name) creatorName[c.id] = c.name
  const chatterName: Record<string, string> = {}
  for (const c of chattersRes.data ?? []) if (c.id && c.display_name) chatterName[c.id] = c.display_name
  const authorName: Record<string, string> = {}
  for (const p of profilesRes.data ?? []) if (p.id && p.display_name) authorName[p.id] = p.display_name

  const inScope = (id: string) => scope === null || scope.has(id)
  return (reportsRes.data ?? [])
    .filter((r) => inScope(r.creator_id))
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

/** Modèles visibles par l'appelant (RLS `creators_scoped_read` : admin = tout, sinon
 *  profile_creators). Le cloisonnement est porté par la RLS (client cookie), pas de param. */
export async function getReportOptions(): Promise<{ models: ReportOption[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('creators').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return { models: (data ?? []).map((c) => ({ id: c.id, name: c.name })) }
}

/**
 * Chatteurs de TOUS les modèles visibles, groupés par modèle, en UNE requête — au lieu d'une
 * requête par modèle (fan-out N, coûteux surtout pour un admin qui voit tous les modèles de
 * l'agence). Clé = `creatorId`. RLS `chatter_creators_scoped_read` (admin = tout, sinon
 * profile_creators). Le formulaire lit `byModel[modèle sélectionné]` côté client.
 */
export async function getChattersByModel(): Promise<Record<string, ReportOption[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chatter_creators')
    .select('creator_id, chatter:chatters(id, display_name)')
  if (error) throw new Error(error.message)
  const byModel: Record<string, ReportOption[]> = {}
  for (const r of data ?? []) {
    const c = Array.isArray(r.chatter) ? r.chatter[0] : r.chatter
    if (!c) continue
    ;(byModel[r.creator_id] ??= []).push({ id: c.id, name: c.display_name })
  }
  return byModel
}
