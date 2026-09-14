/**
 * Règles PURES du périmètre modèles — la partie testable de `creator-scope.ts`.
 *
 * Un chatteur appartient aux modèles de ses DEUX rattachements : celui de son COMPTE
 * (`profile_creators`) et celui de son chatteur MyPuls (`chatter_creators`, via `profiles.chatter_id`),
 * que money-team alimente. Le Relevé d'équipe testait déjà les deux (`allowedProfileIds` +
 * `allowedChatterIds`) ; Police ne lisait que le premier. Un chatteur visible sur une ligne du
 * Relevé arrivait donc dans le formulaire de sanction SANS être sélectionné, et le serveur l'aurait
 * refusé (« pas sur tes modèles ») : en prod le 2026-09-14, 65 chatteurs sur 79 rattachés côté
 * MyPuls avaient un rattachement de compte absent (14) ou incomplet (51).
 */
export function creatorsByProfile(
  profileLinks: readonly { profile_id: string; creator_id: string }[],
  chatterLinks: readonly { chatter_id: string; creator_id: string }[],
  profiles: readonly { id: string; chatter_id: string | null }[],
): Map<string, Set<string>> {
  const byChatter = new Map<string, string[]>()
  for (const l of chatterLinks) {
    const arr = byChatter.get(l.chatter_id)
    if (arr) arr.push(l.creator_id)
    else byChatter.set(l.chatter_id, [l.creator_id])
  }

  const out = new Map<string, Set<string>>()
  const add = (profileId: string, creatorId: string): void => {
    const set = out.get(profileId)
    if (set) set.add(creatorId)
    else out.set(profileId, new Set([creatorId]))
  }
  for (const l of profileLinks) add(l.profile_id, l.creator_id)
  for (const p of profiles) {
    if (!p.chatter_id) continue
    for (const c of byChatter.get(p.chatter_id) ?? []) add(p.id, c)
  }
  return out
}

/** Dans le périmètre dès qu'un modèle est partagé. `scope` null = aucune borne → toujours vrai. */
export function inCreatorScope(
  scope: ReadonlySet<string> | null,
  creators: ReadonlySet<string> | undefined,
): boolean {
  if (!scope) return true
  for (const c of creators ?? []) if (scope.has(c)) return true
  return false
}
