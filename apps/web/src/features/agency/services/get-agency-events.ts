import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { AgencyEvent } from '../month-layout'
import type { AgencyRole } from '../schema'

/**
 * TOUS les événements visibles, pour la grille du mois ET la liste en dessous (à venir / passé —
 * demande Benoit 2026-09-28) : `layoutMonth` ne garde de toute façon que ceux de la grille, une
 * seule lecture sert les deux. Client utilisateur : la RLS (`agency_events_read`) ne rend que
 * ceux qui visent le rôle de l'appelant. `fetchAll` : la liste « Passé » n'a pas de borne, la
 * table grossit pour toujours.
 */
export async function getAgencyEvents(): Promise<AgencyEvent[]> {
  const supabase = await createClient()
  const { data, error } = await fetchAll((from, to) =>
    supabase
      .from('agency_events')
      .select('id, title, start_date, end_date, remind_on_day, audience')
      .order('start_date')
      .order('id')
      .range(from, to),
  )
  if (error) throw new Error(error.message)
  return data.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date,
    remindOnDay: e.remind_on_day,
    audience: e.audience as AgencyRole[],
  }))
}
