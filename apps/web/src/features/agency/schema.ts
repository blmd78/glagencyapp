/** Les rôles qu'un événement peut viser. Les admins voient toujours tout (RLS `agency_events_read`). */
export const AGENCY_ROLES = ['chatteur', 'sous-manager', 'manager', 'police'] as const
export type AgencyRole = (typeof AGENCY_ROLES)[number]
