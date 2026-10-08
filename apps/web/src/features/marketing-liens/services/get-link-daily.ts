import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'
import { SFS_GROUP_KEY, inScope, sfsLinkIds, type MktScope } from '@/lib/mkt-sfs'
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
  /** Les liens à cumuler. `null` = tous les liens du périmètre : on ne filtre alors pas la
   *  requête, plutôt que d'écrire 183 uuid dans son URL — le périmètre est appliqué après. */
  linkIds: string[] | null,
  period: Period,
  /** `externe` (page Liens, sans les SFS) ou `sfs` (onglet SFS) — `lib/mkt-sfs.ts`. Ne sert que
   *  pour `linkIds === null` : une liste d'ids vient déjà de liens du bon périmètre. */
  scope: MktScope = 'externe',
): Promise<DailyPoint[]> {
  // Sélection vide (un réseau sans aucun lien) : aucune requête à faire, et surtout pas un
  // `.in()` vide — PostgREST le lit comme « aucun filtre » et rendrait TOUTE l'agence.
  if (linkIds?.length === 0) return dailySeries([], period.from, period.to)

  const supabase = await createClient()
  // Tous les liens : les lignes journalières ne portent que leur `link_id`, le groupe vit sur
  // `mkt_links` — on relit les ids SFS pour appliquer le périmètre, EN MÊME TEMPS que la série.
  const [daily, sfs] = await Promise.all([
    fetchAll<MktLinkDailyRow>((f, t) => {
      const q = supabase
        .from('mkt_link_daily')
        .select('date, link_id, clicks, conversions, revenue_eur')
        .gte('date', period.from)
        .lte('date', period.to)
      return (linkIds ? q.in('link_id', linkIds) : q).order('date').order('link_id').range(f, t)
    }),
    linkIds
      ? null
      : fetchAll<{ id: string; type: string }>((f, t) =>
          supabase.from('mkt_links').select('id, type').eq('type', SFS_GROUP_KEY).order('id').range(f, t),
        ),
  ])
  if (daily.error) throw new Error(daily.error.message)
  if (!sfs) return dailySeries(daily.data ?? [], period.from, period.to)
  if (sfs.error) throw new Error(sfs.error.message)
  const rows = inScope(daily.data ?? [], (d) => d.link_id, sfsLinkIds(sfs.data ?? []), scope)
  return dailySeries(rows, period.from, period.to)
}
