import { z } from 'zod'

// Schéma PARTAGÉ client (RHF) ↔ serveur (runAction). Le jour n'est PAS un champ : on ne
// rédige QUE le jour courant, fixé côté serveur (todayParis) — un jour passé est figé
// (consultation seule). Impossible d'écrire une autre date via l'action.
export const upsertReportInput = z.object({
  content: z.string().trim().min(1, 'Le compte rendu est vide').max(10000, 'Trop long (10 000 caractères max)'),
})
export type UpsertReportInput = z.infer<typeof upsertReportInput>
