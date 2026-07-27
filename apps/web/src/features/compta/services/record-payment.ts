import * as Sentry from '@sentry/nextjs'
import type { PayPeriod } from '@glagency/core'
import type { createClient } from '@/lib/supabase/server'
import { BusinessError } from '@/lib/actions'
import type { ComptaRow } from '../types'

/**
 * L'ÉCRITURE d'un paiement — l'instantané figé (spec §5.3) puis la trace sur la prime. Appelée
 * par les DEUX gestes de paiement (`actions-pay.ts`) : le paiement unitaire d'une fiche et le
 * paiement groupé de toute la période. Une seconde implémentation divergerait un jour sur une
 * colonne de l'instantané ou sur la traduction d'un code d'erreur — c'est exactement le défaut
 * que `loadComptaRows` a corrigé côté CALCUL, appliqué ici côté ÉCRITURE.
 *
 * SEUL FICHIER DE `services/` QUI ÉCRIT (le dossier est la couche lecture, cf.
 * `guidelines-standard-feature.md` §1). Il ne pouvait pas vivre dans `actions-pay.ts` : un
 * fichier `'use server'` transforme CHACUN de ses exports en endpoint appelable depuis le
 * navigateur — l'helper y deviendrait un moyen d'écrire un paiement en contournant `adminGuard`
 * et le recalcul serveur.
 *
 * CE QUE CETTE FONCTION NE FAIT PAS, ET NE DOIT PAS FAIRE : ni garde de droit (`adminGuard`),
 * ni garde de période échue, ni recalcul, ni `revalidatePath`. Elle reçoit une `ComptaRow` que
 * l'appelant vient de recalculer côté serveur, et écrit ce qu'elle contient. Le paiement groupé
 * l'appelle ~100 fois : y mettre un `revalidatePath` le ferait cent fois.
 */

/** Le client Supabase LIÉ À LA SESSION (`@/lib/supabase/server`) — jamais le client admin : la
 *  RLS `compta_payments_admin_write` (0085) reste le verrou réel de l'écriture. */
type ComptaClient = Awaited<ReturnType<typeof createClient>>

export async function recordPayment({
  supabase,
  row,
  period,
  coveredDays,
  note,
  paidBy,
  today,
}: {
  supabase: ComptaClient
  /** Fiche RECALCULÉE CÔTÉ SERVEUR (`loadComptaRows`) — c'est son `payslip` qui est figé, jamais
   *  des montants venus du navigateur. */
  row: ComptaRow
  period: PayPeriod
  /** Jours que ce paiement couvre. Choix de l'appelant, pas un résultat de calcul : un
   *  règlement partiel n'en couvre qu'une partie (spec §3, §10). */
  coveredDays: string[]
  note: string | null
  paidBy: string
  /** Jour métier (`todayParis()`), lu UNE fois par l'appelant : `paid_at` a bien un défaut
   *  `CURRENT_DATE`, mais c'est la date du SERVEUR en UTC — un paiement enregistré à 00 h 30 à
   *  Paris en été serait daté de la veille. */
  today: string
}): Promise<void> {
  const p = row.payslip

  const { error } = await supabase.from('compta_payments').insert({
    chatter_id: row.id,
    period_start: period.start,
    covered_days: coveredDays,
    amount: p.net,
    ca_reference: p.ca,
    rate_applied: row.rate,
    base_amount: p.base,
    setter_amount: p.setter,
    bonus_amount: p.bonus,
    malus_amount: p.malus,
    handoffs_amount: p.handoffsAmount,
    prime_amount: p.prime,
    sanctions_amount: p.sanctions,
    note,
    paid_by: paidBy,
    paid_at: today,
  })
  // 23505 levé par le trigger `compta_payment_no_overlap` (0087) : au moins un des jours
  // couverts l'est déjà par un autre paiement de CE chatteur. C'est la BASE qui l'arbitre, sous
  // verrou consultatif par chatteur — une lecture préalable ne verrouillerait rien et deux clics
  // concurrents passeraient tous les deux. Le complément d'un paiement PARTIEL reste permis :
  // seul le chevauchement est refusé.
  // Vérifié sur l'UAT le 2026-07-27 (transaction annulée) : recouvrement même chatteur → 23505 ;
  // MÊMES jours pour un AUTRE chatteur → accepté ; période suivante du même chatteur → acceptée.
  // Aucune autre contrainte d'unicité n'existe sur la table (seule la PK `id`, un uuid généré) :
  // un 23505 ici ne peut donc rien signifier d'autre que « déjà payé ».
  if (error?.code === '23505') {
    throw new BusinessError('Un paiement couvre déjà au moins un jour de cette période pour ce chatteur.')
  }
  if (error?.code === '42501') {
    throw new BusinessError("Vous n'avez pas le droit d'enregistrer ce paiement.")
  }
  if (error) throw new Error(error.message)

  // Trace, PAS la garantie. Cet `update` et l'`insert` ci-dessus sont deux allers-retours sans
  // transaction. La garantie contre le double versement, c'est `coverage.primePaid`, qui fait
  // foi sur l'instantané figé `compta_payments.prime_amount` (cf. `coverage.ts`) — le paiement
  // existe ou n'existe pas. `status = 'due'` explicite : sans ce filtre, une prime `skipped`
  // (renoncée) basculerait en `paid` alors qu'elle n'a rien versé.
  if (p.prime > 0) {
    const { error: primeErr } = await supabase
      .from('compta_primes')
      // `updated_at` posé explicitement : aucun trigger ne le rafraîchit sur ces tables
      // (vérifié sur `pg_trigger`), et `updated_by` sans `updated_at` daterait la trace de la
      // création de la ligne.
      .update({ status: 'paid', paid_at: today, updated_at: new Date().toISOString(), updated_by: paidBy })
      .eq('chatter_id', row.id)
      .eq('status', 'due')

    // ON NE LÈVE PAS. Changement assumé du 2026-07-27 : `payPeriod` levait ici, ce qui faisait
    // rapporter un ÉCHEC sur un paiement DÉJÀ ENREGISTRÉ — le pire des comptes-rendus possible
    // sur de l'argent. L'admin réessayait, tombait sur le 23505 du trigger, et ne savait plus
    // ce qui était passé. Le paiement est écrit, la garantie anti-double-versement tient (voir
    // ci-dessus) : seule la TRACE manque, et Sentry la réclame.
    if (primeErr) {
      Sentry.captureException(
        new Error(
          `compta: prime non marquée 'paid' après paiement (membre ${row.id}, période ${period.start}) — ${primeErr.message}`,
        ),
      )
    }
  }
}
