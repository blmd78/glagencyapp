import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import type {
  PlanningBlock,
  PlanningCategory,
  PlanningData,
  PlanningDay,
  PlanningMember,
  PlanningSection,
} from '../types'

const SECTION_ORDER: Record<PlanningSection, number> = { matin: 0, apres_midi: 1, soir: 2 }

/** Colonnes lues sur `planning_blocks` — jamais `select('*')`. */
const BLOCK_COLS =
  'id, section, position, time_start, time_end, title, badge, color, bullets, categories, days'

/** Ligne brute — `bullets`/`categories`/`days` sont du `Json` en base. */
interface BlockRow {
  id: string
  section: string
  position: number
  time_start: string
  time_end: string
  title: string
  badge: string
  color: string
  bullets: unknown
  categories: unknown
  days: unknown
}

/** snake_case → camelCase, avec `Array.isArray` défensif sur les 3 colonnes `Json`. */
const toBlock = (b: BlockRow): PlanningBlock => ({
  id: b.id,
  section: b.section as PlanningSection,
  position: b.position,
  timeStart: b.time_start,
  timeEnd: b.time_end,
  title: b.title,
  badge: b.badge,
  color: b.color,
  bullets: Array.isArray(b.bullets) ? (b.bullets as string[]) : [],
  categories: Array.isArray(b.categories) ? (b.categories as PlanningCategory[]) : [],
  days: Array.isArray(b.days) ? (b.days as PlanningDay[]) : [],
})

/**
 * Planning d'UNE personne — le RLS fait le cloisonnement (0043/0061/0062). Chargé À LA DEMANDE
 * quand on déplie son nom (`loadPlanning`, actions.ts), et directement par la page en vue
 * filtrée. Le nom vient de la base et NON du roster : ce dernier porte le suffixe « (moi) »,
 * utile dans la pile mais parasite dans l'en-tête du planning.
 * Volume : quelques blocs → pas de `fetchAll` nécessaire.
 */
export async function getPlanning(profileId: string): Promise<PlanningData> {
  const supabase = await createClient()
  const [{ data: profile, error: profileErr }, { data: planning, error: planningErr }] =
    await Promise.all([
      supabase.from('profiles').select('display_name, email').eq('id', profileId).maybeSingle(),
      supabase.from('plannings').select('id').eq('profile_id', profileId).maybeSingle(),
    ])
  if (profileErr) throw new Error(profileErr.message)
  if (planningErr) throw new Error(planningErr.message)
  const profileName = profile?.display_name ?? profile?.email ?? '—'

  if (!planning) return { profileId, profileName, exists: false, blocks: [] }

  const { data: blocks, error: blocksErr } = await supabase
    .from('planning_blocks')
    .select(BLOCK_COLS)
    .eq('planning_id', planning.id)
    .order('position')
    .order('id')
  if (blocksErr) throw new Error(blocksErr.message)

  return {
    profileId,
    profileName,
    exists: true,
    // Tri stable : section, puis heure de début (la position départage les égalités).
    blocks: (blocks ?? [])
      .map(toBlock)
      .sort(
        (a, b) =>
          SECTION_ORDER[a.section] - SECTION_ORDER[b.section] ||
          a.timeStart.localeCompare(b.timeStart) ||
          a.position - b.position,
      ),
  }
}

/**
 * QUI possède déjà un planning, parmi les ids demandés — une seule requête, sans aucun bloc.
 * C'est tout ce dont la pile repliée a besoin (repère « Aucun planning ») ; le contenu part à
 * l'ouverture. Sans ça, afficher 19 noms embarquerait les blocs des 19 dans le premier rendu.
 */
export async function getPlanningOwners(profileIds: string[]): Promise<Set<string>> {
  if (!profileIds.length) return new Set()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plannings')
    .select('profile_id')
    .in('profile_id', profileIds)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((p) => p.profile_id))
}

/**
 * Personnes sélectionnables dans l'en-tête (planning ET to-do). Filtré par rôle du viewer —
 * jamais de chatteur ; les SUPERADMINS ne sont visibles que d'un superadmin (la RLS 0061
 * l'autorisait déjà : un superadmin édite n'importe quelle cible, lui-même compris).
 * superadmin → superadmins + admins + managers + sous-managers ; admin → managers +
 * sous-managers ; manager → ses sous-managers directs (RLS `profiles`) ; sinon personne.
 */
export async function getPlanningMembers(role: Profile['baseRole']): Promise<PlanningMember[]> {
  const roles =
    role === 'superadmin'
      ? ['superadmin', 'admin', 'manager', 'sous-manager']
      : role === 'admin'
        ? ['manager', 'sous-manager']
        : role === 'manager'
          ? ['sous-manager']
          : []
  if (!roles.length) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, role, pages')
    .in('role', roles)
    .order('role')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? '—',
    role: p.role,
    // admin/superadmin passent requireAccess sans slug (lib/auth) ; les autres ont besoin
    // du slug 'planning' pour ouvrir la page — et donc pour voir leur to-do.
    hasPlanningPage:
      p.role === 'admin' || p.role === 'superadmin' || (p.pages ?? []).includes('planning'),
  }))
}
