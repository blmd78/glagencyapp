import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { POLICE_ERRORS, type PoliceData, type PoliceEntry } from '../types'

const DAY_MS = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const frDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })

const ERROR_LABEL: Record<string, string> = Object.fromEntries(
  POLICE_ERRORS.map((e) => [e.key, e.label]),
)

/**
 * Journal « Police » d'un jour (YYYY-MM-DD, défaut = aujourd'hui).
 * RLS : admin ou page `police`. Noms/listes résolus via client admin (agence-wide, comme repos).
 */
export async function getPolice(day?: string | null): Promise<PoliceData> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const today = iso(new Date())
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today
  const since = iso(new Date(new Date(`${selected}T00:00:00Z`).getTime() - 30 * DAY_MS))

  const [{ data: rows }, { data: recentWarns }, { data: chatterRows }, { data: profileRows }] =
    await Promise.all([
      supabase
        .from('police_entries')
        .select('*')
        .eq('occurred_on', selected)
        .order('created_at', { ascending: false }),
      supabase
        .from('police_entries')
        .select('chatter_id')
        .eq('kind', 'warning')
        .gte('occurred_on', since)
        .lte('occurred_on', selected),
      admin.from('chatters').select('id, display_name, active'),
      admin.from('profiles').select('id, display_name'),
    ])

  const chatterName: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterName[c.id] = c.display_name
  const controllerName: Record<string, string> = {}
  for (const p of profileRows ?? []) if (p.id && p.display_name) controllerName[p.id] = p.display_name

  const chatterOptions = (chatterRows ?? [])
    .filter((c) => c.active && c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const warningsByChatter: Record<string, number> = {}
  for (const w of recentWarns ?? [])
    warningsByChatter[w.chatter_id] = (warningsByChatter[w.chatter_id] ?? 0) + 1

  const entries: PoliceEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    chatterId: r.chatter_id,
    chatterName: chatterName[r.chatter_id] ?? '?',
    controllerName: r.controller_id ? (controllerName[r.controller_id] ?? '—') : '—',
    kind: r.kind === 'malus' ? 'malus' : 'warning',
    errorKey: r.error_key,
    errorLabel: r.error_key ? (ERROR_LABEL[r.error_key] ?? r.error_key) : null,
    amountEur: Number(r.amount_eur),
    note: r.note,
    shift: r.shift,
    createdAt: r.created_at,
  }))

  const base = new Date(`${today}T00:00:00Z`).getTime()
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = iso(new Date(base - i * DAY_MS))
    return { day: d, label: frDay(d) }
  })

  return {
    day: selected,
    dayLabel: frDay(selected),
    entries,
    chatterOptions,
    warningsByChatter,
    totalMalusEur: entries.filter((e) => e.kind === 'malus').reduce((s, e) => s + e.amountEur, 0),
    warningCount: entries.filter((e) => e.kind === 'warning').length,
    chattersConcerned: new Set(entries.map((e) => e.chatterId)).size,
    days,
  }
}
