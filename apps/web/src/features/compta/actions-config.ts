'use server'

// Les gestes ADMIN des deux nouveaux onglets : le BARÈME setter (Classement) et les SOLDES DES
// PARTANTS (Suivi). Tous admin-seul (`adminGuard`, ou `requireAdminProfile` en tête de handler
// quand celui-ci a besoin du profil — patron §4) + RLS admin (`compta_setter_scale_admin_write`
// 0090, `compta_debts_admin_all` 0084) — spec §6 (« admin : tout, manager : — »).
//
// TROISIÈME fichier d'actions de la feature, et la frontière suit celle des schémas : `actions.ts`
// = ce qui se SAISIT sur une période, `actions-pay.ts` = ce qui se VERSE, celui-ci = ce qui ne
// dépend d'AUCUNE période. Les trois auraient dépassé le plafond de 300 lignes réunis.
//
// `canConfigure` (UI) ne masque que les boutons : c'est `adminGuard` et la RLS qui refusent.

import { revalidatePath } from 'next/cache'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { runAction, adminGuard, noGuard, requireAdminProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { setterScaleInput, debtInput, debtSettleInput, debtDeleteInput } from './schema-config'

/**
 * Une tranche du barème du TOP15 setter. Upsert sur `rank`, PK de la table.
 *
 * ⚠️ CE MONTANT EST DE L'ARGENT RÉTROACTIF SUR LES PÉRIODES NON PAYÉES. La prime setter n'est
 * stockée nulle part : elle se recalcule à chaque rendu depuis le barème et les handoffs
 * (`setter-ranking.ts`). Changer une tranche modifie donc les fiches de TOUTES les périodes
 * encore ouvertes. Les périodes déjà payées, elles, ne bougent pas : `setter_prime_amount` est
 * figé dans l'instantané (0091). C'est exactement pour ça que cette colonne existe.
 */
export async function saveSetterScale(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: setterScaleInput,
    input: raw,
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfile()
      const supabase = await createClient()
      const { error } = await supabase.from('compta_setter_scale').upsert(
        {
          rank: v.rank,
          amount: v.amount,
          // Posé à la main : aucun trigger ne rafraîchit `updated_at` sur les tables compta
          // (même constat que `saveWeekEntry`), et le défaut `now()` ne joue qu'à l'INSERT.
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: 'rank' },
      )
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit de modifier le barème setter.")
      }
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Crée ou met à jour un solde de partant. `id` absent = création.
 *
 * `insert` puis `update` explicites, et non un `upsert` : la PK est un uuid GÉNÉRÉ. Un upsert
 * sans `id` insérerait toujours, et avec un `id` inventé côté client il créerait une ligne à
 * cette clé-là — deux comportements qu'on ne veut ni l'un ni l'autre. Ici, un `id` qui ne
 * correspond à rien met à jour zéro ligne et le dit.
 */
export async function saveDebt(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: debtInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const supabase = await createClient()
      // `''` → `null` : la colonne est nullable, et une chaîne vide s'afficherait comme un modèle
      // dont le nom serait vide plutôt que comme « pas de modèle ».
      const model = v.model === '' ? null : v.model

      if (v.id) {
        const { error, count } = await supabase
          .from('compta_debts')
          .update({ name: v.name, model, amount: v.amount }, { count: 'exact' })
          .eq('id', v.id)
        if (error?.code === '42501') {
          throw new BusinessError("Vous n'avez pas le droit de modifier les soldes.")
        }
        if (error) throw new Error(error.message)
        if (count === 0) throw new BusinessError('Ce solde n’existe plus — recharge la page.')
      } else {
        const { error } = await supabase
          .from('compta_debts')
          .insert({ name: v.name, model, amount: v.amount })
        if (error?.code === '42501') {
          throw new BusinessError("Vous n'avez pas le droit d'ajouter un solde.")
        }
        if (error) throw new Error(error.message)
      }
      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Marque un solde réglé (ou le rouvre). `settled_at` et `settled_by` suivent le booléen : les
 * remettre à `null` à la réouverture évite une trace qui dirait « réglé le 12/07 » sur une dette
 * de nouveau ouverte.
 *
 * Le jour vient de `todayParis()` et non du défaut Postgres : `current_date` est la date du
 * SERVEUR en UTC — un solde marqué à 00 h 30 à Paris en été serait daté de la veille. Même
 * raisonnement que `paid_at` dans `record-payment.ts`.
 */
export async function setDebtSettled(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: debtSettleInput,
    input: raw,
    guard: noGuard,
    handler: async (v) => {
      const profile = await requireAdminProfile()
      const supabase = await createClient()
      const { error, count } = await supabase
        .from('compta_debts')
        .update(
          {
            settled: v.settled,
            settled_at: v.settled ? todayParis() : null,
            settled_by: v.settled ? profile.id : null,
          },
          { count: 'exact' },
        )
        .eq('id', v.id)
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit de modifier les soldes.")
      }
      if (error) throw new Error(error.message)
      if (count === 0) throw new BusinessError('Ce solde n’existe plus — recharge la page.')
      revalidatePath('/chatter/compta')
    },
  })
}

/** Supprime un solde — la ligne saisie par erreur. Un solde RÉGLÉ se marque `settled` et reste
 *  affiché : c'est une trace de ce qui a été soldé, pas un déchet. */
export async function deleteDebt(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: debtDeleteInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const supabase = await createClient()
      const { error } = await supabase.from('compta_debts').delete().eq('id', v.id)
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit de supprimer un solde.")
      }
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/compta')
    },
  })
}
