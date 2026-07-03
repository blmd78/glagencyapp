import type { PostgrestError } from '@supabase/supabase-js'

const PAGE = 1000

/**
 * Contourne la limite PostgREST (max 1000 lignes par réponse) : pagine par `.range()`
 * jusqu'à épuisement. Obligatoire pour les tables de faits journaliers (chatter_daily,
 * chatter_creator_daily, creator_daily…) dont le volume dépend de la période du
 * datepicker — sans ça, les agrégats sont tronqués EN SILENCE dès ~10 jours de plage
 * (constaté : juin affichait 99 k€ attribués au lieu de 256 k€).
 *
 * `build` doit retourner une requête FRAÎCHE à chaque appel (un builder supabase ne se
 * réutilise pas), poser un `.order()` DÉTERMINISTE (les colonnes de la PK) et ne PAS
 * poser son propre `.range()`.
 */
export async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) return { data: all, error }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) return { data: all, error: null }
  }
}
