/**
 * Slug technique d'un libellé — les `code` du catalogue de formation (modules, sections, cas,
 * fans du boss) : minuscules ASCII, accents retirés, tout le reste → `_`, 2 à `max` caractères
 * (32 par défaut : + `_999` reste sous les 40 du check SQL). Jamais saisi par l'utilisateur,
 * généré à la création, immuable ensuite.
 */
export function slugify(input: string, max = 32): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '')
  return base.length >= 2 ? base : `${base}xx`.slice(0, 2)
}

/** Dédoublonne contre un ensemble de slugs pris : `base`, puis `base_2`, `base_3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const s = `${base}_${i}`
    if (!taken.has(s)) return s
  }
  throw new Error('slug : impossible de dédoublonner')
}
