'use server'

// Server Actions du pôle marketing — requireAdmin + zod, écritures via supabase-js
// (RLS : has_page('marketing'), un admin passe toujours).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, requireAdmin } from '@/lib/auth'
import { staffFields } from './schema'

type Result = { success: true } | { success: false; error: string }
type SaveStaffResult = { success: true; id: string } | { success: false; error: string }

// Champs de fiche partagés avec le dialog (schema.ts) + méta serveur.
// `role` n'est plus éditable dans le formulaire (tout ce qui se crée = VA ; le manager
// est un profil CRM, pas une fiche) — le client renvoie le rôle existant tel quel.
const staffInput = staffFields.extend({
  id: z.uuid().nullable(), // null = création
  role: z.enum(['va', 'manager']),
  active: z.boolean(),
})

/**
 * Garde des fiches VA : admin, ou manager ayant la page mkt-staff. Le cloisonnement
 * fin (un manager ne touche que SES fiches) est porté par le RLS de mkt_staff
 * (owner_id = auth.uid(), migration 0027) — les requêtes passent par le client user.
 */
async function requireMktStaffMgr() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('mkt-staff')) return null
  return profile
}

export async function saveStaff(raw: unknown): Promise<SaveStaffResult> {
  const profile = await requireMktStaffMgr()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = staffInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()
  const row = {
    name: d.name,
    role: d.role,
    color: d.color,
    fixed_eur: d.fixedEur,
    rate_tw: d.rateTw,
    rate_ig: d.rateIg,
    bonus_eur: d.bonusEur,
    payment_method: d.paymentMethod,
    active: d.active,
  }
  // .select('id') dans les deux cas : la création renvoie l'id pour enchaîner les
  // assignations (liens + comptes) sans re-rouvrir la fiche. À la création, la fiche
  // appartient à son créateur (owner_id) — le RLS cloisonne ensuite par manager.
  const { data, error } = d.id
    ? await supabase.from('mkt_staff').update(row).eq('id', d.id).select('id').maybeSingle()
    : await supabase.from('mkt_staff').insert({ ...row, owner_id: profile.id }).select('id').single()
  if (error) return { success: false, error: error.message }
  // maybeSingle : 0 ligne = fiche supprimée entre-temps ou masquée par le RLS (pas la sienne).
  if (!data) return { success: false, error: 'Fiche introuvable ou non autorisée' }
  revalidatePath('/marketing/staff')
  revalidatePath('/marketing/compta')
  return { success: true, id: data.id }
}

const assignInput = z.object({
  staffId: z.uuid(),
  linkIds: z.array(z.uuid()).max(500),
  igAccountIds: z.array(z.uuid()).max(500),
  twAccountIds: z.array(z.uuid()).max(500),
})

/**
 * Remplace les assignations d'un VA (liens MyPuls + comptes IG/TW) via la fonction SQL
 * mkt_save_staff_assignments (migration 0028) : UNE transaction (pas de perte à
 * mi-chemin) et refus explicite si un lien/compte appartient déjà au VA d'un autre
 * manager (security invoker → le RLS owner_id du caller s'applique dans la fonction).
 */
export async function saveStaffAssignments(raw: unknown): Promise<Result> {
  const profile = await requireMktStaffMgr()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const parsed = assignInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { staffId, linkIds, igAccountIds, twAccountIds } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('mkt_save_staff_assignments', {
    p_staff: staffId,
    p_links: linkIds,
    p_accounts: [...new Set([...igAccountIds, ...twAccountIds])],
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/staff')
  revalidatePath('/marketing/compta')
  return { success: true }
}

/**
 * Supprime une fiche VA (corbeille admin). Cascade DB : assignations mkt_staff_links
 * et paiements supprimés avec la fiche ; les comptes sociaux redeviennent non assignés
 * (staff_id → null). Admin uniquement — un manager désactive/recrée, il ne détruit pas.
 */
export async function deleteStaff(raw: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = z.uuid().safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('mkt_staff').delete().eq('id', parsed.data)
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/staff')
  revalidatePath('/marketing/compta')
  return { success: true }
}

const paymentInput = z.object({
  staffId: z.uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amountEur: z.number().positive().max(100000),
  method: z.string().min(1).max(40),
  note: z.string().max(300),
})

/** Enregistre un paiement de paye staff (rattaché à un mois) — admin uniquement.
 *  Garde en retour d'erreur (pas requireAdmin : son redirect éjecterait un manager
 *  mkt-compta vers une URL chatteur inexistante). */
export async function recordStaffPayment(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Accès réservé à l’admin' }
  const parsed = paymentInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('mkt_staff_payments').insert({
    staff_id: d.staffId,
    month: d.month,
    amount_eur: d.amountEur,
    method: d.method,
    note: d.note,
    created_by: profile.id,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/marketing/compta')
  return { success: true }
}
