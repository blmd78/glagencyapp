import { z } from 'zod'
import { money } from './schema'

/**
 * Schémas des deux réglages ADMIN du lot final : le BARÈME setter (onglet Classement) et les
 * SOLDES DES PARTANTS (onglet Suivi).
 *
 * FICHIER SÉPARÉ de `schema.ts`, qui atteignait 299 lignes (plafond de 300, CLAUDE.md). La
 * frontière n'est pas arbitraire : `schema.ts` décrit la PÉRIODE (saisies, paiement, réglages
 * d'un membre), ce fichier décrit ce qui ne dépend d'aucune période — une grille de tranches
 * globale et une liste de dettes qui vise des gens souvent partis. `actions-config.ts` leur
 * répond une pour une.
 *
 * `money` est IMPORTÉ de `schema.ts` et non redéclaré : deux définitions des mêmes bornes
 * finiraient par diverger, et un `numeric(10,2)` dépassé rend un `numeric field overflow`
 * Postgres brut à l'écran plutôt qu'une erreur de validation lisible.
 */

/**
 * Une tranche du barème (`compta_setter_scale`, PK `rank`, 0090). ADMIN seul (spec §6).
 *
 * UNE LIGNE À LA FOIS, et pas le barème entier : l'écran s'enregistre tout seul au fil de la
 * saisie (aucun bouton par ligne — demande d'ergonomie de Benoit), donc l'unité d'écriture est
 * la tranche, qui est aussi l'unité de la clé primaire. Envoyer les 15 lignes à chaque frappe
 * ferait réécrire 14 valeurs que personne n'a touchées — et écraserait celles qu'un autre admin
 * viendrait de changer.
 *
 * `rank` borné à 99 : le barème de juin en compte 15, et rien n'interdit d'en ajouter. La borne
 * n'existe que pour refuser un `smallint` aberrant avant que Postgres ne le fasse en anglais.
 */
export const setterScaleInput = z.object({
  rank: z.coerce.number().int('Rang entier attendu').min(1, 'Rang à partir de 1').max(99, 'Rang trop élevé'),
  amount: money,
})
export type SetterScaleInput = z.infer<typeof setterScaleInput>
export type SetterScaleFormValues = z.input<typeof setterScaleInput>

/**
 * Un solde de partant (`compta_debts`, 0084 + 0090). ADMIN seul (RLS `compta_debts_admin_all`).
 *
 * `name` en TEXTE LIBRE et non un `profiles.id` : c'est le choix de 0084, et il est délibéré —
 * « une dette peut viser quelqu'un qui n'est pas (ou plus) chatteur », donc quelqu'un dont le
 * compte a pu être supprimé. Une clé étrangère aurait fait disparaître la dette avec la personne.
 *
 * `amount` est un `money` POSITIF : une dette est un montant DÛ, son signe est porté par le mot.
 * Elle est devenue `numeric(10,2)` en 0090 (elle était du `text`, « 10$ ») — on ne calcule pas de
 * l'argent en parsant une chaîne.
 */
export const debtInput = z.object({
  /** Absent = création, présent = mise à jour. La clé technique de la table est un uuid généré. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Nom requis').max(120, '120 caractères max'),
  /** `''` ↔ `null` : un `<input>` vidé rend une chaîne vide, la colonne est nullable. */
  model: z.string().trim().max(120, '120 caractères max'),
  amount: money,
})
export type DebtInput = z.infer<typeof debtInput>
export type DebtFormValues = z.input<typeof debtInput>

/**
 * Marquer un solde réglé — ou revenir en arrière. Une action SÉPARÉE de `saveDebt` : c'est le
 * seul geste de cet onglet, il doit tenir en un clic, et le repasser par le formulaire complet
 * obligerait à renvoyer nom/modèle/montant pour changer un booléen (donc à les écraser avec ce
 * que l'écran croyait savoir).
 *
 * `settled` est envoyé EXPLICITEMENT plutôt que basculé côté serveur : un « inverse la valeur »
 * appliqué deux fois par un double-clic laisserait la dette dans l'état de départ sans que rien
 * ne le dise.
 */
export const debtSettleInput = z.object({
  id: z.uuid(),
  settled: z.boolean(),
})
export type DebtSettleInput = z.infer<typeof debtSettleInput>

/** Suppression d'un solde — la dette saisie par erreur. Le solde RÉGLÉ, lui, se marque `settled`
 *  et reste à l'écran : c'est une trace. */
export const debtDeleteInput = z.object({ id: z.uuid() })
export type DebtDeleteInput = z.infer<typeof debtDeleteInput>
