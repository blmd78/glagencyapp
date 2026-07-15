import { createAdminClient } from '@glagency/db'
import type { AccesData, AccesMember } from '../types'

/**
 * Annuaire des comptes, groupé par rôle. Client ADMIN (comme get-repos) : la page est un
 * annuaire d'équipe — l'accès est gardé par requireAccess('acces') en amont (droit
 * cochable dans Membres), alors que la RLS de profiles ne laisse un membre lire que
 * lui-même. Aucun secret exposé : email, rôle, modèles, lien outil (pas de mot de passe —
 * la connexion au CRM est par code OTP email).
 */
export async function getAcces(): Promise<AccesData> {
  const admin = createAdminClient()
  const [{ data: profiles }, { data: links }, { data: creators }] = await Promise.all([
    admin.from('profiles').select('id, display_name, email, role, work_link').order('display_name'),
    admin.from('profile_creators').select('profile_id, creator_id'),
    admin.from('creators').select('id, name'),
  ])

  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const modelsByProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    const name = creatorName.get(l.creator_id)
    if (!name) continue
    const arr = modelsByProfile.get(l.profile_id)
    if (arr) arr.push(name)
    else modelsByProfile.set(l.profile_id, [name])
  }

  const members: AccesMember[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || (p.email ?? '').split('@')[0] || '—',
    email: p.email ?? '—',
    role:
      p.role === 'superadmin'
        ? 'superadmin'
        : p.role === 'admin'
          ? 'admin'
          : p.role === 'manager'
            ? 'manager'
            : 'user',
    models: (modelsByProfile.get(p.id) ?? []).sort((a, b) => a.localeCompare(b)),
    workLink: p.work_link ?? '',
  }))

  const byName = (a: AccesMember, b: AccesMember) => a.name.localeCompare(b.name)
  return {
    admins: members.filter((m) => m.role === 'superadmin' || m.role === 'admin').sort(byName),
    managers: members.filter((m) => m.role === 'manager').sort(byName),
    membres: members.filter((m) => m.role === 'user').sort(byName),
  }
}
