import { z } from 'zod'
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS } from './types'

// Schéma PARTAGÉ client (form) ↔ serveur (action) — source unique (modèle : police).
export const updateChatterCrmInput = z.object({
  chatterId: z.string().uuid(),
  role: z.enum(CRM_ROLES).nullable(),
  team: z.enum(CRM_TEAMS).nullable(),
  shift: z.enum(CRM_SHIFTS).nullable(),
})
export type UpdateChatterCrmInput = z.infer<typeof updateChatterCrmInput>
