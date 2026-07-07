import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { REPOS_COLUMNS, type ReposCell, type ReposData, type WeekChoice } from '../types'

const DAY_MS = 86_400_000

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Lundi (UTC) de la semaine contenant `d`. */
function mondayOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7 // 0 = lundi
  return iso(new Date(d.getTime() - day * DAY_MS))
}

const frShort = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

function weekLabel(start: string): string {
  const end = iso(new Date(new Date(`${start}T00:00:00Z`).getTime() + 6 * DAY_MS))
  return `Lundi ${frShort(start)} au Dimanche ${frShort(end)}`
}

/**
 * Planning des repos d'une semaine (lundi YYYY-MM-DD) — semaine courante par défaut.
 * RLS : admin ou page `repos` accordée (sous-managers) ; sinon 0 ligne.
 */
export async function getRepos(week?: string | null): Promise<ReposData> {
  const supabase = await createClient()
  // Résolution des NOMS + listes (modèles/chatteurs) via le client admin : la page repos est un
  // outil opérationnel agence-wide (tous les modèles/chatteurs doivent être lisibles), alors que
  // le RLS de creators/chatters cloisonne par modèle assigné. L'accès à la page est déjà garanti
  // par requireAccess('repos') en amont ; les DONNÉES du planning restent, elles, sur le client RLS.
  const admin = createAdminClient()

  const currentMonday = mondayOf(new Date())
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : currentMonday

  const base = new Date(`${currentMonday}T00:00:00Z`).getTime()

  const [
    { data: cellRows },
    { data: weekRow },
    { data: chatterRows },
    { data: creatorRows },
    { data: memberRows },
    { data: dataWeekRows },
  ] = await Promise.all([
    supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    admin.from('chatters').select('id, display_name, active'),
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
  const nextMonday = iso(new Date(base + 7 * DAY_MS))
  const weekSet = new Set<string>([currentMonday, nextMonday])
  for (const r of dataWeekRows ?? []) if (r.week_start) weekSet.add(r.week_start)
  const weeks: WeekChoice[] = [...weekSet]
    .sort()
    .reverse()
    .map((start) => ({ start, label: weekLabel(start) }))

  // Chatteurs (cellules) : id → nom (tous, inactifs inclus) + options actifs.
  const chatterById: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterById[c.id] = c.display_name
  const chatterOptions = (chatterRows ?? [])
    .filter((c) => c.active && c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name }))
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
  const columns = REPOS_COLUMNS.map((c) => {
    const creatorIds = memberByCol[c.key] ?? []
    const label = creatorIds.length
      ? creatorIds.map((id) => creatorById[id] ?? '?').join(' + ')
      : c.label
    return { key: c.key, label, encadrement: c.encadrement, creatorIds }
  })

  // Cellules { chatterIds, names }.
  const cells: Record<number, Record<string, ReposCell>> = {}
  for (const r of cellRows ?? []) {
    cells[r.day] = {
      ...(cells[r.day] ?? {}),
      [r.col]: { chatterIds: r.chatter_ids ?? [], names: r.names ?? '' },
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
    sentTelegram: weekRow?.sent_telegram ?? false,
    weeks,
  }
}
