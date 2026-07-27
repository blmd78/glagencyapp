import { z } from 'zod'

/**
 * Compta — schémas PARTAGÉS entre les formulaires (RHF + zodResolver) et les Server Actions,
 * même patron que `features/planning/schema.ts`.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')
const money = z.coerce.number().min(0, 'Montant positif attendu').max(99999, 'Montant trop élevé')

/**
 * Le NET d'une quinzaine, seul montant SIGNÉ de la feature : malus et sanctions Police peuvent
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

/** Paiement d'une quinzaine — porte l'INSTANTANÉ figé (spec §5.3). */
export const payInput = z
  .object({
    chatterId: z.uuid(),
    month: iso,
    period: z.union([z.literal(1), z.literal(2)]),
    coveredDays: z.array(iso).min(1, 'Au moins un jour couvert'),
    amount: netMoney,
    caReference: money,
    modeApplied: z.enum(['percent', 'fixed']),
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
   * et passe ce contrôle. Ce cas-là est traité par le RECALCUL SERVEUR de `payFortnight`
   * (`actions.ts`), qui refait le calcul et refuse au-delà de 0,01 € d'écart. Ce commentaire a
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
 * Réglages de rémunération d'un membre (`compta_settings`, PK `chatter_id`) — ADMIN seul
 * (spec §6). Ce sont eux qui rendent le mode `fixed` et le fixe setter ATTEIGNABLES : sans cet
 * écran, tout le monde restait au défaut de la colonne (percent, 10 %, `is_setter` false).
 */
export const settingsInput = z.object({
  chatterId: z.uuid(),
  mode: z.enum(['percent', 'fixed']),
  rate,
  /** Montant HEBDOMADAIRE du mode `fixed` (spec §4) — multiplié par le nombre de semaines. */
  fixedAmount: money,
  isSetter: z.boolean(),
})
export type SettingsInput = z.infer<typeof settingsInput>
export type SettingsFormValues = z.input<typeof settingsInput>

/**
 * Prime « nouveau chatteur » (`compta_primes`, PK `chatter_id`) — ADMIN seul, décidée à la main
 * (spec §2 : « manuelle, l'admin décide »).
 *
 * `'paid'` est ACCEPTÉ PAR LA COLONNE (check `due | paid | skipped`) mais absent d'ici : il
 * n'est posé que par `payFortnight`, au moment où la prime part réellement. L'offrir dans un
 * formulaire laisserait marquer « versée » une prime que rien n'a versée.
 */
export const primeInput = z.object({
  chatterId: z.uuid(),
  amount: money,
  status: z.enum(['due', 'skipped']),
})
export type PrimeInput = z.infer<typeof primeInput>
export type PrimeFormValues = z.input<typeof primeInput>
