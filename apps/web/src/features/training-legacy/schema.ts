import { z } from 'zod'

/**
 * Schéma PARTAGÉ client (resolver RHF) ↔ serveur (`runAction`) de la réclamation d'un ancien
 * compte Good Luck Agency.
 *
 * LES DEUX BORNES SONT TRÈS AU-DESSUS DU MAXIMUM RÉEL, et c'est délibéré : `max(length(login))`
 * vaut 17 sur les 248 comptes GLA et `max(length(mot de passe))` vaut 26 — mesuré le 2026-08-24,
 * là où la spec relevait 17 et 16 sur 235 comptes : le parc a grossi depuis, et c'est exactement ce
 * qu'une borne large est censée absorber. Une borne serrée refuserait un légitime derrière le
 * message générique « Identifiants introuvables. » — donc indébogable. Elles n'existent que pour
 * arrêter un envoi absurde.
 *
 * `trim()` côté JS (0 login à espaces en base, mais on colle souvent depuis un gestionnaire de mots
 * de passe) ; la mise en MINUSCULES, elle, est faite par Postgres dans `training_legacy_claim_begin`
 * — jamais ici : 7 logins contiennent du non-ASCII et `String.toLowerCase()` ne suit pas les mêmes
 * règles Unicode que `lower()`.
 *
 * Le mot de passe n'est PAS trimmé : un espace de tête ou de queue peut faire partie du secret.
 */
export const legacyClaimForm = z.object({
  login: z.string().trim().min(1, 'Identifiant requis').max(64, '64 caractères maximum'),
  password: z.string().min(1, 'Mot de passe requis').max(128, '128 caractères maximum'),
})

export type LegacyClaimForm = z.infer<typeof legacyClaimForm>

/** Resynchronisation : aucune saisie — la propriété est déjà établie, elle ne prouve rien de neuf. */
export const legacyResyncInput = z.object({})
