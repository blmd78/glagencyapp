import { z } from 'zod'

// Schéma Zod PARTAGÉ client (form RHF) ↔ serveur (action safeParse) — source unique.
export const bilanSchema = z.object({
  date: z.string().min(1),
  duree: z.enum(['5min', '15min', '30min', '1h+']),
  etat: z.enum(['neutre', 'motive', 'fatigue', 'demotive', 'resistant']),
  resume: z.string().trim().min(10, 'Résumé trop court — quelques phrases minimum').max(2000),
  actions: z.string().max(2000).default(''),
  objectifs: z.string().max(2000).default(''),
  sanction: z.string().max(500).default(''),
  nextCheck: z.string().max(30).default(''),
  notes: z.string().max(2000).default(''),
})
export type BilanForm = z.output<typeof bilanSchema>
export type BilanFormInput = z.input<typeof bilanSchema>
