import type { createAdminClient } from '@glagency/db'
import type { Profile } from '@/lib/auth'
import { BusinessError } from '@/lib/actions'

/**
 * Pose le lien `profiles.chatter_id` — réservé admin/superadmin. `Profile.role` (lib/auth)
 * vaut déjà `'admin'` pour un superadmin (rôle base `superadmin` mappé/collapsed dessus,
 * cf. `getProfile`) : un seul test couvre donc les deux, `caller.superadmin` n'étant utile
 * que pour distinguer les deux côté UI. Garde d'unicité : un chatteur ne peut être lié qu'à
 * un membre. Un non-admin (chatteur/manager/sous-manager/police) ne modifie jamais le lien
 * (ignore silencieusement — jamais d'erreur qui bloquerait le reste de la mutation).
 *
 * DÉPLACÉ ICI depuis `features/members/actions.ts` (2026-07-27) — corps, messages et
 * signature INCHANGÉS. La Compta a besoin du même geste (relier un membre sans quitter la
 * page) et les imports inter-features sont interdits (ESLint `import-x/no-restricted-paths`).
 * Deux implémentations auraient divergé sur la garde d'unicité, qui est le seul rempart
 * applicatif contre un chatteur MyPuls lié à deux membres.
 *
 * ⚠️ Le retour silencieux sur non-admin est un choix de `updateMember`/`createMember`, où
 * cet appel n'est qu'UNE étape d'une mutation plus large (un manager édite un membre sans
 * toucher au lien). Tout appelant qui en fait le geste PRINCIPAL doit donc refuser le
 * non-admin AVANT (`adminGuard`), sinon l'action rapporte un succès sans rien avoir écrit.
 */
export async function applyChatterLink(
  admin: ReturnType<typeof createAdminClient>,
  caller: Profile,
  profileId: string,
  chatterId: string,
): Promise<void> {
  if (caller.role !== 'admin') return // non-admin : lien inchangé
  const value = chatterId === '' ? null : chatterId
  if (value) {
    const { data: taken, error } = await admin
      .from('profiles')
      .select('id')
      .eq('chatter_id', value)
      .neq('id', profileId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (taken) {
      throw new BusinessError('Ce chatter est déjà lié à un autre membre.', {
        chatterId: ['Déjà lié ailleurs.'],
      })
    }
  }
  const { error } = await admin.from('profiles').update({ chatter_id: value }).eq('id', profileId)
  if (error) {
    // 23505 = course sur la contrainte `unique` (un autre membre a pris ce chatteur entre le check
    // et l'update) → refus MÉTIER propre (pas une « erreur inattendue » technique + bruit Sentry).
    if (error.code === '23505')
      throw new BusinessError('Ce chatter est déjà lié à un autre membre.', { chatterId: ['Déjà lié ailleurs.'] })
    throw new Error(error.message)
  }
}
