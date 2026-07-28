'use server'

// Les deux gestes de PAIEMENT de la Compta — `adminGuard` + RLS `compta_payments_admin_write`
// (0085) : les virements sont le fait de l'admin seul, un manager ne fait que saisir (spec §6).
//
// FICHIER SÉPARÉ D'`actions.ts`, qui garde les saisies, les réglages, la prime et le lien
// MyPuls : celui-ci atteignait déjà 342 lignes (plafond de 300, CLAUDE.md) et le paiement groupé
// en ajoutait autant. La frontière n'est pas arbitraire — d'un côté ce qui se SAISIT, de l'autre
// ce qui se VERSE, avec des gardes différentes.
//
// L'écriture elle-même vit dans `services/record-payment.ts` : un fichier `'use server'`
// transforme chacun de ses exports en endpoint appelable depuis le navigateur, l'helper partagé
// ne peut donc pas y figurer sans devenir un moyen d'écrire un paiement sans passer par les
// gardes ci-dessous.

import * as Sentry from '@sentry/nextjs'
import { revalidatePath } from 'next/cache'
import { daysIn, recentPeriods, round2, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { eur2 } from '@/lib/format'
import { runAction, adminGuard, BusinessError, type ActionResult } from '@/lib/actions'
import { loadComptaRows } from './services/compta-rows'
import { recordPayment } from './services/record-payment'
import { payInput, payAllInput } from './schema'
import { planBatchPay, type PayAllSummary } from './types'

/**
 * Enregistre le paiement d'UNE fiche avec son INSTANTANÉ (spec §5.3). Le détail est figé ici —
 * le CA étant ré-ingéré depuis MyPuls, un recalcul ultérieur ferait bouger un montant déjà versé.
 *
 * Le montant versé est RECALCULÉ ici (cf. bloc « recalcul serveur ») et refusé s'il s'écarte
 * de plus de 0,01 € du payload : ce qu'on fige, c'est ce que le serveur a calculé.
 */
export async function payPeriod(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: payInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()

      // On ne fige que des jours RÉVOLUS. Payer une période en cours gèlerait un CA encore
      // incomplet tout en marquant ses jours couverts — la perte serait définitive et jamais
      // signalée par le bandeau de retard, qui se déduit de la couverture.
      // Ce garde raisonne sur les JOURS COUVERTS, pas sur le découpage : le passage aux périodes
      // de 14 jours ne le change en rien.
      // Une seule lecture d'horloge pour toute l'action : trois appels séparés pourraient
      // tomber de part et d'autre de minuit et dater le paiement autrement que la prime.
      const today = todayParis()
      if (v.coveredDays.some((d) => d >= today)) {
        throw new BusinessError(
          "Cette période n'est pas terminée — elle ne peut être payée qu'à partir du lendemain de son dernier jour.",
        )
      }

      // ── RECALCUL SERVEUR ────────────────────────────────────────────────────────────────
      // Le navigateur envoie tout l'instantané ; les recopier en base ferait du CLIENT l'autorité
      // sur ce qui est versé. On refait donc le calcul ici, par LE code de la page
      // (`loadComptaRows`, une seule implémentation — deux divergeraient), et c'est ce
      // résultat-là qui est écrit.
      //
      // Le cas réel n'est pas la malveillance mais l'ONGLET PÉRIMÉ : l'admin ouvre la compta,
      // un manager saisit un malus ou la Police pose une sanction entre-temps, l'admin clique
      // « Marquer payé ». `revalidatePath` invalide le cache serveur, jamais une page déjà
      // rendue dans un navigateur — sans ce recalcul, le montant figé serait celui d'AVANT la
      // saisie, et rien ne le signalerait. Le `superRefine` du schéma ne peut pas l'attraper :
      // les nombres périmés sont cohérents ENTRE EUX (cf. `schema.ts`).
      //
      // Il reste une fenêtre de quelques millisecondes entre ce recalcul et l'`insert` — pas de
      // transaction possible depuis supabase-js. On ferme un trou qui se compte en MINUTES
      // (l'onglet ouvert) avec un trou qui se compte en millisecondes ; le chevauchement de
      // jours, lui, est arbitré par la base sous verrou (trigger 0087).
      // La période est validée PAR APPARTENANCE à la fenêtre proposée, comme dans
      // `get-compta.ts` : `periodStart` est un lundi aligné sur le découpage ou n'est rien.
      // Un `iso` bien formé mais décalé fabriquerait une période chevauchant ses voisines.
      const choices = recentPeriods(today, 12)
      const period = choices.find((p) => p.start === v.periodStart)
      if (!period) {
        throw new BusinessError("Cette période n'est plus dans la fenêtre payable — recharge la page.")
      }
      const { rows } = await loadComptaRows({ period, today, memberId: v.chatterId })
      const row = rows[0]
      // Ni le membre, ni la RLS : soit le compte a disparu, soit il n'est plus rôle chatteur.
      if (!row) throw new BusinessError('Ce membre est introuvable dans la compta — recharge la page.')

      const p = row.payslip
      // Tolérance 0,01 € : `computePayslip` arrondit chaque composante à 2 décimales, la somme
      // en flottant peut dériver d'un centime. Toutes les lignes sont comparées, pas seulement
      // le net : deux dérives opposées (bonus +5, malus +5) laisseraient le net intact tout en
      // figeant un détail faux.
      const checks: [label: string, sent: number, computed: number][] = [
        ['net', v.amount, p.net],
        ['CA de référence', v.caReference, p.ca],
        ['base', v.baseAmount, p.base],
        ['fixe setter', v.setterAmount, p.setter],
        ['bonus', v.bonusAmount, p.bonus],
        ['malus', v.malusAmount, p.malus],
        ['handoffs', v.handoffsAmount, p.handoffsAmount],
        ['prime', v.primeAmount, p.prime],
        ['sanctions', v.sanctionsAmount, p.sanctions],
        // La PRIME SETTER (0091) est la plus volatile des huit : elle ne vient d'aucune saisie
        // propre au membre mais de son RANG dans le classement de toute l'agence — un handoff
        // saisi chez QUELQU'UN D'AUTRE pendant que l'onglet est ouvert la fait bouger. Sans
        // cette ligne, l'admin figerait une prime que l'écran ne montrait déjà plus.
        ['prime setter', v.setterPrimeAmount, p.setterPrime],
      ]
      // Plus de contrôle sur le mode de rémunération : il n'y en a plus qu'un (0089). Le fixe,
      // lui, EST vérifié — il arrive dans la ligne « fixe setter » ci-dessus, qu'il vienne du
      // réglage ou d'une saisie hebdo.
      const drifted = checks
        .filter(([, sent, computed]) => Math.abs(sent - computed) > 0.01)
        .map(([label]) => label)
      // ── LE TAUX, COMPARÉ COMME UNE SÉQUENCE (0093) ────────────────────────────────────────
      // Il n'y a plus « un » taux à comparer, mais une SEGMENTATION : des bornes de dates et un
      // taux pour chacune. Comparer les seuls taux laisserait passer un découpage décalé — même
      // 10 % puis 11 %, mais avec la bascule au 14/07 au lieu du 13/07, ce qui change le net.
      // On compare donc la séquence entière, sérialisée, à l'identique (aucune tolérance : ce ne
      // sont pas des montants, il n'y a pas d'arrondi à absorber).
      const shape = (s: { from: string; to: string; rate: number }) => `${s.from}..${s.to}@${s.rate}`
      if (v.ratesApplied.map(shape).join('|') !== p.segments.map(shape).join('|')) {
        drifted.push('taux appliqué')
      }
      if (drifted.length > 0) {
        throw new BusinessError(
          `La fiche de ${row.name} a changé depuis l'ouverture de la page (${drifted.join(', ')}). ` +
            `Net recalculé : ${eur2(p.net)} au lieu de ${eur2(v.amount)}. ` +
            "Recharge la page avant d'enregistrer ce paiement.",
        )
      }

      // Les MONTANTS RECALCULÉS sont écrits, pas ceux du payload : ils viennent d'être vérifiés
      // équivalents, et l'instantané doit être celui que le serveur a arbitré (`recordPayment`
      // ne connaît que `row`). `coveredDays` et `note` restent ceux de la requête — ce sont des
      // choix de l'admin, pas des résultats de calcul. `period` est l'option de la fenêtre que
      // le `find` ci-dessus a reconnue : même valeur que `v.periodStart`, mais issue du
      // découpage serveur et non de la chaîne reçue.
      await recordPayment({
        supabase,
        row,
        period,
        coveredDays: v.coveredDays,
        note: v.note,
        paidBy: profile.id,
        today,
      })

      revalidatePath('/chatter/compta')
    },
  })
}

