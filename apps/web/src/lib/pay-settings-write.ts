import { rateOn, type RateChange } from '@glagency/core'
import type { createClient } from '@/lib/supabase/server'
import { BusinessError } from '@/lib/actions'
import type {
  PaySettingsInput,
  PayPrimeInput,
  PayRateInput,
  PayRateDeleteInput,
} from './pay-settings'

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
 * applique le défaut de la colonne (fixe 0).
 *
 * NE TOUCHE PLUS AU TAUX depuis la migration 0093 — il est daté et vit dans `compta_rates`
 * (`writeRate` ci-dessous).
 */
export async function writePaySettings(
  supabase: PaySupabase,
  actorId: string,
  v: PaySettingsInput,
): Promise<void> {
  const { error } = await supabase.from('compta_settings').upsert(
    {
      chatter_id: v.chatterId,
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
 * Écrit une ligne d'HISTORIQUE DE TAUX (`compta_rates`, 0093). Upsert sur `(chatter_id,
 * effective_from)`, la PK : ré-enregistrer la même date corrige le taux de ce jour-là au lieu
 * d'empiler deux vérités.
 *
 * ⚠️ N'ÉCRIT QUE SI ÇA CHANGE QUELQUE CHOSE, et c'est ce qui permet de garder UN SEUL bouton
 * « Enregistrer » dans l'onglet (demande du propriétaire, 2026-07-27) : l'admin qui vient
 * corriger le fixe soumet aussi le taux, inchangé, avec la date proposée par défaut. Sans ce
 * garde, chaque enregistrement déposerait une ligne d'historique de plus — un journal de
 * non-événements qui rendrait l'historique illisible en trois semaines.
 *
 * Le test est le BON : « le taux en vigueur ce jour-là est-il déjà celui-ci ? » (`rateOn`), et
 * non « existe-t-il une ligne à cette date ? ». Poser 11 % au 13/07 alors que 11 % courait déjà
 * depuis le 1er juin ne change rien à la paie ; ne pas l'écrire est donc exact.
 *
 * Renvoie `true` si une ligne a été écrite — l'appelant le dit à l'écran (« taux enregistré »)
 * plutôt que de laisser croire à un changement qui n'a pas eu lieu.
 */
export async function writeRate(
  supabase: PaySupabase,
  actorId: string,
  v: PayRateInput,
): Promise<boolean> {
  // Tout l'historique du membre : le taux en vigueur à `effectiveFrom` peut venir de n'importe
  // quelle ligne antérieure. La RLS `compta_rates_read` (0093) borne déjà la lecture.
  const { data: history, error: readErr } = await supabase
    .from('compta_rates')
    .select('effective_from, rate')
    .eq('chatter_id', v.chatterId)
  if (readErr) throw new Error(readErr.message)

  const known: RateChange[] = (history ?? []).map((h) => ({
    effectiveFrom: h.effective_from,
    rate: Number(h.rate),
  }))
  const current = rateOn(v.effectiveFrom, known)
  // `fallback` compte : un membre jamais réglé est « à 10 % » sans qu'aucune ligne ne le dise.
  // Poser explicitement 10 % au 13/07 EST un changement — c'est le passage d'un défaut subi à
  // une décision, et la fiche cesse alors d'afficher son avertissement.
  if (!current.fallback && current.rate === v.rate) return false

  const { error } = await supabase.from('compta_rates').upsert(
    {
      chatter_id: v.chatterId,
      effective_from: v.effectiveFrom,
      rate: v.rate,
      // Posé à la main : aucun trigger ne rafraîchit `updated_at` sur ces tables, et le défaut
      // `now()` ne joue qu'à l'INSERT.
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: 'chatter_id,effective_from' },
  )
  if (error?.code === '42501') {
    throw new BusinessError("Vous n'avez pas le droit de modifier le taux de commission.")
  }
  if (error) throw new Error(error.message)
  return true
}

/**
 * Supprime une ligne d'historique de taux. LE REMÈDE À UNE DATE SAISIE DE TRAVERS : un upsert ne
 * peut que réécrire la ligne DE CETTE DATE, jamais la faire disparaître — sans cette fonction,
 * une augmentation datée du 6 au lieu du 13 resterait dans la paie pour toujours.
 *
 * Aucune garde métier : une ligne d'historique n'est pas un versement, et les paiements déjà
 * enregistrés portent leur propre instantané (`compta_payments.rates_applied`, 0093) — les
 * supprimer ici ne les modifie pas. Seule la RLS admin arbitre.
 */
export async function deleteRate(supabase: PaySupabase, v: PayRateDeleteInput): Promise<void> {
  const { error } = await supabase
    .from('compta_rates')
    .delete()
    .eq('chatter_id', v.chatterId)
    .eq('effective_from', v.effectiveFrom)
  if (error?.code === '42501') {
    throw new BusinessError("Vous n'avez pas le droit de modifier le taux de commission.")
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
