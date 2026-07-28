import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'
import type { Member, MembersData } from '../types'

/** Défauts des colonnes `compta_settings.rate` / `.fixed_amount` (migration 0084), repris tels
 *  quels : tant qu'aucune ligne n'existe, c'est ce que la Compta calcule (`loadComptaRows`). */
const DEFAULT_RATE = 10
const DEFAULT_FIXED = 0

/**
 * Liste des membres + modèles assignables (page admin OU manager). La RLS filtre par
 * appelant (0054) : admin = tout, manager = lui-même + son équipe (manager_id) ;
 * `creators` reste scopé aux modèles du manager — le périmètre qu'il peut assigner.
 * `chatters` (options du lien MyPuls, client admin agence-wide) n'est chargé QUE pour un
 * admin : le champ lien est admin-only (UI + serveur) et un manager ne doit pas recevoir
 * cette liste hors de son périmètre RLS dans son payload.
 *
 * MÊME RÈGLE POUR LES RÉGLAGES DE PAIE (2026-07-28) : `compta_settings` et `compta_primes` ne
 * sont lus que pour un admin. La RLS les laisse LIRE à un manager sur ses rattachés
 * (`compta_settings_read`, 0085) mais lui en refuse l'ÉCRITURE — l'onglet « Compta » n'est donc
 * pas monté pour lui, et son payload n'a aucune raison de porter ces montants.
 */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const admin = createAdminClient()
  // Le lien chatteur est admin-only → on ne requête/expose la liste agence-wide des chatteurs QUE
  // pour un admin (getProfile est caché : déjà appelé par requireAdminOrManager dans le même rendu).
  const isAdmin = (await getProfile())?.role === 'admin'
  const [
    { data: profiles, error: profilesErr },
    { data: links, error: linksErr },
    { data: creators, error: creatorsErr },
    { data: chattersData, error: chattersErr },
    { data: settings, error: settingsErr },
    { data: primes, error: primesErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, display_name, role, pages, work_link, manager_id, closing_role, closing_team, chatter_id, created_at',
      )
      .order('created_at'),
    supabase.from('profile_creators').select('profile_id, creator_id'),
    // TOUS les comptes (privés inclus) : `excluded` ne concerne que les calculs (LTV,
    // quotas), pas le droit d'accès — on doit pouvoir assigner « Carla (privé) ».
    supabase.from('creators').select('id, name').order('name'),
    isAdmin
      ? admin.from('chatters').select('id, display_name').order('display_name')
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
    // Pas de `fetchAll`, et c'est borné par la CLÉ : `chatter_id` est la PK des deux tables
    // (→ au plus une ligne par membre, ~105 en prod), très loin du plafond PostgREST de 1000.
    // Même raisonnement que `compta-sources.ts`, qui lit les deux mêmes tables sans pagination.
    isAdmin
      ? supabase.from('compta_settings').select('chatter_id, rate, fixed_amount')
      : Promise.resolve({ data: [] as { chatter_id: string; rate: number; fixed_amount: number }[], error: null }),
    // TOUS les statuts, et non les seules primes `'due'` : l'onglet a besoin de l'état RÉEL
    // pour afficher une prime DÉJÀ VERSÉE en lecture seule au lieu de proposer de la réécrire
    // (`writePrime` la refuserait — mais après coup).
    isAdmin
      ? supabase.from('compta_primes').select('chatter_id, amount, status, paid_at')
      : Promise.resolve({
          data: [] as { chatter_id: string; amount: number; status: string; paid_at: string | null }[],
          error: null,
        }),
  ])
  if (profilesErr) throw new Error(profilesErr.message)
  if (linksErr) throw new Error(linksErr.message)
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (chattersErr) throw new Error(chattersErr.message)
  if (settingsErr) throw new Error(settingsErr.message)
  if (primesErr) throw new Error(primesErr.message)
  const settingsById = new Map((settings ?? []).map((s) => [s.chatter_id, s]))
  const primeById = new Map((primes ?? []).map((p) => [p.chatter_id, p]))
  const byProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    const arr = byProfile.get(l.profile_id)
    if (arr) arr.push(l.creator_id)
    else byProfile.set(l.profile_id, [l.creator_id])
  }
  const members: Member[] = (profiles ?? []).map((p) => {
    const s = settingsById.get(p.id)
    const prime = primeById.get(p.id)
    return {
      id: p.id,
      email: p.email ?? '—',
      displayName: p.display_name ?? (p.email ?? '').split('@')[0] ?? '—',
      role:
        p.role === 'superadmin'
          ? 'superadmin'
          : p.role === 'admin'
            ? 'admin'
            : p.role === 'manager'
              ? 'manager'
              : p.role === 'sous-manager'
                ? 'sous-manager'
                : p.role === 'police'
                  ? 'police'
                  : 'chatteur',
      pages: p.pages ?? [],
      creatorIds: byProfile.get(p.id) ?? [],
      managerId: p.manager_id ?? '',
      workLink: p.work_link ?? '',
      closingRole: (p.closing_role ?? null) as CrmRole | null,
      closingTeam: (p.closing_team ?? null) as CrmTeam | null,
      chatterId: p.chatter_id ?? '',
      createdAt: p.created_at,
      // `undefined` (et pas un objet aux défauts) pour un non-admin : c'est ce qui fait que
      // l'onglet n'est pas monté. Les `Number(...)` : PostgREST rend le `numeric` en chaîne.
      pay: isAdmin
        ? {
            rate: s ? Number(s.rate) : DEFAULT_RATE,
            fixedAmount: s ? Number(s.fixed_amount) : DEFAULT_FIXED,
            prime: prime
              ? { amount: Number(prime.amount), status: prime.status, paidAt: prime.paid_at }
              : null,
          }
        : undefined,
    }
  })
  const chatters = (chattersData ?? [])
    .filter((c) => c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name as string }))
  return { members, creators: creators ?? [], chatters }
}
