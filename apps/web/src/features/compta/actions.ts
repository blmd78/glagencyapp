'use server'

// Server Actions de la Compta. Saisies = manager/sous-manager sur SES rattachés
// (`managerPageGuard` + RLS 0085) ; paiement = admin seul (`adminGuard` + RLS 0085).

import { revalidatePath } from 'next/cache'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import {
  runAction,
  managerPageGuard,
  adminGuard,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { weekEntryInput, payInput } from './schema'

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
 * Enregistre le paiement d'une quinzaine avec son INSTANTANÉ (spec §5.3). `adminGuard` : les
 * virements sont le fait de l'admin seul, un manager ne fait que saisir. Le détail est figé
 * ici — le CA étant ré-ingéré depuis MyPuls, un recalcul ultérieur ferait bouger un montant
 * déjà versé.
 */
export async function payFortnight(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: payInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()

      // On ne fige que des jours RÉVOLUS. Payer une quinzaine en cours gèlerait un CA encore
      // incomplet tout en marquant ses jours couverts — la perte serait définitive et jamais
      // signalée par le bandeau de retard, qui se déduit de la couverture.
      // Une seule lecture d'horloge pour toute l'action : trois appels séparés pourraient
      // tomber de part et d'autre de minuit et dater le paiement autrement que la prime.
      const today = todayParis()
      if (v.coveredDays.some((d) => d >= today)) {
        throw new BusinessError(
          "Cette quinzaine n'est pas terminée — elle ne peut être payée qu'à partir du lendemain de son dernier jour.",
        )
      }

      const { error } = await supabase.from('compta_payments').insert({
        chatter_id: v.chatterId,
        month: v.month,
        period: v.period,
        covered_days: v.coveredDays,
        amount: v.amount,
        ca_reference: v.caReference,
        mode_applied: v.modeApplied,
        rate_applied: v.rateApplied,
        base_amount: v.baseAmount,
        setter_amount: v.setterAmount,
        bonus_amount: v.bonusAmount,
        malus_amount: v.malusAmount,
        handoffs_amount: v.handoffsAmount,
        prime_amount: v.primeAmount,
        sanctions_amount: v.sanctionsAmount,
        note: v.note,
        paid_by: profile.id,
        // `paid_at` a un défaut `CURRENT_DATE` — mais c'est la date du SERVEUR (UTC), pas le
        // jour métier. Un paiement enregistré à 00 h 30 à Paris en été serait daté de la
        // veille. `todayParis()` est le jour métier de toute l'app.
        paid_at: today,
      })
      // 23505 levé par le trigger `compta_payment_no_overlap` (0087) : au moins un des jours
      // couverts l'est déjà par un autre paiement de ce chatteur. C'est la BASE qui l'arbitre,
      // sous verrou consultatif — une lecture préalable ne verrouillerait rien et deux clics
      // concurrents passeraient tous les deux. Le complément d'un paiement PARTIEL reste
      // permis : seul le chevauchement est refusé.
      if (error?.code === '23505') {
        throw new BusinessError('Un paiement couvre déjà au moins un jour de cette quinzaine pour ce chatteur.')
      }
      if (error?.code === '42501') {
        throw new BusinessError("Vous n'avez pas le droit d'enregistrer ce paiement.")
      }
      if (error) throw new Error(error.message)

      // Trace, PAS la garantie. Cet `update` et l'`insert` ci-dessus sont deux allers-retours
      // sans transaction : si celui-ci échoue, la prime reste `'due'` alors qu'elle a été
      // versée. Ce n'est plus un double versement depuis que `get-compta.ts` fait foi sur
      // `compta_payments.prime_amount > 0` (figé, il existe ou non) et non sur ce statut — le
      // statut reste utile comme trace et pour les autres lectures de `compta_primes`.
      // `status = 'due'` explicite : sans ce filtre, une prime déjà `skipped` (renoncée)
      // basculerait en `paid` alors qu'elle n'a rien versé.
      if (v.primeAmount > 0) {
        const { error: primeErr } = await supabase
          .from('compta_primes')
          // `updated_at` posé explicitement : aucun trigger ne le rafraîchit (vérifié sur
          // `pg_trigger`), et `updated_by` sans `updated_at` daterait la trace de la création.
          .update({
            status: 'paid',
            paid_at: today,
            updated_at: new Date().toISOString(),
            updated_by: profile.id,
          })
          .eq('chatter_id', v.chatterId)
          .eq('status', 'due')
        if (primeErr) throw new Error(primeErr.message)
      }

      revalidatePath('/chatter/compta')
    },
  })
}
