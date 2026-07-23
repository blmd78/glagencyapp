// Règles PURES d'impersonation (aucune dépendance, aucun node:crypto) — sûres à importer
// depuis un composant client. La signature HMAC du cookie vit dans `cookie-sign.ts`
// (server-only, hors barrel).
export const IMPERSONATION_ROLES = ['manager', 'sous-manager', 'police', 'chatteur'] as const

export function isImpersonatable(role: string | null | undefined): boolean {
  return role != null && (IMPERSONATION_ROLES as readonly string[]).includes(role)
}

export function isExpired(exp: number, nowMs: number): boolean {
  return nowMs >= exp
}
