import type { Insight } from '../domain/types'
import { rules } from './rules'

/**
 * Contexte d'entrée du moteur d'insights : données déjà agrégées
 * (chatters, équipes, période courante vs précédente, quotas…).
 * TODO: typer précisément lors de l'implémentation des règles.
 */
export interface InsightContext {
  [key: string]: unknown
}

/** Exécute toutes les règles déterministes et renvoie les insights produits. */
export function runRules(ctx: InsightContext): Insight[] {
  return rules.flatMap((rule) => rule(ctx))
}
