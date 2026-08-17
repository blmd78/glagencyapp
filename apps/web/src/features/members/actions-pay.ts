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
// Le contrôle admin applicatif (`requireAdminProfile` en tête de handler quand le profil sert
// à `updated_by`, sinon `adminGuard`) n'est que la défense en profondeur — c'est pour ça que
// l'onglet n'est PAS monté pour un manager, qui a pourtant le droit d'ouvrir ce dialog
// (`authorizeRoleAndScope`) : lui afficher des champs dont l'enregistrement serait refusé par
// la RLS le lui apprendrait tard.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, adminGuard, noGuard, requireAdminProfile, type ActionResult } from '@/lib/actions'
import {
  paySettingsInput,
  payPrimeInput,
  payRateInput,
  payRateDeleteInput,
} from '@/lib/pay-settings'
import { writePaySettings, writePrime, writeRate, deleteRate } from '@/lib/pay-settings-write'

/**
 * Revalide les DEUX écrans concernés. La Compta n'écrit plus ces réglages mais elle les
 * AFFICHE (colonne « Rémunération », fiche de paie dépliée, colonne « Prime ») : ne revalider
 * que Membres y laisserait un taux périmé, ce qui est exactement le genre d'écart qu'on ne
 * remarque qu'au moment de payer.
 */
const revalidatePay = () => {
  revalidatePath('/chatter/members')
  revalidatePath('/marketing/members')
  revalidatePath('/formation/members')
  revalidatePath('/chatter/compta')
}

/** Fixe par période (`compta_settings`). Le TAUX n'est plus ici : il est daté (`saveMemberRate`). */
export async function saveMemberPaySettings(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: paySettingsInput,
    input: raw,
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfile()
      await writePaySettings(await createClient(), profile.id, v)
      revalidatePay()
    },
  })
}

/**
 * Taux de commission À PARTIR D'UNE DATE (`compta_rates`, 0093).
 *
 * Renvoie `true` si une ligne d'historique a été posée, `false` si le taux demandé était DÉJÀ
 * celui en vigueur à cette date — `writeRate` refuse alors d'écrire (cf. son commentaire), et
 * l'écran doit pouvoir dire lequel des deux s'est produit plutôt que d'annoncer une
 * augmentation qui n'a pas eu lieu.
 */
export async function saveMemberRate(raw: unknown): Promise<ActionResult<boolean>> {
  return runAction({
    schema: payRateInput,
    input: raw,
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfile()
      const written = await writeRate(await createClient(), profile.id, v)
      revalidatePay()
      return written
    },
  })
}

/** Supprime une décision de taux mal datée (`compta_rates`). Ne touche à aucun paiement déjà
 *  enregistré : ceux-là portent leur propre instantané (`compta_payments.rates_applied`). */
export async function deleteMemberRate(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: payRateDeleteInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      await deleteRate(await createClient(), v)
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
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfile()
      await writePrime(await createClient(), profile.id, v)
      revalidatePay()
    },
  })
}
