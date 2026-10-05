/**
 * Aides des tests d'identité (pas un test : aucun `it` ici). `norm` est le miroir de `normLabel`
 * (apps/ingestion/src/norm.ts), sans le décodage d'entités HTML, fait en amont par l'ingestion.
 */
export const norm = (s: string): string =>
  s
    .replace(/\s*\(accès révoqué\)\s*$/i, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
