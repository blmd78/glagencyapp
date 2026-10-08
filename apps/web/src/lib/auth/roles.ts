import type { Profile } from './index'

/**
 * Admin (superadmin compris) OU encadrant (manager / sous-manager) — la règle écrite une seule fois,
 * partagée par la garde de page `requireAdminOrManager` et les actions qui écrivent pour eux seuls.
 */
export function isAdminOrManager(profile: Pick<Profile, 'role' | 'manager'>): boolean {
  return profile.role === 'admin' || profile.manager
}
