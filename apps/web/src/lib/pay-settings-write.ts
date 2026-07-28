import type { createClient } from '@/lib/supabase/server'
import { BusinessError } from '@/lib/actions'
import type { PaySettingsInput, PayPrimeInput } from './pay-settings'

/**
 * LES DEUX ÉCRITURES des réglages de paie — cœur partagé, corps INCHANGÉ depuis
 * `features/compta/actions.ts` (2026-07-28).
 *
 * FICHIER SÉPARÉ DE `pay-settings.ts`, et ce n'est pas cosmétique : les CONTRATS (zod) sont
 * importés par `features/compta/schema.ts`, qui remonte jusqu'à des composants clients. Les
 * garder dans le même module que `BusinessError` ferait entrer `@/lib/actions` → `@/lib/auth`
 * → `next/headers` dans le bundle client, et `next build` échoue (vérifié : « You're importing
 * a component that needs next/headers »).
 *
 * ⚠️ La RLS est le verrou RÉEL : `compta_settings_admin_write` et `compta_primes_admin_write`
 * (migration 0085) sont `for all to authenticated using (is_admin()) with check (is_admin())`.
 * Les deux fonctions prennent un client SOUS RLS (jamais service-role) — l'appelant doit en
 * plus poser `adminGuard` en défense en profondeur, comme le faisait la Compta.
 */

type PaySupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Écrit `compta_settings`. Upsert sur `chatter_id`, PK de la table : un membre n'a qu'une ligne
 * de réglages, créée à sa première configuration. Tant qu'elle n'existe pas, `loadComptaRows`
 * applique les défauts de la colonne (10 %, fixe 0).
 */
export async function writePaySettings(
  supabase: PaySupabase,
  actorId: string,
  v: PaySettingsInput,
): Promise<void> {
  const { error } = await supabase.from('compta_settings').upsert(
    {
      chatter_id: v.chatterId,
      rate: v.rate,
      fixed_amount: v.fixedAmount,
      // Posé à la main : aucun trigger ne rafraîchit `updated_at` sur ces tables, et le
      // défaut `now()` ne joue qu'à l'INSERT.
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: 'chatter_id' },
  )
  // 42501 = violation RLS : l'appelant n'est pas admin. Message MÉTIER, pas Sentry.
  if (error?.code === '42501') {
    throw new BusinessError("Vous n'avez pas le droit de modifier les réglages de paie.")
  }
  if (error) throw new Error(error.message)
}

/**
 * Écrit `compta_primes`. Upsert sur `chatter_id`, PK de la table : un membre n'a qu'une prime.
 *
 * UNE PRIME DÉJÀ VERSÉE EST REFUSÉE : `payPeriod` a posé `status = 'paid'` et `paid_at`, qui
 * sont la trace du virement. La réécrire en `'due'` ne provoquerait aucun double versement —
 * `coverage.primePaid` fait foi sur l'instantané figé `compta_payments.prime_amount` (cf.
 * `coverage.ts`) — mais effacerait cette trace. CETTE GARDE EST INDISPENSABLE DEPUIS LA
 * TÂCHE 20 : le payload ne porte plus que le montant, et l'upsert ci-dessous écrit
 * `status: 'due'` en dur — sans elle, un simple enregistrement de montant rétrograderait une
 * prime versée. L'écran ne propose pas le champ dans ce cas, mais l'écran n'est pas un verrou.
 *
 * `status: 'due'` POSÉ PAR LE SERVEUR, et non choisi à l'écran (tâche 20 : le montant seul
 * gouverne, 0 € = pas de prime). Deux effets voulus :
 *  - une ligne NEUVE naît `'due'`, comme le défaut de la colonne (migration 0084) ;
 *  - une ligne héritée `'skipped'` est NORMALISÉE en `'due'` au premier enregistrement. C'est
 *    l'alternative à « omettre la colonne », qui aurait laissé la prime hors du calcul pendant
 *    que l'écran affichait un montant enregistré sans rien dire — un no-op silencieux sur de
 *    l'argent. Ici, l'admin qui ne veut rien verser met 0.
 */
export async function writePrime(
  supabase: PaySupabase,
  actorId: string,
  v: PayPrimeInput,
): Promise<void> {
  // `maybeSingle` : la ligne n'existe pas tant que la prime n'a jamais été créée.
  const { data: existing, error: readErr } = await supabase
    .from('compta_primes')
    .select('status')
    .eq('chatter_id', v.chatterId)
    .maybeSingle()
  if (readErr) throw new Error(readErr.message)
  if (existing?.status === 'paid') {
    throw new BusinessError(
      'La prime de ce chatteur a déjà été versée — elle ne peut plus être modifiée.',
    )
  }

  const { error } = await supabase.from('compta_primes').upsert(
    {
      chatter_id: v.chatterId,
      amount: v.amount,
      status: 'due',
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: 'chatter_id' },
  )
  if (error?.code === '42501') {
    throw new BusinessError("Vous n'avez pas le droit de modifier la prime de ce chatteur.")
  }
  if (error) throw new Error(error.message)
}
