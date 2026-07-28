import { z } from 'zod'
import { payMoney, payRate } from '@/lib/pay-settings'

/**
 * Compta — schémas PARTAGÉS entre les formulaires (RHF + zodResolver) et les Server Actions,
 * même patron que `features/planning/schema.ts`.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')

/** Un montant POSITIF de la compta. RÉEXPORTÉ depuis `lib/pay-settings.ts` (où il a suivi les
 *  réglages de paie partis dans Membres) pour `schema-config.ts` (barème et dettes) et pour
 *  tout ce fichier : deux définitions des mêmes bornes finiraient par diverger, et c'est de
 *  l'argent. */
export const money = payMoney

/**
 * Montant SIGNÉ. UN SEUL emploi dans toute la feature depuis le retrait du report (2026-07-28) :
 * le NET d'une période — malus et sanctions Police peuvent dépasser les gains
 * (`computePayslip`). Enregistrer un net négatif est un constat fidèle — le traitement du
 * solde dû relève de `compta_debts` (spec §9, onglet Suivi).
 *
 * Toutes les autres lignes (`base`, `bonus`, `sanctions`, les primes…) restent des `money`
 * positifs : ce sont des composantes, c'est leur combinaison qui porte le signe.
 */
const signedMoney = z.coerce.number().min(-99999, 'Montant hors bornes').max(99999, 'Montant trop élevé')

/**
 * LES SEGMENTS DE TAUX RÉELLEMENT APPLIQUÉS à la période payée — l'instantané du taux depuis la
 * migration 0093 (`compta_payments.rates_applied jsonb`).
 *
 * `rateApplied: numeric(5,2)` UNIQUE ne pouvait plus rien dire de vrai : 12 chatteurs de la
 * feuille de juillet changent de taux au milieu d'une période. Un seul nombre y aurait décrit
 * une moitié de fiche et menti sur l'autre.
 *
 * PEUT ÊTRE VIDE, et c'est voulu : un membre sans aucun CA sur la période n'a rien à
 * commissionner, donc aucun taux appliqué (spec §10 — ses bonus et primes lui restent dus).
 * Ce qui est interdit, c'est une COMMISSION sans trace du taux : la contrainte
 * `compta_payments_rates_applied_check` (0094) l'exprime côté base (`base_amount = 0 or
 * jsonb_array_length >= 1`), et le `superRefine` ci-dessous la reprend en français.
 *
 * `max(14)` : une période fait 14 jours, donc au plus 14 segments d'un jour. C'est une borne de
 * payload, pas une règle métier.
 *
 * La borne du taux lui-même est `payRate` — la MÊME que celle du réglage saisi dans Membres
 * (`lib/pay-settings.ts`) : deux définitions finiraient par diverger, et c'est de l'argent.
 */
const rateSegments = z
  .array(
    z.object({
      from: iso,
      to: iso,
      rate: payRate,
      fallback: z.boolean(),
    }),
  )
  .max(14, 'Trop de segments de taux')

/**
 * Saisie d'une SEMAINE — bonus/malus/handoffs. (L'ancien `dayEntryInput`, saisie au JOUR,
 * a été retiré : plus aucun consommateur depuis le passage au grain hebdomadaire.)
 *
 * `fixeSetter` a quitté ce contrat le 2026-07-28 (tâche 19), et pas seulement le formulaire :
 * un champ que l'écran ne peut plus produire mais que l'action accepte encore reste une porte
 * ouverte sur de l'argent — un payload fabriqué à la main y écrirait un fixe que personne ne
 * peut voir ni corriger depuis l'interface. Le retirer d'ici le ferme.
 *
 * L'autre option — le garder en l'écrivant à 0 — a été écartée : la colonne
 * `compta_week_entries.fixe_setter` porte de l'HISTORIQUE (elle n'est pas supprimée), et un 0
 * systématique l'effacerait à la première ré-écriture de la ligne. Absent du payload, l'upsert
 * ne touche pas la colonne : elle garde sa valeur sur une ligne existante et prend son défaut
 * (`0`, migration 0084) sur une ligne neuve.
 */
