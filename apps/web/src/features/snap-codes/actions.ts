'use server'

// Server Actions Codes Snap — écriture : admin sur tout, manager / sous-manager porteur de la
// page sur SES modèles assignés (règle unique : `access.ts`). Contrôle en tête de handler, puis
// écriture SERVICE-ROLE : la RLS `snap_codes_admin_all` (0047) reste admin-only et ne connaît
// pas les assignations — même patron que la To-Do du tracker (garde applicative, service-role).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, requireWriteProfileLive, BusinessError, type ActionResult } from '@/lib/actions'
import { getCreatorScope } from '@/lib/services/creator-scope'
import { encryptSecret } from '@/lib/snap-crypto'
import { canWriteSnapCode } from './access'
import { MDP_KEY_MISSING, SNAP_STATUTS } from './types'

// Même phrase que le Rapport du soir pour le même refus (police-reports/actions.ts).
const DENY_SNAP_SCOPE = "Ce modèle n'est pas dans ton périmètre."

// Zod NON partagé côté client (le tableau appelle l'action directement, pas de form RHF)
// → reste inline (même choix que features/quotas/actions.ts).
const saveSnapCodeInput = z.object({
  creatorId: z.uuid(),
  pseudo: z.string().max(120),
  mdp: z.string().max(120),
  statut: z.enum(SNAP_STATUTS),
  notes: z.string().max(500),
})

/** Upsert de la ligne complète (1 par modèle) — appelé en autosave depuis le tableau. */
export async function saveSnapCode(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: saveSnapCodeInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      // Admin, ou manager / sous-manager porteur de la page (refus en « en tant que ») — puis le
      // MODÈLE visé doit être dans ses assignations. Un appel forgé sur un autre modèle est refusé
      // ici, pas seulement grisé à l'écran.
      const profile = await requireWriteProfileLive('codes-snap')
      // `getCreatorScope` ne requête que pour un encadrant ; `canWriteSnapCode` court-circuite l'admin.
      const assigned = profile.manager ? await getCreatorScope(profile.id, profile.baseRole) : null
      if (!canWriteSnapCode(profile, assigned, values.creatorId)) throw new BusinessError(DENY_SNAP_SCOPE)
      // La SENTINELLE de lecture (« clé de déchiffrement absente ») n'est pas un mot de passe :
      // c'est la valeur que `getSnapCodes` injecte dans le champ quand la clé manque. En
      // autosave, un simple blur la renverrait telle quelle — la chiffrer écraserait l'ancien
      // ciphertext, encore récupérable avec la bonne clé. Refus MÉTIER explicite.
      if (values.mdp === MDP_KEY_MISSING) {
        throw new BusinessError(
          'Mot de passe non enregistré : la valeur affichée est un avertissement (clé de déchiffrement absente), pas le mot de passe.',
        )
      }
      // Chiffré au repos (AES-256-GCM, clé en env) : un dump de la base ne révèle rien.
      // Une clé absente/invalide fait throw encryptSecret — erreur technique, capturée par
      // runAction (Sentry + message générique), jamais le détail brut à l'UI.
      const mdpChiffre = encryptSecret(values.mdp)

      const { error } = await createAdminClient().from('snap_codes').upsert(
        {
          creator_id: values.creatorId,
          pseudo: values.pseudo,
          mdp: mdpChiffre,
          statut: values.statut,
          notes: values.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'creator_id' },
      )
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/codes-snap')
    },
  })
}
