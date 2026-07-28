import { z } from 'zod'

/**
 * RÉGLAGES DE PAIE D'UN MEMBRE — bornes et contrats. Les ÉCRITURES sont dans
 * `pay-settings-write.ts` (ce module-ci doit rester importable depuis un composant client).
 *
 * DÉPLACÉ ICI depuis `features/compta/schema.ts` (2026-07-28) — bornes et messages INCHANGÉS.
 * Le taux, le fixe et la prime sont des attributs de la PERSONNE, pas de la période : ils se
 * saisissent désormais dans l'onglet « Compta » du dialog de Membres. La Compta continue de
 * les LIRE (colonne « Rémunération », fiche de paie) et d'être revalidée à chaque écriture,
 * mais ne les écrit plus.
 *
 * POURQUOI `lib/` et pas `features/members/` : `features/compta/schema.ts` a besoin des mêmes
 * bornes (`money` pour ses saisies, `rate` pour `rateApplied` de l'instantané de paiement) et
 * les imports inter-features sont interdits (ESLint `import-x/no-restricted-paths`). Même
 * patron que `lib/chatter-link.ts`, extrait de `features/members` pour la même raison. Deux
 * définitions des mêmes bornes finiraient par diverger, et c'est de l'argent.
 */

/** Un montant POSITIF de la paie. EXPORTÉ : `features/compta/schema.ts` le reprend tel quel
 *  pour ses saisies (`money`), et `schema-config.ts` pour le barème et les dettes. */
export const payMoney = z.coerce
  .number()
  .min(0, 'Montant positif attendu')
  .max(99999, 'Montant trop élevé')

/**
 * Un TAUX de commission en %, et PAS un montant : `compta_rates.rate` est un `numeric(5,2)` —
 * plafonné à 999,99. Avec la borne des montants (99 999), un taux aberrant passait Zod puis
 * explosait en `numeric field overflow` Postgres brut, au lieu d'une erreur de validation
 * lisible. (`compta_settings.rate` et `compta_payments.rate_applied`, les deux colonnes
 * historiquement visées ici, ont disparu avec la migration 0093 : le taux est daté.)
 */
export const payRate = z.coerce
  .number()
  .min(0, 'Taux positif attendu')
  .max(999.99, 'Taux hors bornes')

/** Une date ISO `AAAA-MM-JJ` — la date d'effet d'un taux. */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')

/**
 * Réglages de rémunération d'un membre (`compta_settings`, PK `chatter_id` → `profiles.id`
 * depuis 0085) — ADMIN seul (spec §6). Sans écran, tout le monde reste au défaut de la
 * colonne : aucun fixe (et 10 % de commission, cf. `payRateInput`).
 *
 * UN SEUL CHAMP depuis la migration 0093 : le TAUX en est parti. Il est DATÉ — il vit dans
 * `compta_rates` avec sa date d'effet et se saisit par `payRateInput` ci-dessous. Le fixe, lui,
 * n'est pas daté : c'est un montant par période, changé rarement, sans historique de paie à
 * reconstituer. Un grain de variation par table.
 *
 * Le mode et le statut de setter avaient déjà disparu (migration 0089, tâche 16) : la
 * rémunération est TOUJOURS `commission + fixe éventuel`.
 */
export const paySettingsInput = z.object({
  chatterId: z.uuid(),
  /** Fixe de la PÉRIODE de paie (spec §4) — s'ajoute à la commission, multiplié par rien. Il
   *  s'applique dès qu'il est non nul : aucun drapeau ne le commande. SEUL endroit où il se
   *  saisit depuis la tâche 19 (la saisie hebdo qui le remplaçait a été retirée). */
  fixedAmount: payMoney,
})
export type PaySettingsInput = z.infer<typeof paySettingsInput>

/**
 * TAUX DE COMMISSION DATÉ (`compta_rates`, PK `(chatter_id, effective_from)`, migration 0093) —
 * ADMIN seul.
 *
 * Une augmentation n'est pas une correction : elle prend effet un JOUR, et les jours d'avant
 * restent payés à l'ancien taux. Mesuré sur la feuille de juillet du propriétaire : 12 des 95
 * chatteurs changent de taux au milieu d'une même période de paie.
 *
 * `effectiveFrom` est le PREMIER jour au nouveau taux, inclus. Ré-enregistrer la même date
 * CORRIGE la ligne (upsert sur la PK) au lieu d'empiler deux vérités pour le même jour.
 */
export const payRateInput = z.object({
  chatterId: z.uuid(),
  effectiveFrom: isoDay,
  rate: payRate,
})
export type PayRateInput = z.infer<typeof payRateInput>

/** Suppression d'une ligne d'historique de taux — ADMIN seul. Le remède à une date saisie de
 *  travers : sans lui, un taux mal daté serait définitif et impossible à corriger depuis
 *  l'écran, puisque ré-enregistrer ne fait qu'écraser la ligne DE CETTE DATE. */
export const payRateDeleteInput = z.object({
  chatterId: z.uuid(),
  effectiveFrom: isoDay,
})
export type PayRateDeleteInput = z.infer<typeof payRateDeleteInput>

/**
 * Prime « nouveau chatteur » (`compta_primes`, PK `chatter_id`) — ADMIN seul, décidée à la
 * main (spec §2 : « manuelle, l'admin décide »).
 *
 * UN SEUL MONTANT depuis le 2026-07-28 (tâche 20). `status` a quitté ce contrat, et pas
 * seulement le formulaire : l'onglet « SUIVI PRIMES NVX CHATTEURS » du propriétaire ne connaît
 * que payée ou en attente (71 lignes : 30 payées, 41 en attente, 0 renoncée) — « renoncée » ne
 * décrivait aucune pratique. **0 € = pas de prime**, c'est le montant qui gouverne.
 *
 * `'paid'` n'a jamais figuré ici et ne le pourra plus : il est ACCEPTÉ PAR LA COLONNE (check
 * `due | paid | skipped`, migration 0084) mais n'est posé que par `payPeriod`, au moment où la
 * prime part réellement. `writePrime` refuse par ailleurs de réécrire une prime déjà `'paid'`.
 */
export const payPrimeInput = z.object({
  chatterId: z.uuid(),
  amount: payMoney,
})
export type PayPrimeInput = z.infer<typeof payPrimeInput>
