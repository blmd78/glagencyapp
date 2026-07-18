import { z } from 'zod'

// Schéma PARTAGÉ client (RHF) ↔ serveur (runAction). La borne de date [J−30, J] dépend du
// jour métier (Europe/Paris) → non exprimable statiquement en Zod : elle est REVALIDÉE côté
// serveur dans l'action (todayParis), et posée en min/max sur l'input date côté client.
export const upsertReportInput = z.object({
  // z.iso.date (Zod v4) valide le CALENDRIER, pas juste la syntaxe (rejette 2026-02-30…) —
  // évite qu'une date forgée franchisse la borne string serveur puis casse au type Postgres.
  day: z.iso.date('Date invalide'),
  content: z.string().trim().min(1, 'Le compte rendu est vide').max(10000, 'Trop long (10 000 caractères max)'),
})
export type UpsertReportInput = z.infer<typeof upsertReportInput>

export const deleteReportInput = z.object({ id: z.uuid() })
export type DeleteReportInput = z.infer<typeof deleteReportInput>