export const weekEntryInput = z.object({
  chatterId: z.uuid(),
  weekStart: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type WeekEntryInput = z.infer<typeof weekEntryInput>
// Type d'ENTRÉE du formulaire (les champs `money`/`z.coerce.number()` ont un input `unknown` —
// input ≠ output). Sert de `TFieldValues` à `useForm` côté client, même patron que
// `ReportFormValues` dans police-reports/schema.ts.
export type WeekEntryFormValues = z.input<typeof weekEntryInput>

// La saisie de la PÉRIODE (`periodEntryInput` — report et prime du mois, table
// `compta_period_entries`) a été RETIRÉE le 2026-07-28 avec les deux concepts qu'elle portait
// (décision de Benoit ; table droppée par la migration 0095).

/**
 * Paiement d'une période — porte l'INSTANTANÉ figé (spec §5.3).
 *
 * `periodStart` (le lundi de départ) a remplacé le couple `month` + `period 1|2` : une période
 * de 14 jours ne se rattache plus à aucun mois, et trois d'entre elles peuvent démarrer dans le
 * même (migration 0088). Le format ISO n'est qu'un pré-filtre — l'APPARTENANCE à la fenêtre
 * proposée est vérifiée par `payPeriod` (`actions-pay.ts`), qui seule connaît l'alignement du
 * découpage.
 */
export const payInput = z
  .object({
    chatterId: z.uuid(),
    periodStart: iso,
    coveredDays: z.array(iso).min(1, 'Au moins un jour couvert'),
    amount: signedMoney,
    caReference: money,
    // `modeApplied` a disparu avec `compta_settings.mode` (migration 0089) : il n'existe plus
    // qu'un seul mode de rémunération — commission + fixe éventuel.
    // `ratesApplied` a remplacé `rateApplied` (migration 0093) : le taux est DATÉ, une période
    // peut en porter plusieurs, et l'instantané doit dire lequel a couvert quels jours.
    ratesApplied: rateSegments,
    baseAmount: money,
    setterAmount: money,
    bonusAmount: money,
    malusAmount: money,
    handoffsAmount: money,
    primeAmount: money,
    sanctionsAmount: money,
    // La PRIME SETTER entre dans l'instantané au même titre que les sept ci-dessus. L'omettre
    // tout en la comptant dans le net était le piège laissé par la tâche 22 : tout paiement
    // d'une fiche qui en porte une aurait été refusé pour « le net n'est pas la somme des
    // lignes ». Ses deux voisines du lot final (`carryoverAmount`, `monthlyPrimeAmount`) ont
    // été retirées le 2026-07-28 avec leurs concepts (décision de Benoit, migration 0095).
    setterPrimeAmount: money,
    note: z.string().trim().max(500, '500 caractères max').nullable(),
  })
  /**
   * L'invariant de la spec §5.3 (`amount = base + setter + bonus − malus + handoffs + prime −
   * sanctions + setterPrime`) VÉRIFIÉ, et non plus seulement documenté — HUIT composantes
   * depuis le retrait du report et de la prime du mois (2026-07-28, migration 0095). La spec le
   * disait « structurel » du fait de colonnes sans valeur par défaut : c'est inexact —
   * l'absence de défaut force à FOURNIR les huit composantes, elle ne contrôle pas leur SOMME,
   * et la base ne les arbitre pas non plus.
   *
   * CE QUE CE REFINE ATTRAPE, ET RIEN D'AUTRE : une incohérence INTERNE au payload —
   * falsification à la main d'un des montants, ou divergence entre la formule du client et
   * celle du serveur. Rien de plus.
   *
   * CE QU'IL N'ATTRAPE PAS — l'ONGLET PÉRIMÉ. Les nombres du payload viennent tous du même rendu, et
   * `computePayslip` (`packages/core/src/compta/payslip.ts`) garantit cette égalité PAR
   * CONSTRUCTION sur toute sortie : un payload périmé est parfaitement cohérent avec lui-même
   * et passe ce contrôle. Ce cas-là est traité par le RECALCUL SERVEUR de `payPeriod`
   * (`actions-pay.ts`), qui refait le calcul et refuse au-delà de 0,01 € d'écart. Ce commentaire a
   * affirmé le contraire jusqu'au 2026-07-27 : documenter une protection inexistante est pire
   * que ne rien documenter.
   *
   * Gardé quand même : défense en profondeur, coût nul, et il s'exécute AVANT toute lecture
   * base côté serveur.
   *
   * Tolérance 0,01 € : `computePayslip` arrondit déjà chaque composante à 2 décimales, mais
   * leur somme en flottant peut dériver d'un centime.
   */
  .superRefine((v, ctx) => {
    // UNE COMMISSION SANS TAUX EST INTRAÇABLE (0094). L'instantané existe pour qu'on puisse
    // refaire le calcul dix-huit mois plus tard : une base non nulle sans segment de taux ne
    // le permet plus. Le cas inverse — 0 € de base et aucun segment — est légitime (aucun CA
    // à commissionner, spec §10) et passe.
    if (v.baseAmount !== 0 && v.ratesApplied.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message:
          "Cette fiche verse une commission sans indiquer à quel taux. Recharge la page ; si l'erreur persiste, préviens l'admin technique.",
        path: ['ratesApplied'],
      })
    }

    const expected =
      v.baseAmount +
      v.setterAmount +
      v.bonusAmount -
      v.malusAmount +
      v.handoffsAmount +
      v.primeAmount -
      v.sanctionsAmount +
      v.setterPrimeAmount
    if (Math.abs(v.amount - expected) <= 0.01) return

    // Message calé sur ce que le refine détecte VRAIMENT : le net envoyé ne s'additionne pas à
    // partir des lignes envoyées. Ce n'est pas un onglet périmé (celui-ci reste cohérent avec
    // lui-même, cf. le commentaire ci-dessus) — donc pas de « la fiche a changé ».
    const message =
      "Le montant envoyé ne correspond pas au détail envoyé (le net n'est pas la somme des lignes). Recharge la page ; si l'erreur persiste, préviens l'admin technique."
    ctx.addIssue({ code: 'custom', message, path: ['amount'] })
    // Doublon à la RACINE, volontaire : `runAction` ne remonte dans `error` que les issues
    // `custom` de path VIDE (lib/actions.ts), et le paiement passe par un `ConfirmDialog` qui
    // n'affiche que `error` — jamais les `fieldErrors`. Sans cette seconde issue, l'admin
    // lirait « Saisie invalide » et n'aurait aucune raison de recharger.
    ctx.addIssue({ code: 'custom', message })
  })
