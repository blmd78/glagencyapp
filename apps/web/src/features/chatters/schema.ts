import { z } from 'zod'
import { CRM_SHIFTS } from '@/lib/types/chatters'

// Schéma PARTAGÉ client (form) ↔ serveur (action) — source unique (modèle : police).
// Rôle (setter/closer) et équipe (rouge/bleue) sont désormais gérés sur le MEMBRE : shift seul.
export const updateChatterCrmInput = z.object({
  chatterId: z.uuid(),
  shift: z.enum(CRM_SHIFTS).nullable(),
})
export type UpdateChatterCrmInput = z.infer<typeof updateChatterCrmInput>
