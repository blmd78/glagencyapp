'use server'

// Server Actions des RÉGLAGES DE PAIE d'un membre — onglet « Compta » du dialog de Membres.
//
// FICHIER SÉPARÉ de `actions.ts` : celui-ci écrit `profiles` par client SERVICE-ROLE avec toute
// la mécanique d'autorisation fine de `authz.ts` (manager sur ses rattachés) ; ici on écrit
// `compta_settings` / `compta_primes` SOUS RLS, et c'est ADMIN SEUL. Deux frontières de
// privilèges différentes ne partagent pas de fichier.
//
// ADMIN SEUL, vérifié en base : `compta_settings_admin_write` et `compta_primes_admin_write`
// (migration 0085) sont `for all to authenticated using (is_admin()) with check (is_admin())`.
// `adminGuard` n'est que la défense en profondeur — c'est pour ça que l'onglet n'est PAS monté
// pour un manager, qui a pourtant le droit d'ouvrir ce dialog (`authorizeRoleAndScope`) : lui
// afficher des champs dont l'enregistrement serait refusé par la RLS le lui apprendrait tard.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, adminGuard, type ActionResult } from '@/lib/actions'
import { paySettingsInput, payPrimeInput } from '@/lib/pay-settings'
import { writePaySettings, writePrime } from '@/lib/pay-settings-write'

/**
 * Revalide les DEUX écrans concernés. La Compta n'écrit plus ces réglages mais elle les
 * AFFICHE (colonne « Rémunération », fiche de paie dépliée, colonne « Prime ») : ne revalider
 * que Membres y laisserait un taux périmé, ce qui est exactement le genre d'écart qu'on ne
 * remarque qu'au moment de payer.
 */
const revalidatePay = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
  revalidatePath('/chatter/compta')
}

/** Taux de commission + fixe par période (`compta_settings`). */
export async function saveMemberPaySettings(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: paySettingsInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      await writePaySettings(await createClient(), profile.id, v)
      revalidatePay()
    },
  })
}

/** Montant de la prime « nouveau chatteur » (`compta_primes`) — refus si elle est déjà versée
 *  (garde dans `writePrime`, cf. `lib/pay-settings.ts`). */
export async function saveMemberPrime(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: payPrimeInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      await writePrime(await createClient(), profile.id, v)
      revalidatePay()
    },
  })
}
