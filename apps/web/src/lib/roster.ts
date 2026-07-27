import type { SelectableMember } from '@/lib/types/member'

/**
 * Règles communes aux listes de personnes du Planning et du Dashboard. Les deux pages les
 * écrivaient à l'identique ; surtout, l'invariant « un `?membre=` non validé retombe sur
 * `null` » vivait en deux exemplaires — le genre de règle qu'on corrige d'un côté et qu'on
 * oublie de l'autre.
 *
 * La CONSTRUCTION de l'entrée « soi » reste dans chaque page : les deux types de membre
 * diffèrent (le planning porte `hasPlanningPage`), et un générique pour trois champs coûterait
 * un cast — plus cher que les deux lignes qu'il économise.
 */

/** « X (moi) » seulement s'il y a quelqu'un d'autre dont se distinguer. */
export const selfLabel = (name: string, others: readonly unknown[]): string =>
  others.length ? `${name} (moi)` : name

/**
 * `?membre=` validé PAR APPARTENANCE à la liste : un id inconnu, mal formé, ou visant quelqu'un
 * hors périmètre est ignoré silencieusement. `null` = pas de filtre. La RLS reste le vrai
 * verrou — ceci n'est que la garde d'affichage.
 */
export const resolveFilter = (
  roster: readonly SelectableMember[],
  membre: string | undefined,
): string | null => (membre && roster.some((m) => m.id === membre) ? membre : null)

/** Ce qu'on affiche : la personne filtrée seule, ou tout le monde. */
export const applyFilter = <T extends SelectableMember>(
  roster: T[],
  filterId: string | null,
): T[] => (filterId ? roster.filter((m) => m.id === filterId) : roster)