/**
 * Nombre de paiements menés DE FRONT. Le verrou consultatif du trigger 0087 sérialise PAR
 * CHATTEUR (`pg_advisory_xact_lock(hashtext(chatter_id))`), jamais globalement — vérifié sur
 * l'UAT le 2026-07-27 : deux chatteurs différents, MÊMES jours couverts, les deux insertions
 * passent. Des paiements de membres distincts ne se croisent donc pas.
 *
 * POURQUOI PAS EN SÉQUENTIEL : ~100 allers-retours PostgREST. Mesuré depuis ce poste vers
 * l'UAT, 20 requêtes : 2,01 s en séquentiel contre 0,36 s en pool de 5 (curl, une poignée de
 * main TLS par requête — majorant). Extrapolé à 100 fiches : ~10 s contre ~2 s.
 *
 * POURQUOI PAS PLUS : au-delà, on empile des connexions Postgres pour gagner des dixièmes sur
 * un geste que l'admin fait deux fois par mois.
 */
const PAY_CONCURRENCY = 5

/**
 * PAIEMENT GROUPÉ d'une période : toutes les fiches payables, en un geste. Sur une centaine de
 * membres, régler chatteur par chatteur depuis sa fiche dépliée n'est pas tenable.
 *
 * MÊME CHEMIN que le paiement unitaire, et c'est le point : même garde (`adminGuard`), même
 * calcul (`loadComptaRows`), même écriture (`recordPayment`), donc même instantané et même
 * traitement des conflits. Rien du navigateur n'entre dans ce qui est écrit — contrairement au
 * paiement unitaire, ce payload ne porte AUCUN montant d'instantané (cf. `payAllInput`).
 *
 * UN ÉCHEC N'ARRÊTE PAS LE LOT. Chaque `insert` PostgREST est sa propre transaction : le 23505
 * d'un chatteur n'annule rien chez les autres (vérifié sur l'UAT — dans UNE transaction psql,
 * au contraire, l'échec avorte tout ce qui suit). Les échecs sont collectés, nommés et motivés
 * dans `PayAllSummary` ; le compte-rendu dit ce qui est PASSÉ, jamais ce qui était prévu.
 */
