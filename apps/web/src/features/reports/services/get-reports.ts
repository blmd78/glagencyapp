import { addDays, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { REPORT_WINDOW_DAYS, type Report, type ReportMember } from '../types'

/**
 * Comptes rendus d'UNE personne (la cible du sélecteur), fenêtre glissante 30 jours,
 * antéchrono. Le cloisonnement est porté par la RLS (`daily_reports_read`, 0053/0064) : la
 * lecture n'aboutit que si la cible est soi, un rattaché direct, ou si on est admin/superadmin.
 * Volume : ≤ ~30 lignes (1 profil × 30 j) → pas de RPC/fetchAll (largement sous 1000).
 */
export async function getReports(targetId: string): Promise<Report[]> {
  const supabase = await createClient()
  const from = addDays(todayParis(), -REPORT_WINDOW_DAYS)
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, day, content, updated_at')
    .eq('profile_id', targetId)
    .gte('day', from)
    .order('day', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    day: r.day,
    content: r.content,
    updatedAt: r.updated_at,
  }))
}

/**
 * Personnes consultables via le sélecteur — la RLS de `profiles` (0054) fait TOUT le scoping :
 * admin/superadmin → tout le monde ; manager/sous-manager → soi + rattachés directs
 * (`manager_id`) ; chatteur → soi seul. Superadmin exclu de la liste (il ne rédige pas).
 * (Même patron que `getPlanningMembers` : on s'appuie sur la RLS, pas de branche de sécurité TS.)
 */
export async function getReportMembers(): Promise<ReportMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, role')
    .neq('role', 'superadmin')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name ?? p.email ?? '—', role: p.role }))
}
