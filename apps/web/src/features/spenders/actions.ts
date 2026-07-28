'use server'

// Server Actions du tracker spenders (relances R1→R10, reset, archive) — supabase-js + RLS.
// Droit : admin ou page `crm-spenders`. Le cloisonnement par modèle est appliqué par la RLS
// (policies de 0038) ; on garde ici le contrôle d'accès de page + la validation zod.
// `addRelance` suit le patron §4 des guidelines : tout le contrôle (droit + pré-check métier)
// vit en tête de handler, une seule fois.

import { revalidatePath } from 'next/cache'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess } from '@/lib/auth'
import {
  runAction,
  adminGuard,
  noGuard,
  requirePageProfile,
  BusinessError,
  type ActionResult,
} from '@/lib/actions'
import { archiveInput, relanceInput, setCompteurInput, targetInput } from './schema'

// Scope 'layout' : ce layout (app/(dash)/chatter/spenders/layout.tsx) ne fetch plus rien
// lui-même (chaque page a son propre fetch, cf. normalisation batch 4), mais il reste le
// SEGMENT PARTAGÉ par les 4 vraies vues (/liste, /tracker, /alertes, /archive) — le scope
// 'layout' continue donc de couvrir exactement les 4, qu'il y ait un fetch au niveau
// layout ou non. '/chatter/spenders' seul (type 'page') ne cible que la redirection.
const SPENDERS_PATH = '/chatter/spenders'

// ÉCRITURE non-relance (reset / archive) : admin ou manager/sous-manager — pas le chatteur
// (0060). Miroir de la RLS can_write_page('crm-spenders').
async function crmWriteGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return hasWriteAccess(profile, 'crm-spenders') ? { ok: true } : { ok: false, error: 'Accès refusé' }
}

/**
 * Enregistre une relance. Le numéro R figé = le R AFFICHÉ après cette relance =
 * `compteur_base` (correction/force admin) + relances depuis le dernier reset + 1 — aligné
 * sur le calcul du RPC `crm_spenders_tracker` (0039). L'unicité (creator_id, fan_id,
 * jour_paris) garantit « 1 relance/jour » —
 * le pré-check ci-dessous porte le message précis pour le cas MÉTIER atteignable (course
 * entre deux closers, onglet resté ouvert après minuit) ; un résiduel ultra-serré tombe en
 * throw générique dans le handler (même pattern que planning/actions.ts `saveBlock`).
 */
export async function addRelance(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: relanceInput,
    input: raw,
    // LECTURE / relance : ouvert au chatteur (has_page) — contrôle en tête de handler
    // (patron §4), le profil sert aussi à `created_by`.
    guard: noGuard,
    handler: async (p) => {
      const profile = await requirePageProfile('crm-spenders')
      const supabase = await createClient()

      // Pré-check « 1 relance/jour » + lecture du compteur : deux lectures indépendantes,
      // en parallèle. Leurs erreurs sont thrown (techniques) — un échec silencieux du
      // compteur fabriquerait un numero_r faux.
      const [dup, { data: crm, error: crmError }] = await Promise.all([
        supabase
          .from('relances')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', p.creatorId)
          .eq('fan_id', p.fanId)
          .eq('jour_paris', todayParis()),
        supabase
          .from('spender_crm')
          .select('compteur_base, compteur_reset_at')
          .eq('creator_id', p.creatorId)
          .eq('fan_id', p.fanId)
          .maybeSingle(),
      ])
      if (dup.error) throw new Error(dup.error.message)
      if ((dup.count ?? 0) > 0) throw new BusinessError('Déjà relancé aujourd’hui')
      if (crmError) throw new Error(crmError.message)

      let q = supabase
        .from('relances')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', p.creatorId)
        .eq('fan_id', p.fanId)
      if (crm?.compteur_reset_at) q = q.gt('created_at', crm.compteur_reset_at)
      const { count } = await q

      const { error } = await supabase.from('relances').insert({
        creator_id: p.creatorId,
        fan_id: p.fanId,
        chatter_id: p.chatterId,
        created_by: profile.id,
        // R affiché après cette relance : base (force admin) + relances depuis reset + 1.
        numero_r: (crm?.compteur_base ?? 0) + (count ?? 0) + 1,
      })
      // 23505 résiduel = course ultra-serrée entre le pré-check ci-dessus et cet insert :
      // déjà couvert par le message précis du pré-check dans l'immense majorité des cas.
      if (error) throw new Error(error.message)
      revalidatePath(SPENDERS_PATH, 'layout')
    },
  })
}

/** Remet le compteur R à zéro (le fan a reconverti) : borne le cycle à maintenant. */
export async function resetCompteur(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: targetInput,
    input: raw,
    guard: crmWriteGuard,
    handler: async (p) => {
      const supabase = await createClient()
      const now = new Date().toISOString()
      // Remet R à 0 : base à 0 ET reborne (sinon un R forcé par un admin resterait).
      const { error } = await supabase.from('spender_crm').upsert(
        { creator_id: p.creatorId, fan_id: p.fanId, compteur_base: 0, compteur_reset_at: now, updated_at: now },
        { onConflict: 'creator_id,fan_id' },
      )
      if (error) throw new Error(error.message)
      revalidatePath(SPENDERS_PATH, 'layout')
    },
  })
}

/**
 * Force la valeur du compteur R (ADMIN uniquement). Pose la base + reborne le cycle à
 * maintenant → R = valeur, et les « + » suivants reprennent à valeur+1.
 */
export async function setCompteur(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: setCompteurInput,
    input: raw,
    guard: adminGuard,
    handler: async (p) => {
      const supabase = await createClient()
      const now = new Date().toISOString()
      const { error } = await supabase.from('spender_crm').upsert(
        { creator_id: p.creatorId, fan_id: p.fanId, compteur_base: p.value, compteur_reset_at: now, updated_at: now },
        { onConflict: 'creator_id,fan_id' },
      )
      if (error) throw new Error(error.message)
      revalidatePath(SPENDERS_PATH, 'layout')
    },
  })
}

/** Archive / désarchive un spender (au bout du cycle R10, ou réactivé). */
export async function setArchived(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: archiveInput,
    input: raw,
    guard: crmWriteGuard,
    handler: async (p) => {
      const supabase = await createClient()
      const { error } = await supabase.from('spender_crm').upsert(
        {
          creator_id: p.creatorId,
          fan_id: p.fanId,
          archived: p.archived,
          archived_at: p.archived ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'creator_id,fan_id' },
      )
      if (error) throw new Error(error.message)
      revalidatePath(SPENDERS_PATH, 'layout')
    },
  })
}
