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

/**
 * Payload de `setInsightState` — serveur-only (le client ne l'exécute jamais via un
 * resolver RHF, il construit l'objet à la main dans `insight-card.tsx`), mais co-localisé
 * ici avec `bilanSchema` (squelette canonique, `docs/guidelines-standard-feature.md` §1).
 */
export const setInsightStateInput = z
  .object({
    key: z.string().min(1).max(200),
    status: z.enum(['new', 'in_progress', 'resolved', 'ignored']),
    note: z.string().max(2000).nullish(),
    bilan: bilanSchema.nullish(),
    /** Réinitialisation complète : statut new + note et bilan effacés. */
    reset: z.boolean().optional(),
  })
  // Garde SERVEUR (pas seulement UI) : pas de « Résolu » sans bilan structuré.
  .refine((v) => v.status !== 'resolved' || v.bilan != null, {
    message: 'Un bilan est requis pour passer en Résolu',
  })
export type SetInsightStateInput = z.infer<typeof setInsightStateInput>