export type PayInput = z.infer<typeof payInput>

/**
 * PAIEMENT GROUPÉ d'une période — tout le lot en un geste (admin seul, `payAllForPeriod`).
 *
 * ⚠️ CE PAYLOAD NE DÉCRIT PAS CE QUI SERA VERSÉ. L'action recalcule intégralement la population
 * payable et son total par `loadComptaRows` + `planBatchPay`, et n'écrit QUE ce résultat-là :
 * aucun des montants de l'instantané ne transite par le navigateur, contrairement au paiement
 * unitaire (`payInput`, qui porte tout l'instantané).
 *
 * `memberIds` et `total` ne servent donc qu'à VÉRIFIER que l'écran cliqué disait bien la même
 * chose que le serveur — l'équivalent, pour le lot, du contrôle de dérive du paiement unitaire.
 * C'est le cas de l'ONGLET PÉRIMÉ : un manager saisit un malus, la Police pose une sanction, ou
 * un autre admin règle trois fiches pendant que le dialog « Payer 87 chatters — 42 300 € » est
 * ouvert. Sans cette comparaison, l'admin validerait un montant et un lot qu'il n'a jamais vus.
 */
export const payAllInput = z.object({
  periodStart: iso,
  /** Les membres que l'écran annonçait. `max` : borne de payload, ~100 membres en prod. */
  memberIds: z.array(z.uuid()).min(1, 'Aucun chatteur à payer').max(500, 'Lot trop grand'),
  /**
   * Total ANNONCÉ à l'écran. Borne propre, et non `money`/`netMoney` (99 999 €) : un lot d'une
   * centaine de fiches peut dépasser ce plafond, qui transformerait alors un paiement légitime
   * en « Saisie invalide » sans rien expliquer. `min(0)` est un garde en plus : `planBatchPay`
   * écarte les nets négatifs, un total négatif ne peut donc pas venir de l'écran.
   */
  total: z.coerce.number().min(0, 'Total positif attendu').max(9_999_999, 'Total hors bornes'),
})
export type PayAllInput = z.infer<typeof payAllInput>

// Les RÉGLAGES DE PAIE (taux, fixe, prime) ONT QUITTÉ CE FICHIER le 2026-07-28 : ce sont des
// attributs de la personne, pas de la période, et ils se saisissent maintenant dans l'onglet
// « Compta » du dialog de Membres. Contrats et écritures : `lib/pay-settings.ts`
// (`paySettingsInput`, `payPrimeInput`) — la Compta les LIT toujours, elle ne les écrit plus.

/**
 * Lien `profiles.chatter_id` posé DEPUIS la compta — ADMIN seul. Sans lien, aucun CA n'est
 * calculable, et la ligne n'affichait qu'un avertissement + un renvoi vers Membres. Mesuré sur
 * l'UAT le 2026-07-27 : 8 des 96 membres rôle chatteur sans lien (34 sur 105 en prod, chiffre
 * rapporté par le propriétaire — la prod n'a pas été ouverte pour cette tâche).
 *
 * `chatterId` est un `uuid` STRICT, là où `applyChatterLink` accepte aussi `''` pour DÉLIER :
 * ce formulaire ne sait que relier (il n'est monté que sur un membre sans lien), et un `''`
 * qui passerait jusqu'à l'action délierait silencieusement. Restriction volontaire du contrat,
 * jamais un affaiblissement de la garde.
 */
export const chatterLinkInput = z.object({
  memberId: z.uuid(),
  chatterId: z.uuid(),
})
export type ChatterLinkInput = z.infer<typeof chatterLinkInput>
