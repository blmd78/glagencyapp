import { z } from 'zod'
import type { WheelPrize, WheelSector } from '@glagency/core'

/**
 * Frontière jsonb ↔ TS de `training_wheel_config`. Les colonnes `sectors`/`prizes` sont typées
 * `Json` : un `as unknown as WheelSector[]` serait un mensonge au compilateur (une config éditée à
 * la main en SQL ferait planter le tirage plus loin, sans message). On VALIDE la forme, une fois,
 * ici — et c'est aussi ici que vit le seul renommage : `amount_eur` (base, snake_case, comme la
 * colonne `training_wheel_spins.amount_eur`) ↔ `amountEur` (TS).
 */

const sectorRow = z.object({ label: z.string(), weight: z.number(), lose: z.boolean() })
const prizeRow = z.object({
  label: z.string(),
  weight: z.number(),
  // clé absente = lot non monétaire (tolérance : la seed 0122 écrit toujours `null` explicitement)
  amount_eur: z.number().nullable().default(null),
})

const CONFIG_KO = 'Configuration de la roue invalide — corrige-la dans « Configurer »'

export function toSectors(json: unknown): WheelSector[] {
  const parsed = z.array(sectorRow).min(1).safeParse(json)
  if (!parsed.success) throw new Error(`${CONFIG_KO} (secteurs)`)
  return parsed.data.map((s) => ({ label: s.label, weight: s.weight, lose: s.lose }))
}

export function toPrizes(json: unknown): WheelPrize[] {
  const parsed = z.array(prizeRow).min(1).safeParse(json)
  if (!parsed.success) throw new Error(`${CONFIG_KO} (lots)`)
  return parsed.data.map((p) => ({ label: p.label, weight: p.weight, amountEur: p.amount_eur }))
}

/** Sens écriture : `amountEur` → `amount_eur` (le jsonb reste dans le format documenté par 0122). */
export function prizesToJson(prizes: WheelPrize[]): { label: string; weight: number; amount_eur: number | null }[] {
  return prizes.map((p) => ({ label: p.label, weight: p.weight, amount_eur: p.amountEur }))
}

/** Symétrique de `toSectors` — pas de renommage, mais le même point de passage unique. */
export function sectorsToJson(sectors: WheelSector[]): { label: string; weight: number; lose: boolean }[] {
  return sectors.map((s) => ({ label: s.label, weight: s.weight, lose: s.lose }))
}
