import { z } from 'zod'

/** Les rôles qu'un événement peut viser. Les admins voient toujours tout (RLS `agency_events_read`). */
export const AGENCY_ROLES = ['chatteur', 'sous-manager', 'manager', 'police'] as const
export type AgencyRole = (typeof AGENCY_ROLES)[number]

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  chatteur: 'Chatteurs',
  'sous-manager': 'Sous-managers',
  manager: 'Managers',
  police: 'Police',
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')

/** Saisie d'un événement — le MÊME objet pour le formulaire (resolver) et pour `runAction`. */
export const eventInput = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, 'Donne un nom à l\'événement').max(120, '120 caractères maximum'),
    mode: z.enum(['jour', 'periode']),
    startDate: day,
    endDate: day,
    remindOnDay: z.boolean(),
    audience: z.array(z.enum(AGENCY_ROLES)).min(1, 'Choisis au moins un rôle'),
  })
  .refine((v) => v.mode === 'jour' || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La fin doit suivre le début',
  })
export type EventInput = z.infer<typeof eventInput>

export const eventIdInput = z.object({ id: z.uuid() })

/**
 * La ligne `agency_events` d'une saisie. En mode Jour, la fin EST le début : un admin qui choisit
 * une période puis repasse sur « Jour » ne doit pas enregistrer l'ancienne fin.
 */
export function eventRow(v: EventInput) {
  return {
    title: v.title,
    start_date: v.startDate,
    end_date: v.mode === 'jour' ? v.startDate : v.endDate,
    remind_on_day: v.remindOnDay,
    audience: [...v.audience],
  }
}
