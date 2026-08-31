import { z } from 'zod'
import type { WheelPrize } from '@glagency/core'

/**
 * Frontière jsonb ↔ TS de `training_module_wheel_config.segments`. Même rôle que
 * `features/training-wheel/mappers.ts` : la colonne est typée `Json`, un `as unknown as` serait un
 * mensonge au compilateur — une config éditée à la main en SQL ferait planter le tirage plus loin,
 * sans message.
 *
 * UNE différence avec la roue nº 1 : `amount_eur` est **obligatoire**. Là-bas, `null` a un sens
 * (« day off », lot non monétaire) ; ici, tout secteur paie — un `null` serait un secteur muet qui
 * consommerait un tour sans rien verser.
 */
const segmentRow = z.object({
  label: z.string(),
  // Entier : `randomInt(0, n)` (node:crypto) throw sur un n non entier.
  weight: z.number().int().min(0),
  amount_eur: z.number().min(0),
})

const CONFIG_KO = 'Configuration de la roue des modules invalide — corrige-la dans « Configurer »'

export function toSegments(json: unknown): WheelPrize[] {
  const parsed = z.array(segmentRow).min(1).safeParse(json)
  if (!parsed.success) throw new Error(CONFIG_KO)
  return parsed.data.map((s) => ({ label: s.label, weight: s.weight, amountEur: s.amount_eur }))
}

/** Sens écriture : `amountEur` → `amount_eur` (le jsonb garde le format documenté par 0136). */
export function segmentsToJson(segments: WheelPrize[]): { label: string; weight: number; amount_eur: number }[] {
  // `?? 0` : `WheelPrize.amountEur` est nullable par son type (partagé avec la roue nº 1), mais le
  // schéma du formulaire le rend obligatoire ici — la branche est inatteignable, pas le typage.
  return segments.map((s) => ({ label: s.label, weight: s.weight, amount_eur: s.amountEur ?? 0 }))
}
