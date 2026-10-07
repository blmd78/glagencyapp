/**
 * Dossier Notion ↔ modèle du CRM, par le nom (« EMMA » ↔ Emma) : casse, accents et espaces ignorés.
 * Ambigu ou absent → pas de présélection, le manager choisit (jamais de rattachement deviné).
 */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

export function matchCreatorByName<T extends { name: string }>(
  rows: T[],
  name: string,
): { kind: 'found'; row: T } | { kind: 'none' } | { kind: 'ambiguous'; rows: T[] } {
  const hits = rows.filter((r) => fold(r.name) === fold(name))
  const [only] = hits
  if (!only) return { kind: 'none' }
  return hits.length === 1 ? { kind: 'found', row: only } : { kind: 'ambiguous', rows: hits }
}
