'use server'

// Server Actions de SAISIE de la Compta : saisies hebdo = manager/sous-manager sur SES rattachés
// (`managerPageGuard` + RLS 0085) ; réglages, prime et lien MyPuls = admin seul (`adminGuard` +
// RLS `compta_settings_admin_write` / `compta_primes_admin_write`).
//
// LES DEUX GESTES DE PAIEMENT VIVENT DANS `actions-pay.ts` — ce fichier avait atteint 342 lignes
// (plafond de 300, CLAUDE.md) et le paiement groupé en ajoutait autant. Frontière : ici ce qui
// se SAISIT, là ce qui se VERSE.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { applyChatterLink } from '@/lib/chatter-link'
import {
  runAction,
  managerPageGuard,
  adminGuard,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { weekEntryInput, settingsInput, primeInput, chatterLinkInput } from './schema'

/**
 * Crée ou met à jour la saisie HEBDOMADAIRE d'un chatteur (bonus, malus, handoffs, fixe
 * setter). Upsert sur la clé métier `(chatter_id, week_start)`. La RLS refuse la ligne si la
 * cible n'est pas un rattaché direct — la garde applicative n'est que la défense en profondeur.
 */
export async function saveWeekEntry(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: weekEntryInput,
    input: raw,
    guard: managerPageGuard('compta'),
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()
      const { error } = await supabase.from('compta_week_entries').upsert(
        {
          chatter_id: v.chatterId,
          week_start: v.weekStart,
          bonus: v.bonus,
          malus: v.malus,
          handoffs: v.handoffs,
          fixe_setter: v.fixeSetter,
          note: v.note,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id,week_start' },
      )
      // 42501 = violation RLS : la cible est hors périmètre. Message MÉTIER, pas Sentry.
      if (error?.code === '42501') throw new BusinessError("Ce chatteur n'est pas dans ton périmètre.")
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Réglages de rémunération d'un membre : le TAUX de commission et le FIXE de la période.
 * `adminGuard` et non `managerPageGuard` : la spec §6 réserve `compta_settings` à l'admin en
 * écriture, et la RLS `compta_settings_admin_write` (`for all` sous `is_admin()` en `using` ET
 * `with check`) est le verrou réel — la garde n'est que la défense en profondeur.
 *
 * Upsert sur `chatter_id`, PK de la table : un membre n'a qu'une ligne de réglages, créée à sa
 * première configuration. Tant qu'elle n'existe pas, `loadComptaRows` applique les défauts de
 * la colonne (10 %, fixe 0).
 */
export async function saveComptaSettings(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: settingsInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()
      const { error } = await supabase.from('compta_settings').upsert(
        {
          chatter_id: v.chatterId,
          rate: v.rate,
          fixed_amount: v.fixedAmount,
          // Posé à la main : aucun trigger ne rafraîchit `updated_at` sur ces tables (même
          // constat que `saveWeekEntry`), et le défaut `now()` ne joue qu'à l'INSERT.
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id' },
      )
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit de modifier les réglages de paie.")
      }
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Prime « nouveau chatteur » — créée ou modifiée À LA MAIN par l'admin (spec §2). Upsert sur
 * `chatter_id`, PK de la table : un membre n'a qu'une prime.
 *
 * Une prime déjà VERSÉE est refusée à l'écriture : `payPeriod` a posé `status = 'paid'` et
 * `paid_at`, qui sont la trace du virement. La réécrire en `'due'` ne provoquerait aucun double
 * versement — `coverage.primePaid` fait foi sur l'instantané figé `compta_payments.prime_amount`
 * (cf. `coverage.ts`) — mais effacerait cette trace. Le formulaire ne la propose pas non plus.
 */
export async function savePrime(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: primeInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()

      // `maybeSingle` : la ligne n'existe pas tant que la prime n'a jamais été créée.
      const { data: existing, error: readErr } = await supabase
        .from('compta_primes')
        .select('status')
        .eq('chatter_id', v.chatterId)
        .maybeSingle()
      if (readErr) throw new Error(readErr.message)
      if (existing?.status === 'paid') {
        throw new BusinessError('La prime de ce chatteur a déjà été versée — elle ne peut plus être modifiée.')
      }

      const { error } = await supabase.from('compta_primes').upsert(
        {
          chatter_id: v.chatterId,
          amount: v.amount,
          status: v.status,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'chatter_id' },
      )
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit de modifier la prime de ce chatteur.")
      }
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Relie un membre à son chatteur MyPuls SANS quitter la compta (`profiles.chatter_id`). Sans
 * ce lien aucun CA n'est calculable, donc aucune fiche de paie : c'est le seul geste qui
 * débloque la ligne, et l'imposer via la page Membres coupait le flux de la paie.
 *
 * `adminGuard` : `applyChatterLink` est admin-seul et IGNORE SILENCIEUSEMENT un non-admin
 * (cf. lib/chatter-link.ts) — sans cette garde, un manager verrait « Membre relié » sans que
 * rien ne soit écrit. La garde est ici le seul rempart : `profiles.chatter_id` est écrit par
 * client SERVICE-ROLE (`auth.admin` est requis ailleurs dans le même helper), donc la RLS ne
 * tranche pas. L'UI ne monte le bouton que pour `canConfigure`, ce qui reste optimiste.
 *
 * La garde d'unicité et la traduction du `23505` viennent du helper partagé avec Membres —
 * une seule implémentation.
 */
export async function linkChatter(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: chatterLinkInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const caller = await getProfile()
      if (!caller) throw new Error('Session expirée')
      await applyChatterLink(createAdminClient(), caller, v.memberId, v.chatterId)
      revalidatePath('/chatter/compta')
      // Le lien est la MÊME colonne que celle affichée par Membres (badge « à relier »,
      // sélecteur de la fiche) : ne revalider que la compta y laisserait une vue périmée.
      revalidatePath('/chatter/members')
      revalidatePath('/marketing/members')
    },
  })
}
