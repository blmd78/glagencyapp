'use server'

// Server Actions du pôle marketing — écritures via supabase-js (RLS : has_page('marketing'),
// un admin passe toujours). Standard runAction (docs/guidelines-standard-feature.md §4) :
// jamais `requireAdmin` (son redirect serait avalé par le try/catch de runAction, cf.
// self-review batch 3). Quand le handler a besoin du profil ou d'un pré-check métier, tout le
// contrôle vit en tête de handler, une seule fois (`noGuard`) ; sinon la garde générique
// suffit (`adminGuard`, `managerPageGuard`).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import {
  runAction,
  adminGuard,
  managerPageGuard,
  noGuard,
  requireWriteProfile,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { staffFields } from './schema'

// Champs de fiche partagés avec le dialog (schema.ts) + méta serveur.
// `role` n'est plus éditable dans le formulaire (tout ce qui se crée = VA ; le manager
// est un profil CRM, pas une fiche) — le client renvoie le rôle existant tel quel.
const staffInput = staffFields.extend({
  id: z.uuid().nullable(), // null = création
  role: z.enum(['va', 'manager']),
  active: z.boolean(),
})

// Droit des fiches VA : admin, ou manager ayant la page mkt-staff (`requireWriteProfile`).
// Le cloisonnement fin (un manager ne touche que SES fiches) est porté par le RLS de
// mkt_staff (owner_id = auth.uid(), migration 0027) — les requêtes passent par le client user.

export async function saveStaff(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction({
    schema: staffInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      // Contrôle UNE SEULE FOIS en tête de handler (patron §4) : droit d'écriture, puis
      // pré-check métier — la fiche éditée doit être visible du caller (RLS owner_id),
      // sinon message précis plutôt qu'un 0-row silencieux au update.
      const profile = await requireWriteProfile('mkt-staff')
      const supabase = await createClient()
      if (d.id) {
        const { data, error } = await supabase.from('mkt_staff').select('id').eq('id', d.id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new BusinessError('Fiche introuvable ou non autorisée')
      }
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
      if (error) throw new Error(error.message)
      // maybeSingle : 0 ligne = course résiduelle (fiche supprimée entre le pré-check et
      // l'update) — technique, le pré-check ci-dessus vient de vérifier la visibilité.
      if (!data) throw new Error('Fiche introuvable ou non autorisée')
      revalidatePath('/marketing/staff')
      revalidatePath('/marketing/compta')
      return { id: data.id }
    },
  })
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
export async function saveStaffAssignments(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: assignInput,
    input: raw,
    // Le handler n'a pas besoin du profil → garde générique (même prédicat et même message
    // que l'ex-requireMktStaffMgr : hasWriteAccess('mkt-staff')).
    guard: managerPageGuard('mkt-staff'),
    handler: async ({ staffId, linkIds, igAccountIds, twAccountIds }) => {
      const supabase = await createClient()
      // Anti-vol (lien/compte déjà pris par le VA d'un autre manager) : cas ATTEIGNABLE en
      // usage normal (deux managers sur le même pool de liens), pas juste une course
      // résiduelle — et un pré-check TS est impossible : mkt_staff_links a sa PROPRE RLS
      // (migration 0027, policy mkt_staff_links_own), le manager appelant ne voit donc
      // jamais les lignes en conflit. Seule la base peut trancher → le message métier de
      // la RPC doit survivre (BusinessError), pas de generic+Sentry pour ce cas précis.
      const { error } = await supabase.rpc('mkt_save_staff_assignments', {
        p_staff: staffId,
        p_links: linkIds,
        p_accounts: [...new Set([...igAccountIds, ...twAccountIds])],
      })
      if (error) {
        // La fonction SQL (migration 0028) lève `raise exception 'Un des liens/comptes est
        // déjà assigné au VA d'un autre manager'` SANS SQLSTATE dédié (code générique
        // P0001, indistinguable en `error.code` du reste de la fonction) → détection par
        // fragment de message, commun aux 2 variantes (liens/comptes) et absent du 3ème
        // message de la fonction ('Fiche introuvable ou non autorisée').
        if (error.message.includes('autre manager')) {
          throw new BusinessError('Lien ou compte déjà assigné à un autre manager')
        }
        throw new Error(error.message)
      }
      revalidatePath('/marketing/staff')
      revalidatePath('/marketing/compta')
    },
  })
}

/**
 * Supprime une fiche VA (corbeille admin). Cascade DB : assignations mkt_staff_links
 * et paiements supprimés avec la fiche ; les comptes sociaux redeviennent non assignés
 * (staff_id → null). Admin uniquement — un manager désactive/recrée, il ne détruit pas.
 */
export async function deleteStaff(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(),
    input: raw,
    guard: adminGuard,
    handler: async (id) => {
      const supabase = await createClient()
      const { error } = await supabase.from('mkt_staff').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/marketing/staff')
      revalidatePath('/marketing/compta')
    },
  })
}

const paymentInput = z.object({
  staffId: z.uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amountEur: z.number().positive().max(100000),
  method: z.string().min(1).max(40),
  note: z.string().max(300),
})

/** Enregistre un paiement de paye staff (rattaché à un mois) — admin uniquement. */
export async function recordStaffPayment(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: paymentInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      // Contrôle ADMIN strict en tête de handler (patron §4 — le profil sert à `created_by`).
      // Message HISTORIQUE distinct d'`adminGuard` (« Accès réservé à l'admin ») : conservé —
      // il dit à un manager mkt-staff/mkt-compta POURQUOI le paiement lui est fermé.
      const profile = await getProfile()
      if (profile?.role !== 'admin') throw new BusinessError('Accès réservé à l’admin')
      const supabase = await createClient()
      const { error } = await supabase.from('mkt_staff_payments').insert({
        staff_id: d.staffId,
        month: d.month,
        amount_eur: d.amountEur,
        method: d.method,
        note: d.note,
        created_by: profile.id,
      })
      if (error) throw new Error(error.message)
      revalidatePath('/marketing/compta')
    },
  })
}
