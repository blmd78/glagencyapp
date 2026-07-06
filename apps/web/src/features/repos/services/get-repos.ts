import { createClient } from '@/lib/supabase/server'
import type { ReposData, WeekChoice } from '../types'

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

  const currentMonday = mondayOf(new Date())
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : currentMonday

  // Sélecteur : semaine prochaine + courante + 8 passées.
  const base = new Date(`${currentMonday}T00:00:00Z`).getTime()
  const weeks: WeekChoice[] = Array.from({ length: 10 }, (_, i) => {
    const start = iso(new Date(base + (1 - i) * 7 * DAY_MS))
    return { start, label: weekLabel(start) }
  })

  const [{ data: cellRows }, { data: weekRow }, { data: chatterRows }] = await Promise.all([
    supabase
      .from('rest_planning_cells')
      .select('day, col, names')
      .eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    supabase.from('chatters').select('display_name, team_id').eq('active', true).order('display_name'),
  ])

  const cells: Record<number, Record<string, string>> = {}
  for (const r of cellRows ?? []) {
    cells[r.day] = { ...(cells[r.day] ?? {}), [r.col]: r.names }
  }

  return {
    weekStart,
    weekLabel: weekLabel(weekStart),
    cells,
    sentTelegram: weekRow?.sent_telegram ?? false,
    weeks,
    chatterNames: (chatterRows ?? []).map((c) => c.display_name).filter(Boolean),
    chatterTeams: Object.fromEntries(
      (chatterRows ?? [])
        .filter((c) => c.display_name && c.team_id)
        .map((c) => [c.display_name, c.team_id as string]),
    ),
  }
}
