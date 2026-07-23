// Règles PURES d'impersonation (aucune dépendance, aucun node:crypto) — sûres à importer
// depuis un composant client. Le TTL est enforced côté base (colonne `expires_at`), donc plus
// de helper d'expiration ici. Le cookie d'état = un `sid` opaque (UUID), non signé.
export const IMPERSONATION_ROLES = ['manager', 'sous-manager', 'police', 'chatteur'] as const

export function isImpersonatable(role: string | null | undefined): boolean {
  return role != null && (IMPERSONATION_ROLES as readonly string[]).includes(role)
}
