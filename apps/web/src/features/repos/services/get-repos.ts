import { addDays, currentWeekStart, frDayShort, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getVisibleProfiles } from '@/lib/services/team'
import { ENCADREMENT_COLUMNS, LEGACY_COL_LABELS, MODEL_COL_KEYS, type ReposCell, type ReposColumn, type ReposData, type WeekChoice } from '../types'

/** Libellé spécifique repos « Lundi 06/07 au Dimanche 12/07 » (dates via @glagency/core, UTC-safe). */
function weekLabel(start: string): string {
  return `Lundi ${frDayShort(start)} au Dimanche ${frDayShort(addDays(start, 6))}`
}

/**
 * Planning des repos d'une semaine (lundi YYYY-MM-DD) — semaine courante par défaut.
 * RLS : admin ou page `repos` accordée (sous-managers) ; sinon 0 ligne.
 * Vue COMPLÈTE pour tout porteur de la page (plus de cloisonnement app-side) : l'accès reste
 * garanti en amont par requireAccess('repos') ; l'ÉCRITURE des cases chatteurs est ouverte
 * aux managers/sous-managers porteurs de la page (cf. saveReposCell) — encadrement et compo
 * des colonnes restent admin-only.
 */
export async function getRepos(week: string | null | undefined): Promise<ReposData> {
  const supabase = await createClient()
  // Résolution des NOMS + listes (modèles/chatteurs) via le client admin : la page repos est un
  // outil opérationnel agence-wide (tous les modèles/chatteurs doivent être lisibles), alors que
  // le RLS de creators/chatters cloisonne par modèle assigné. L'accès à la page est déjà garanti
  // par requireAccess('repos') en amont ; les DONNÉES du planning restent, elles, sur le client RLS.
  const admin = createAdminClient()

  const currentMonday = currentWeekStart(todayParis())
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : currentMonday

  const [
    cellsRes,
    weekRes,
    chattersRes,
    profilesRes,
    visibleProfiles,
    creatorsRes,
    membersRes,
    dataWeeksRes,
  ] = await Promise.all([
    supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    // `chatters` (MyPuls) : uniquement pour résoudre les noms des cellules LEGACY (ids d'avant la
    // bascule vers les membres) — plus la source des options. Noms seuls (pas `active`).
    // fetchAll : cap PostgREST silencieux — `chatters` grossit sans purge. `.order('id')` = la PK.
    fetchAll((f, t) => admin.from('chatters').select('id, display_name').order('id').range(f, t)),
    // Profils via le client ADMIN (fetchAll — anti-troncature) : RÉSOLUTION des noms (le board
    // complet affiche les chatters de toutes les équipes) + options des colonnes encadrement
    // (managers/policiers, édition admin-only). Les OPTIONS des cellules chatteur viennent,
    // elles, de getVisibleProfiles (RLS) ci-dessous.
    fetchAll((f, t) =>
      admin
        .from('profiles')
        // `left_at` est LU mais PAS filtré ici, volontairement : cette requête alimente
        // `chatterById`, qui résout les noms des cellules DÉJÀ POSÉES. Filtrer les partis à la
        // source ferait afficher « ? » à la place de leur nom dans les plannings passés — un
        // planning d'août doit rester lisible en septembre. Le filtre vit donc sur les OPTIONS
        // (plus bas), là où il veut vraiment dire « ne le propose plus ».
        .select('id, display_name, role, is_new, arrived_at, left_at')
        .in('role', ['manager', 'sous-manager', 'police', 'chatteur'])
        .order('id')
        .range(f, t),
    ),
    // Périmètre RLS de l'appelant (0095, lib/services/team) : tout encadrant voit TOUS les
    // chatteurs → OPTIONS complètes des cellules chatteur pour tout porteur de la page.
    getVisibleProfiles(),
    admin.from('creators').select('id, name, active'),
    supabase
      .from('rest_planning_column_members')
      .select('col, effective_from, creator_ids')
      .lte('effective_from', weekStart)
      .order('effective_from', { ascending: true }),
    // Semaines qui ont des données saisies (la « range ») — pour le sélecteur. RPC
    // `repos_data_weeks` (0091, json, distinct EN BASE, RLS invoker) : l'ancien fetchAll
    // rapatriait UNE LIGNE PAR CASE (~56/semaine, historique cumulé) pour un Set d'à peine
    // quelques valeurs distinctes.
    supabase.rpc('repos_data_weeks'),
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
  for (const w of (dataWeekRows ?? []) as string[]) if (w) weekSet.add(w)
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
  // Le drapeau « nouvel arrivant » (0101), lui, ne vient QUE des profils : une fiche MyPuls legacy
  // ne correspond à personne dans l'équipe actuelle, elle n'a pas de drapeau à porter.
  const newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }> = {}
  for (const m of profileRows ?? [])
    if (m.id) newByChatter[m.id] = { isNew: m.is_new ?? false, arrivedAt: m.arrived_at ?? null }
  // Options des cellules chatteur = membres role chatteur visibles sous RLS (0095 : tous,
  // pour tout encadrant — cf. getVisibleProfiles). La résolution des noms déjà posés
  // (chatterById, admin) couvre aussi les ids legacy.
  const chatterOptions = visibleProfiles
    .filter((m) => m.role === 'chatteur' && m.displayName)
    .map((m) => ({ id: m.id, name: m.displayName as string }))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Options par colonne encadrement — filtrées par rôle EXACT : chaque colonne (Managers,
  // Sous-managers, Policiers) ne propose que les profils de SON rôle.
  const optsForRole = (role: string) =>
    (profileRows ?? [])
      // `!m.left_at` : un parti (0102) ne se propose plus, mais son nom reste résoluble
      // ci-dessus pour les semaines où il figurait.
      .filter((m) => m.role === role && m.display_name && !m.left_at)
      .map((m) => ({ id: m.id, name: m.display_name as string }))
      .sort((a, b) => a.name.localeCompare(b.name))
  const managerOptions = optsForRole('manager')
  const sousManagerOptions = optsForRole('sous-manager')
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

  // Colonnes MODÈLES dynamiques (0096) : une clé g1..g12 n'est rendue que si sa compo est non
  // vide pour CETTE semaine OU si ses cases de la semaine ont du contenu — vider la compo d'une
  // colonne sans repos posés la fait disparaître ; « Ajouter une colonne » (grille, admin)
  // reprend la première clé libre. Les colonnes encadrement sont toujours rendues.
  const contentCols = new Set(
    (cellRows ?? [])
      .filter((r) => (r.chatter_ids ?? []).length > 0 || (r.names ?? '') !== '')
      .map((r) => r.col),
  )
  const columns: ReposColumn[] = [
    ...MODEL_COL_KEYS.flatMap((key, i): ReposColumn[] => {
      const creatorIds = memberByCol[key] ?? []
      if (creatorIds.length === 0 && !contentCols.has(key)) return []
      const label = creatorIds.length
        ? creatorIds.map((id) => creatorById[id] ?? '?').join(' + ')
        : (LEGACY_COL_LABELS[key] ?? `Colonne ${i + 1}`)
      return [{ key, label, encadrement: false, creatorIds }]
    }),
    ...ENCADREMENT_COLUMNS.map((c): ReposColumn => ({ key: c.key, label: c.label, encadrement: true, creatorIds: [] })),
  ]

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
    newByChatter,
    chatterOptions,
    managerOptions,
    sousManagerOptions,
    policierOptions,
    sentTelegram: weekRow?.sent_telegram ?? false,
    weeks,
  }
}
