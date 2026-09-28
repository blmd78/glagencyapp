import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { monthGrid, type AgencyEvent } from '../month-layout'
import type { AgencyRole } from '../schema'

/**
 * Les événements visibles sur la grille d'un mois. Client utilisateur : la RLS
 * (`agency_events_read`) ne rend que ceux qui visent le rôle de l'appelant. Pas de `fetchAll` :
 * la table est petite, quelques événements par mois, et le filtre de dates borne la lecture à la
 * grille (42 jours au plus).
 */
export async function getAgencyMonth(month: string): Promise<AgencyEvent[]> {
  const { start, end } = monthGrid(month)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agency_events')
    .select('id, title, start_date, end_date, remind_on_day, audience')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date')
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date,
    remindOnDay: e.remind_on_day,
    audience: e.audience as AgencyRole[],
  }))
}
