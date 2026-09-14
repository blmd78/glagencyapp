/**
 * Recherche de la page Membres : le nom affiché, l'e-mail ET le pseudo Discord — sans casse ni
 * accents. Le filtre ne lisait que le nom : un compte existant restait introuvable par son e-mail,
 * alors que c'est précisément par l'e-mail que la création répond « un compte existe déjà ».
 */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function memberMatches(
  member: { displayName: string; email: string; discord: string | null },
  query: string,
): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return [member.displayName, member.email, member.discord ?? ''].some((v) => fold(v).includes(q))
}
