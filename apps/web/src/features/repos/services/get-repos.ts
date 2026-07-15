import { addDays, frDayShort, isoDate, mondayOf } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getChatterScope } from '@/lib/scope'
import type { Profile } from '@/lib/auth'
import { REPOS_COLUMNS, type ReposCell, type ReposData, type WeekChoice } from '../types'

/** Libellé spécifique repos « Lundi 06/07 au Dimanche 12/07 » (dates via @glagency/core, UTC-safe). */
function weekLabel(start: string): string {
  return `Lundi ${frDayShort(start)} au Dimanche ${frDayShort(addDays(start, 6))}`
}

/**
 * Planning des repos d'une semaine (lundi YYYY-MM-DD) — semaine courante par défaut.
 * RLS : admin ou page `repos` accordée (sous-managers) ; sinon 0 ligne.
 * Non-admin : vue et options CLOISONNÉES aux chatteurs/modèles assignés au manager
 * (cf. lib/scope + spec scope-chatteurs-manager) ; le serveur préserve le hors-scope à l'écriture.
 */
export async function getRepos(week: string | null | undefined, profile: Profile): Promise<ReposData> {
  const supabase = await createClient()
  // Résolution des NOMS + listes (modèles/chatteurs) via le client admin : la page repos est un
  // outil opérationnel agence-wide (tous les modèles/chatteurs doivent être lisibles), alors que
  // le RLS de creators/chatters cloisonne par modèle assigné. L'accès à la page est déjà garanti
  // par requireAccess('repos') en amont ; les DONNÉES du planning restent, elles, sur le client RLS.
  const admin = createAdminClient()

  const currentMonday = mondayOf(isoDate(new Date()))
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : currentMonday

  const [
    scope,
    { data: cellRows },
    { data: weekRow },
    { data: chatterRows },
    { data: managerRows },
    { data: creatorRows },
    { data: memberRows },
    { data: dataWeekRows },
  ] = await Promise.all([
    // Périmètre manager (1 requête pour un non-admin) — indépendant du reste.
    getChatterScope(profile),
    supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    admin.from('chatters').select('id, display_name, active'),
    // Colonnes ENCADREMENT (Managers/Policiers) : leur sélecteur liste les profils rôle
    // manager — pas les chatteurs (bug remonté : « Ajouter » proposait les chatteurs).
    admin.from('profiles').select('id, display_name').eq('role', 'manager'),
    admin.from('creators').select('id, name, active'),
    supabase
      .from('rest_planning_column_members')
      .select('col, effective_from, creator_ids')
      .lte('effective_from', weekStart)
      .order('effective_from', { ascending: true }),
    // Semaines qui ont des données saisies (la « range ») — pour le sélecteur.
    supabase.from('rest_planning_cells').select('week_start'),
  ])

  // Sélecteur : semaines avec données (range) + semaine en cours + semaine +1. Future en haut.
  const nextMonday = addDays(currentMonday, 7)
  const weekSet = new Set<string>([currentMonday, nextMonday])
  for (const r of dataWeekRows ?? []) if (r.week_start) weekSet.add(r.week_start)
  const weeks: WeekChoice[] = [...weekSet]
    .sort()
    .reverse()
    .map((start) => ({ start, label: weekLabel(start) }))

  // Chatteurs (cellules) : id → nom (tous, inactifs inclus) + options actifs.
  // Les MANAGERS (profils) sont fusionnés dans la même map : les cellules encadrement
  // stockent leurs ids dans chatter_ids (uuid[] sans FK) — les chips se résolvent pareil.
  const chatterById: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterById[c.id] = c.display_name
  for (const m of managerRows ?? []) if (m.id && m.display_name) chatterById[m.id] = m.display_name
  const chatterOptions = (chatterRows ?? [])
    .filter((c) => c.active && c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const managerOptions = (managerRows ?? [])
    .filter((m) => m.display_name)
    .map((m) => ({ id: m.id, name: m.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

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

  // Colonnes résolues : label = noms des modèles (join) sinon défaut du code.
  // Non-admin : seules les colonnes modèles recoupant SES modèles (l'encadrement reste).
  const columns = REPOS_COLUMNS.map((c) => {
    const creatorIds = memberByCol[c.key] ?? []
    const label = creatorIds.length
      ? creatorIds.map((id) => creatorById[id] ?? '?').join(' + ')
      : c.label
    return { key: c.key, label, encadrement: c.encadrement, creatorIds }
  }).filter(
    (c) =>
      scope.creatorIds === null ||
      c.encadrement ||
      c.creatorIds.some((id) => scope.creatorIds!.has(id)),
  )

  // Cellules { chatterIds, names } — non-admin : IDs ∩ scope, texte legacy masqué
  // (le hors-scope est préservé côté serveur à l'écriture, cf. saveReposCell).
  const cells: Record<number, Record<string, ReposCell>> = {}
  for (const r of cellRows ?? []) {
    const ids: string[] = r.chatter_ids ?? []
    cells[r.day] = {
      ...(cells[r.day] ?? {}),
      [r.col]: {
        chatterIds: scope.chatterIds === null ? ids : ids.filter((id) => scope.chatterIds!.has(id)),
        names: scope.chatterIds === null ? (r.names ?? '') : '',
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
    chatterOptions:
      scope.chatterIds === null
        ? chatterOptions
        : chatterOptions.filter((o) => scope.chatterIds!.has(o.id)),
    managerOptions,
    sentTelegram: weekRow?.sent_telegram ?? false,
    weeks,
  }
}
