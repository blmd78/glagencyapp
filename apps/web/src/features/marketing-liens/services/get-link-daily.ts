import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'
import { dailySeries, type DailyPoint } from '../daily-series'

/**
 * La série journalière d'une SÉLECTION de liens sur la période affichée — un lien, tous ceux
 * d'un réseau, ou toute l'agence. `dailySeries` additionne les lignes d'un même jour.
 *
 * Lecture séparée de `getMktLinks` à dessein : la page ne la déclenche que sur `?lien=`, donc
 * un visiteur qui ne clique rien ne paie rien. L'inverse — charger tout `mkt_link_daily` avec la
 * page pour filtrer côté client — ferait voyager 6 000 lignes sur une période longue, pour un
 * détail que la plupart des visites n'ouvrent jamais.
 *
 * Client SESSION : la policy `mkt_link_daily_all` est la MÊME que celle qui alimente déjà les
 * agrégats de la page — qui voit le tableau voit le détail, aucun droit nouveau.
 *
 * `fetchAll` par principe (règle du projet : jamais de `select` nu), même si un lien sur une
 * période d'un an tient largement sous le cap des 1 000 lignes.
 */
export async function getLinkDaily(
  /** Les liens à cumuler. `null` = toute l'agence : on ne filtre alors pas du tout, plutôt que
   *  d'écrire 183 uuid dans l'URL de la requête. */
  linkIds: string[] | null,
  period: Period,
): Promise<DailyPoint[]> {
  // Sélection vide (un réseau sans aucun lien) : aucune requête à faire, et surtout pas un
  // `.in()` vide — PostgREST le lit comme « aucun filtre » et rendrait TOUTE l'agence.
  if (linkIds?.length === 0) return dailySeries([], period.from, period.to)

  const supabase = await createClient()
  const { data, error } = await fetchAll<MktLinkDailyRow>((f, t) => {
    const q = supabase
      .from('mkt_link_daily')
      .select('date, link_id, clicks, conversions, revenue_eur')
      .gte('date', period.from)
      .lte('date', period.to)
    return (linkIds ? q.in('link_id', linkIds) : q).order('date').order('link_id').range(f, t)
  })
  if (error) throw new Error(error.message)
  return dailySeries(data ?? [], period.from, period.to)
}