export async function payAllForPeriod(raw: unknown): Promise<ActionResult<PayAllSummary>> {
  return runAction({
    schema: payAllInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await getProfile()
      if (!profile) throw new Error('Session expirée')
      const supabase = await createClient()

      // Une seule lecture d'horloge pour tout le lot — sinon deux fiches du même lot pourraient
      // être datées de part et d'autre de minuit.
      const today = todayParis()
      const period = recentPeriods(today, 12).find((p) => p.start === v.periodStart)
      if (!period) {
        throw new BusinessError("Cette période n'est plus dans la fenêtre payable — recharge la page.")
      }
      // Même prédicat « période échue » que `periodElapsed`, `overduePeriods` et le garde de
      // `payPeriod` (qui l'exprime jour par jour sur `coveredDays` — équivalent ici, le lot
      // couvrant toujours la période entière, dont `period.end` est le dernier jour).
      if (period.end >= today) {
        throw new BusinessError(
          "Cette période n'est pas terminée — elle ne peut être payée qu'à partir du lendemain de son dernier jour.",
        )
      }

      // Recalcul serveur de TOUTE la population — le même appel que la page, sans `memberId`.
      const { rows } = await loadComptaRows({ period, today })
      const plan = planBatchPay(rows)

      // ── CONTRÔLE DE DÉRIVE ──────────────────────────────────────────────────────────────
      // L'équivalent, pour le lot, de la comparaison ligne à ligne du paiement unitaire. On
      // refuse EN BLOC plutôt que de payer un sous-ensemble : l'admin a validé « N personnes,
      // X € », verser autre chose sans qu'il l'ait vu est précisément ce que ce dialog existe
      // pour empêcher. Le remède est de recharger, pas d'arbitrer à sa place.
      const expected = [...v.memberIds].sort()
      const actual = plan.payable.map((r) => r.id).sort()
      const sameSet = expected.length === actual.length && expected.every((id, i) => id === actual[i])
      if (!sameSet || Math.abs(plan.total - v.total) > 0.01) {
        throw new BusinessError(
          `La compta a changé depuis l'ouverture de la page : ${plan.payable.length} chatteur(s) à payer pour ` +
            `${eur2(plan.total)}, au lieu de ${v.memberIds.length} pour ${eur2(v.total)}. ` +
            'Recharge la page avant de lancer le paiement groupé.',
        )
      }

      // ── EXÉCUTION ───────────────────────────────────────────────────────────────────────
      // Un slot par fiche, rempli à `null` en cas de succès et par le motif en cas d'échec :
      // les résultats restent alignés sur `plan.payable` malgré la concurrence, donc le
      // compte-rendu garde l'ordre d'affichage.
      const days = daysIn(period)
      const outcomes: (string | null)[] = new Array(plan.payable.length).fill(null)

      for (let i = 0; i < plan.payable.length; i += PAY_CONCURRENCY) {
        await Promise.all(
          plan.payable.slice(i, i + PAY_CONCURRENCY).map(async (row, j) => {
            try {
              await recordPayment({
                supabase,
                row,
                period,
                // Le lot couvre la période ENTIÈRE. Les fiches déjà couvertes, même
                // partiellement, en ont été écartées par `planBatchPay` : un règlement partiel
                // se complète à l'unité, pas en masse.
                coveredDays: days,
                note: null,
                paidBy: profile.id,
                today,
              })
            } catch (err) {
              // `BusinessError` = un refus MÉTIER, dont le 23505 du trigger (« déjà payé »).
              // Ce n'est pas une panne : on note le motif et on passe au suivant.
              if (err instanceof BusinessError) {
                outcomes[i + j] = err.message
                return
              }
              // Erreur TECHNIQUE : Sentry la reçoit ici, car `runAction` ne la verra jamais —
              // elle est rattrapée pour ne pas emporter les 99 autres fiches.
              Sentry.captureException(err)
              outcomes[i + j] = "Erreur inattendue — ce paiement n'a pas été enregistré."
            }
          }),
        )
      }

      const failed = plan.payable.flatMap((row, k) => {
        const reason = outcomes[k]
        return reason == null ? [] : [{ name: row.name, reason }]
      })
      const done = plan.payable.filter((_, k) => outcomes[k] == null)

      // UNE SEULE FOIS, à la fin : dans la boucle, ce serait cent invalidations pour un rendu.
      revalidatePath('/chatter/compta')

      // Le total RÉELLEMENT enregistré, jamais `plan.total` : avec un échec partiel, annoncer
      // le montant prévu ferait croire que tout est passé.
      return { paid: done.length, total: round2(done.reduce((s, r) => s + r.payslip.net, 0)), failed }
    },
  })
}
