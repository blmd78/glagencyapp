import type { IdentityState } from './chatter-identity'

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

/** Une fiche de test : id, nom, et au besoin id MyPuls, alias et lien membre. */
export interface F {
  id: string
  name: string
  mypulsId?: string
  aliases?: string[]
  linked?: boolean
  /** Fiche connue par son seul nom : le nom n'est pas une clé d'alias. */
  byNameOnly?: boolean
}

/** État d'identité de test : le nom et les alias de chaque fiche sont ses clés d'alias. */
export function state(fiches: F[]): IdentityState {
  const alias = new Map<string, string>()
  const name = new Map<string, string>()
  const byId = new Map<string, string>()
  const idOf = new Map<string, string | null>()
  const linked = new Set<string>()
  for (const f of fiches) {
    name.set(f.name, f.id)
    idOf.set(f.id, f.mypulsId ?? null)
    if (f.mypulsId) byId.set(f.mypulsId, f.id)
    for (const a of [...(f.byNameOnly ? [] : [f.name]), ...(f.aliases ?? [])]) alias.set(norm(a), f.id)
    if (f.linked) linked.add(f.id)
  }
  return {
    chatterByMypulsId: byId,
    mypulsIdByChatter: idOf,
    aliasOf: (n) => alias.get(n),
    byName: (r) => name.get(r),
    byEmail: () => undefined,
    linkedChatters: linked,
  }
}
