import { addDays, frDayShort, mondayOf, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { REPOS_COLUMNS, type ReposCell, type ReposData, type WeekChoice } from '../types'

/** Libellé spécifique repos « Lundi 06/07 au Dimanche 12/07 » (dates via @glagency/core, UTC-safe). */
function weekLabel(start: string): string {
  return `Lundi ${frDayShort(start)} au Dimanche ${frDayShort(addDays(start, 6))}`
}

/**
 * Planning des repos d'une semaine (lundi YYYY-MM-DD) — semaine courante par défaut.
 * RLS : admin ou page `repos` accordée (sous-managers) ; sinon 0 ligne.
 * Vue COMPLÈTE pour tout porteur de la page (plus de cloisonnement app-side) : l'accès reste
 * garanti en amont par requireAccess('repos') ; l'ÉCRITURE des cases est, elle, admin-only
 * (cf. saveReposCell). Les managers voient tout en lecture seule (sauf « envoyé Telegram »).
 */
export async function getRepos(week: string | null | undefined): Promise<ReposData> {
  const supabase = await createClient()
  // Résolution des NOMS + listes (modèles/chatteurs) via le client admin : la page repos est un
  // outil opérationnel agence-wide (tous les modèles/chatteurs doivent être lisibles), alors que
  // le RLS de creators/chatters cloisonne par modèle assigné. L'accès à la page est déjà garanti
  // par requireAccess('repos') en amont ; les DONNÉES du planning restent, elles, sur le client RLS.
  const admin = createAdminClient()

  const currentMonday = mondayOf(todayParis())
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : currentMonday

  const [
    cellsRes,
    weekRes,
    chattersRes,
    profilesRes,
    creatorsRes,
    membersRes,
    dataWeeksRes,
  ] = await Promise.all([
    supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    // `chatters` (MyPuls) : uniquement pour résoudre les noms des cellules LEGACY (ids d'avant la
    // bascule vers les membres) — plus la source des options. Noms seuls (pas `active`).
    admin.from('chatters').select('id, display_name'),
    // Profils utiles au planning en UNE requête paginée (fetchAll — anti-troncature) : encadrants
    // (manager/sous-manager/police, pour les colonnes managers/policiers + la résolution des noms)
    // ET membres role chatteur (OPTIONS des cellules chatteur, Repos non filtré). Les sous-ensembles
    // sont DÉRIVÉS en JS plus bas (options par colonne = rôle EXACT ; options chatteur = role chatteur).
    fetchAll((f, t) =>
      admin
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['manager', 'sous-manager', 'police', 'chatteur'])
        .order('id')
        .range(f, t),
    ),
    admin.from('creators').select('id, name, active'),
    supabase
      .from('rest_planning_column_members')
      .select('col, effective_from, creator_ids')
      .lte('effective_from', weekStart)
      .order('effective_from', { ascending: true }),
    // Semaines qui ont des données saisies (la « range ») — pour le sélecteur. Table sans
    // borne temporelle naturelle (tout l'historique cumulé, ~56 lignes/semaine) → fetchAll,
    // tri sur la PK complète (week_start, day, col — migration 0016) sinon troncature
    // silencieuse à 1000 lignes (docs/guidelines-data-loading.md §2).
    fetchAll((f, t) =>
      supabase
        .from('rest_planning_cells')
        .select('week_start')
        .order('week_start')
        .order('day')
        .order('col')
        .range(f, t),
    ),
  ])
  if (cellsRes.error) throw new Error(cellsRes.error.message)
  if (weekRes.error) throw new Error(weekRes.error.message)
  if (chattersRes.error) throw new Error(chattersRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (membersRes.error) throw new Error(membersRes.error.message)
  if (dataWeeksRes.error) throw new Error(dataWeeksRes.error.message)
  const cellRows = cellsRes.data
  const weekRow = weekRes.data
  const chatterRows = chattersRes.data
  const profileRows = profilesRes.data
  const creatorRows = creatorsRes.data
  const memberRows = membersRes.data
  const dataWeekRows = dataWeeksRes.data

  // Sélecteur : semaines avec données (range) + semaine en cours + semaine +1. Future en haut.
  const nextMonday = addDays(currentMonday, 7)
  const weekSet = new Set<string>([currentMonday, nextMonday])
  for (const r of dataWeekRows ?? []) if (r.week_start) weekSet.add(r.week_start)
  const weeks: WeekChoice[] = [...weekSet]
    .sort()
    .reverse()
    .map((start) => ({ start, label: weekLabel(start) }))

  // Résolution des noms des cellules (id → nom). `chatter_ids` est un `uuid[]` SANS FK qui mélange
  // plusieurs espaces d'identité : on fusionne toutes les sources dans la même map.
  //  - `chatters` (MyPuls) : cellules chatteur SAISIES AVANT la bascule (legacy) — noms conservés.
  //  - encadrants (manager/sous-manager/police) : colonnes managers/policiers.
  //  - membres role chatteur (profiles) : nouvelles cellules chatteur + OPTIONS.
  const chatterById: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterById[c.id] = c.display_name
  for (const m of profileRows ?? []) if (m.id && m.display_name) chatterById[m.id] = m.display_name
  // Options des cellules chatteur = TOUS les membres role chatteur (Repos non filtré, cf. Police).
  const chatterOptions = (profileRows ?? [])
    .filter((m) => m.role === 'chatteur' && m.display_name)
    .map((m) => ({ id: m.id, name: m.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Options par colonne encadrement — filtrées par rôle EXACT (pas de sous-manager dans
  // Managers, pas de manager dans Policiers).
  const optsForRole = (role: string) =>
    (profileRows ?? [])
      .filter((m) => m.role === role && m.display_name)
      .map((m) => ({ id: m.id, name: m.display_name as string }))
      .sort((a, b) => a.name.localeCompare(b.name))
  const managerOptions = optsForRole('manager')
  const policierOptions = optsForRole('police')

  // Modèles (header) : id → nom + options actifs.
  const creatorById: Record<string, string> = {}
  for (const c of creatorRows ?? []) if (c.id && c.name) creatorById[c.id] = c.name
  const creatorOptions = (creatorRows ?? [])
    .filter((c) => c.active && c.name)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Compo effective par colonne = dernier effective_from ≤ weekStart (rows triées asc → dernier gagne).
  const memberByCol: Record<string, string[]> = {}
  for (const m of memberRows ?? []) memberByCol[m.col] = m.creator_ids ?? []

  // Colonnes résolues : label = noms des modèles (join) sinon défaut du code. Toutes les
  // colonnes sont renvoyées (vue complète — plus de cloisonnement app-side).
  const columns = REPOS_COLUMNS.map((c) => {
    const creatorIds = memberByCol[c.key] ?? []
    const label = creatorIds.length
      ? creatorIds.map((id) => creatorById[id] ?? '?').join(' + ')
      : c.label
    return { key: c.key, label, encadrement: c.encadrement, creatorIds }
  })

  // Cellules { chatterIds, names } — vue complète : IDs et texte legacy tels quels.
  const cells: Record<number, Record<string, ReposCell>> = {}
  for (const r of cellRows ?? []) {
    cells[r.day] = {
      ...(cells[r.day] ?? {}),
      [r.col]: {
        chatterIds: r.chatter_ids ?? [],
        names: r.names ?? '',
      },
    }
  }

  return {
    weekStart,
    weekLabel: weekLabel(weekStart),
    columns,
    cells,
    creatorById,
    creatorOptions,
    chatterById,
    chatterOptions,
    managerOptions,
    policierOptions,
    sentTelegram: weekRow?.sent_telegram ?? false,
    weeks,
  }
}
