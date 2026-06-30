import type { Insight } from '../../domain/types'
import type { InsightContext } from '../engine'
import { pareto } from './pareto'

export type Rule = (ctx: InsightContext) => Insight[]

/**
 * Registre des règles. TODO: porter les heuristiques de l'ancien pipeline Python :
 * pareto, régression/progression, low-perf, quotas (KO/7j), plan d'action hebdo (« castes »).
 */
export const rules: Rule[] = [pareto]
