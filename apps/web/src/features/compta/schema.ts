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
    // PAS `money` : c'est un TAUX en %, pas un montant, et la colonne est `numeric(5,2)` —
    // plafonnée à 999,99. Avec la borne des montants (99 999), un taux aberrant passait Zod
    // puis explosait en `numeric field overflow` Postgres brut, au lieu d'une erreur de
    // validation lisible.
    rateApplied: z.coerce.number().min(0, 'Taux positif attendu').max(999.99, 'Taux hors bornes'),
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
   * FOURNIR les huit composantes, elle ne contrôle pas leur SOMME. `payFortnight` recopie les
   * onze montants du client sans rien recalculer, et la base ne les arbitre pas non plus.
   *
   * Le cas réel n'est pas la malveillance mais l'ONGLET PÉRIMÉ : l'admin ouvre la compta, un
   * manager saisit un malus entre-temps, l'admin clique « Marquer payé ». `revalidatePath`
   * invalide le cache serveur, jamais une page déjà rendue dans un navigateur — le montant
   * figé serait celui d'avant la saisie, sans que personne ne le voie.
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

    const message =
      "Le montant ne correspond plus au détail de la fiche : elle a changé depuis l'ouverture de la page. Recharge la page avant d'enregistrer ce paiement."
    ctx.addIssue({ code: 'custom', message, path: ['amount'] })
    // Doublon à la RACINE, volontaire : `runAction` ne remonte dans `error` que les issues
    // `custom` de path VIDE (lib/actions.ts), et le paiement passe par un `ConfirmDialog` qui
    // n'affiche que `error` — jamais les `fieldErrors`. Sans cette seconde issue, l'admin
    // lirait « Saisie invalide » et n'aurait aucune raison de recharger.
    ctx.addIssue({ code: 'custom', message })
  })
export type PayInput = z.infer<typeof payInput>
