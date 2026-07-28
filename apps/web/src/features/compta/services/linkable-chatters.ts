import { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * Options du dialog « Relier à MyPuls » : les chatteurs MyPuls ENCORE LIBRES, c'est-à-dire
 * qu'aucun `profiles.chatter_id` ne réclame déjà. Proposer les autres n'offrirait que des
 * refus — `applyChatterLink` (lib/chatter-link.ts) rejette un chatteur déjà pris.
 *
 * SORTI DE `compta-sources.ts` le 2026-07-28 (le fichier passait 300 lignes, CLAUDE.md), et la
 * frontière est nette : cette lecture ne dépend d'AUCUNE période de paie, ne lit aucune table
 * `compta_*`, et ne sert qu'à un dialog. Elle n'avait de commun avec ses voisines que le fichier.
 *
 * ⚠️ APPELÉE UNIQUEMENT POUR UN ADMIN (cf. `get-compta.ts`), même motif que `get-members.ts` :
 * c'est une liste AGENCE-WIDE lue par client admin, hors de tout périmètre RLS, et poser le lien
 * est admin-seul (`applyChatterLink` + `adminGuard`). Un manager ne doit pas la recevoir dans son
 * payload.
 *
 * `fetchAll` sur les deux lectures : PostgREST tronque à 1000 lignes EN SILENCE (CLAUDE.md,
 * guidelines-data-loading §2). 318 chatteurs mesurés sur l'UAT le 2026-07-27 — sous le plafond
 * aujourd'hui, mais la table grossit à chaque nouveau chatteur MyPuls, et tronquée elle ferait
 * DISPARAÎTRE des options sans une seule erreur. `.order('id')` = la PK → pagination
 * déterministe (l'ordre d'affichage est refait par nom plus bas).
 */
export async function loadLinkableChatters(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient()
  const [{ data: chatters, error: chattersErr }, { data: linked, error: linkedErr }] =
    await Promise.all([
      fetchAll<{ id: string; display_name: string | null }>((f, t) =>
        admin.from('chatters').select('id, display_name').order('id').range(f, t),
      ),
      fetchAll<{ chatter_id: string | null }>((f, t) =>
        admin.from('profiles').select('chatter_id').not('chatter_id', 'is', null).order('id').range(f, t),
      ),
    ])
  if (chattersErr) throw new Error(chattersErr.message)
  if (linkedErr) throw new Error(linkedErr.message)

  const taken = new Set((linked ?? []).map((p) => p.chatter_id))
  return (chatters ?? [])
    .filter((c) => c.display_name && !taken.has(c.id))
    .map((c) => ({ id: c.id, name: c.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
