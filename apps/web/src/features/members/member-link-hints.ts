/**
 * Aides au ménage des comptes, page Membres (filtres « À rattacher » et « Doublons »).
 *
 * POURQUOI (2026-10-01) : le classement Stat chatter ne retient que les fiches MyPuls liées à un
 * membre « chatteur » — 99 fiches avec du CA en septembre n'en avaient pas, et bien des membres
 * au même nom existaient déjà sans lien. Ces aides désignent les cas qu'un humain confirme : un
 * nom identique n'est pas une preuve d'identité, on SUGGÈRE, on ne lie jamais d'office.
 *
 * Clé de rapprochement plus large que la recherche (`member-search.ts`) : casse, accents ET
 * ponctuation retirés (« O'Neal » ≡ « O NEAL »), suffixe « (accès révoqué) » ignoré — c'est un
 * état MyPuls, pas une identité (même règle que `normLabel` côté ingestion).
 */
const key = (s: string): string =>
  s
    .replace(/\s*\(accès révoqué\)\s*$/i, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

interface HintMember {
  id: string
  displayName: string
  email: string
  role: string
  chatterId: string
  leftAt: string | null
}

/**
 * Membre chatteur en poste SANS fiche liée → fiches MyPuls LIBRES (liées à personne) qui portent
 * son nom ou son e-mail. Absent de la map = rien à proposer.
 */
export function linkSuggestions(
  members: HintMember[],
  chatters: { id: string; name: string }[],
): Map<string, { id: string; name: string }[]> {
  const linked = new Set(members.map((m) => m.chatterId).filter(Boolean))
  const byKey = new Map<string, { id: string; name: string }[]>()
  for (const c of chatters) {
    if (linked.has(c.id)) continue
    const k = key(c.name)
    if (!k) continue
    byKey.set(k, [...(byKey.get(k) ?? []), c])
  }

  const out = new Map<string, { id: string; name: string }[]>()
  for (const m of members) {
    if (m.role !== 'chatteur' || m.chatterId || m.leftAt) continue
    const found = new Map<string, { id: string; name: string }>()
    for (const k of [key(m.displayName), key(m.email)])
      for (const c of (k && byKey.get(k)) || []) found.set(c.id, c)
    if (found.size) out.set(m.id, [...found.values()])
  }
  return out
}

/** Membres EN POSTE dont le nom est porté par un autre membre en poste. Un homonyme parti ne
 *  compte pas : le doublon est déjà réglé, le ressortir ferait du bruit. */
export function duplicateMemberIds(members: HintMember[]): Set<string> {
  const byKey = new Map<string, string[]>()
  for (const m of members) {
    if (m.leftAt) continue
    const k = key(m.displayName)
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), m.id])
  }
  return new Set([...byKey.values()].filter((ids) => ids.length > 1).flat())
}
