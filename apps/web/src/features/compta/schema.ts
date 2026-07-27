import { z } from 'zod'

/**
 * Compta — schémas PARTAGÉS entre les formulaires (RHF + zodResolver) et les Server Actions,
 * même patron que `features/planning/schema.ts`.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')
const money = z.coerce.number().min(0, 'Montant positif attendu').max(99999, 'Montant trop élevé')

/**
 * Le NET d'une période, seul montant SIGNÉ de la feature : malus et sanctions Police peuvent
 * dépasser les gains (`computePayslip`). Enregistrer un net négatif est un constat fidèle — le
 * traitement du solde dû relève de `compta_debts`, hors périmètre (spec §9). Toutes les autres
 * lignes (`base`, `bonus`, `sanctions`…) restent des `money` positifs : ce sont des composantes,
 * c'est leur combinaison qui porte le signe.
 */
const netMoney = z.coerce.number().min(-99999, 'Montant hors bornes').max(99999, 'Montant trop élevé')

/**
 * Un TAUX de commission en %, et PAS un montant : les colonnes `compta_settings.rate` et
 * `compta_payments.rate_applied` sont des `numeric(5,2)` — plafonnées à 999,99. Avec la borne
 * des montants (99 999), un taux aberrant passait Zod puis explosait en `numeric field
 * overflow` Postgres brut, au lieu d'une erreur de validation lisible.
 */
const rate = z.coerce.number().min(0, 'Taux positif attendu').max(999.99, 'Taux hors bornes')

/** Saisie d'un JOUR (bonus/malus/handoffs). */
export const dayEntryInput = z.object({
  chatterId: z.uuid(),
  date: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type DayEntryInput = z.infer<typeof dayEntryInput>

/** Saisie d'une SEMAINE (idem + fixe setter). */
export const weekEntryInput = z.object({
  chatterId: z.uuid(),
  weekStart: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  fixeSetter: money,
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type WeekEntryInput = z.infer<typeof weekEntryInput>
// Type d'ENTRÉE du formulaire (les champs `money`/`z.coerce.number()` ont un input `unknown` —
// input ≠ output). Sert de `TFieldValues` à `useForm` côté client, même patron que
// `ReportFormValues` dans police-reports/schema.ts.
export type WeekEntryFormValues = z.input<typeof weekEntryInput>

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
    amount: netMoney,
    caReference: money,
    // `modeApplied` a disparu avec `compta_settings.mode` (migration 0089) : il n'existe plus
    // qu'un seul mode de rémunération — commission + fixe éventuel.
    // `rate` et non `money` : c'est un TAUX (cf. sa définition en haut de fichier).
    rateApplied: rate,
    baseAmount: money,
    setterAmount: money,
    bonusAmount: money,
    malusAmount: money,
    handoffsAmount: money,
    primeAmount: money,
    sanctionsAmount: money,
    note: z.string().trim().max(500, '500 caractères max').nullable(),
  })
  /**
   * L'invariant de la spec §5.3 (`amount = base + setter + bonus − malus + handoffs + prime −
   * sanctions`) VÉRIFIÉ, et non plus seulement documenté. La spec le disait « structurel » du
   * fait de colonnes sans valeur par défaut : c'est inexact — l'absence de défaut force à
   * FOURNIR les huit composantes, elle ne contrôle pas leur SOMME, et la base ne les arbitre
   * pas non plus.
   *
   * CE QUE CE REFINE ATTRAPE, ET RIEN D'AUTRE : une incohérence INTERNE au payload —
   * falsification à la main d'un des montants, ou divergence entre la formule du client et
   * celle du serveur. Rien de plus.
   *
   * CE QU'IL N'ATTRAPE PAS — l'ONGLET PÉRIMÉ. Les onze nombres viennent tous du même rendu, et
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
    const expected =
      v.baseAmount +
      v.setterAmount +
      v.bonusAmount -
      v.malusAmount +
      v.handoffsAmount +
      v.primeAmount -
      v.sanctionsAmount
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
 * unitaire (`payInput`, onze montants).
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

/**
 * Réglages de rémunération d'un membre (`compta_settings`, PK `chatter_id`) — ADMIN seul
 * (spec §6). Sans cet écran, tout le monde reste au défaut de la colonne : 10 % et aucun fixe.
 *
 * DEUX CHAMPS, plus un mode ni un statut de setter (migration 0089, tâche 16) : la rémunération
 * est TOUJOURS `commission + fixe éventuel`. Le choix `percent | fixed` faisait remplacer l'une
 * par l'autre, ce que la feuille du propriétaire ne pratique nulle part ; `is_setter`
 * dupliquait `profiles.closing_role`, réglé depuis Membres.
 */
export const settingsInput = z.object({
  chatterId: z.uuid(),
  rate,
  /** Fixe de la PÉRIODE de paie (spec §4) — s'ajoute à la commission, multiplié par rien. Il
   *  s'applique dès qu'il est non nul : aucun drapeau ne le commande. */
  fixedAmount: money,
})
export type SettingsInput = z.infer<typeof settingsInput>

/**
 * Ce que l'ENGRENAGE édite : les réglages ci-dessus ET la prime, dans un seul formulaire à
 * UN SEUL bouton « Enregistrer » (demande du propriétaire, 2026-07-27). Deux tables et deux
 * Server Actions côté serveur (`compta_settings` / `compta_primes`), un seul geste à l'écran.
 *
 * `settingsInput.extend(...)` et non un objet réécrit : les contraintes du taux et du fixe ne
 * peuvent pas diverger de ce que l'action valide.
 */
export const settingsFormInput = settingsInput.extend({
  primeAmount: money,
  primeStatus: z.enum(['due', 'skipped']),
})
export type SettingsFormInput = z.infer<typeof settingsFormInput>
export type SettingsFormValues = z.input<typeof settingsFormInput>

/**
 * Prime « nouveau chatteur » (`compta_primes`, PK `chatter_id`) — ADMIN seul, décidée à la main
 * (spec §2 : « manuelle, l'admin décide »).
 *
 * `'paid'` est ACCEPTÉ PAR LA COLONNE (check `due | paid | skipped`) mais absent d'ici : il
 * n'est posé que par `payPeriod`, au moment où la prime part réellement. L'offrir dans un
 * formulaire laisserait marquer « versée » une prime que rien n'a versée.
 *
 * CONTRAT DE L'ACTION, plus d'un formulaire : la prime se saisit dans l'écran unique de
 * l'engrenage (`settingsFormInput`), qui mappe ses deux champs sur ce schéma. `savePrime` le
 * revalide côté serveur — c'est lui qui fait foi.
 */
export const primeInput = z.object({
  chatterId: z.uuid(),
  amount: money,
  status: z.enum(['due', 'skipped']),
})
export type PrimeInput = z.infer<typeof primeInput>

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
