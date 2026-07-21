import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
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
 * RLS `police_reports_read` (has_page) large ; le cloisonnement modèle est fait ici, comme le
 * Tracker filtre par `chatterIds`. Volume modéré → select nu.
 */
export async function getPoliceReports(
  profile: Profile,
  filter: { creatorId?: string; chatterId?: string },
): Promise<PoliceReport[]> {
  const supabase = await createClient()
  const admin = createAdminClient()
  let q = supabase
    .from('police_reports')
    // Chaîne UNIQUE (pas de concaténation `+`) : l'opérateur `+` élargit le type en `string`
    // générique, et le parseur de types de postgrest-js exige un type LITTÉRAL pour résoudre
    // l'embed → sinon fallback silencieux sur `GenericStringError` (repéré au typecheck).
    .select(
      'id, creator_id, day, ca, non_traitees, absents, alerte, author_id, lines:police_report_lines(id, chatter_id, a_marche, a_regler)',
    )
    .order('day', { ascending: false })
  if (filter.creatorId) q = q.eq('creator_id', filter.creatorId)

  const [scope, reportsRes, creatorsRes, chattersRes, profilesRes] = await Promise.all([
    assignedCreatorIds(profile),
    q,
    admin.from('creators').select('id, name'),
    admin.from('chatters').select('id, display_name'),
    admin.from('profiles').select('id, display_name'),
  ])
  if (reportsRes.error) throw new Error(reportsRes.error.message)

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

/** Modèles assignés à l'appelant (RLS `creators_scoped_read` = profile_creators). */
export async function getReportOptions(profile: Profile): Promise<{ models: ReportOption[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('creators').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return { models: (data ?? []).map((c) => ({ id: c.id, name: c.name })) }
}

/** Chatteurs d'un modèle donné (via chatter_creators), scopés par la RLS. */
export async function getModelChatters(profile: Profile, creatorId: string): Promise<ReportOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chatter_creators')
    .select('chatter:chatters(id, display_name)')
    .eq('creator_id', creatorId)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((r) => (Array.isArray(r.chatter) ? r.chatter[0] : r.chatter))
    .filter((c): c is { id: string; display_name: string } => !!c)
    .map((c) => ({ id: c.id, name: c.display_name }))
}
