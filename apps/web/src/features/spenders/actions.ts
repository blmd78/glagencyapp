'use server'

// Server Actions du tracker spenders (relances R1→R10, reset, archive) — supabase-js + RLS.
// Droit : admin ou page `crm-spenders`. Le cloisonnement par modèle est appliqué par la RLS
// (policies de 0038) ; on garde ici le contrôle d'accès de page + la validation zod.
// Standard runAction (docs/guidelines-standard-feature.md §4) : la garde d'entrée vit dans
// `guard` ; `handler` re-dérive le même résultat à partir des `values` déjà validées.

import { revalidatePath } from 'next/cache'
import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasPageAccess, hasWriteAccess } from '@/lib/auth'
import { runAction, adminGuard, type ActionResult } from '@/lib/actions'
import { archiveInput, relanceInput, setCompteurInput, targetInput } from './schema'

// Scope 'layout' : ce layout (app/(dash)/chatter/spenders/layout.tsx) ne fetch plus rien
// lui-même (chaque page a son propre fetch, cf. normalisation batch 4), mais il reste le
// SEGMENT PARTAGÉ par les 4 vraies vues (/liste, /tracker, /alertes, /archive) — le scope
// 'layout' continue donc de couvrir exactement les 4, qu'il y ait un fetch au niveau
// layout ou non. '/chatter/spenders' seul (type 'page') ne cible que la redirection.
const SPENDERS_PATH = '/chatter/spenders'

// LECTURE / relance : ouvert au chatteur (has_page). SEUL addRelance l'utilise.
async function crmGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return hasPageAccess(profile, 'crm-spenders') ? { ok: true } : { ok: false, error: 'Accès refusé' }
}

// ÉCRITURE non-relance (reset / archive) : admin ou manager/sous-manager — pas le chatteur
// (0060). Miroir de la RLS can_write_page('crm-spenders').
async function crmWriteGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getProfile()
  return hasWriteAccess(profile, 'crm-spenders') ? { ok: true } : { ok: false, error: 'Accès refusé' }
}

/**
 * Enregistre une relance. Le numéro R est figé = compteur courant + 1 (relances depuis le
 * dernier reset). L'unicité (creator_id, fan_id, jour_paris) garantit « 1 relance/jour » —
 * le pré-check ci-dessous porte le message précis pour le cas MÉTIER atteignable (course
 * entre deux closers, onglet resté ouvert après minuit) ; un résiduel ultra-serré tombe en
 * throw générique dans le handler (même pattern que planning/actions.ts `saveBlock`).
 */
export async function addRelance(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: relanceInput,
    input: raw,
    guard: async () => {
      const parsed = relanceInput.safeParse(raw)
      if (!parsed.success) return { ok: true } // saisie invalide : laissée au safeParse de runAction
      const gate = await crmGuard()
      if (!gate.ok) return gate
      const supabase = await createClient()
      const { count, error } = await supabase
        .from('relances')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', parsed.data.creatorId)
        .eq('fan_id', parsed.data.fanId)
        .eq('jour_paris', todayParis())
      if (error) throw new Error(error.message)
      if ((count ?? 0) > 0) return { ok: false, error: 'Déjà relancé aujourd’hui' }
      return { ok: true }
    },
    handler: async (p) => {
      const supabase = await createClient()
      const [profile, { data: crm }] = await Promise.all([
        getProfile(), // React.cache : déjà résolu par le guard dans cette même requête.
        supabase
          .from('spender_crm')
          .select('compteur_reset_at')
          .eq('creator_id', p.creatorId)
          .eq('fan_id', p.fanId)
          .maybeSingle(),
      ])
      if (!profile) throw new Error('Profil introuvable') // impossible : le guard vient de le vérifier

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
        numero_r: (count ?? 0) + 1,
        note: p.note ?? null,
      })
      // 23505 résiduel = course ultra-serrée entre le pré-check du guard et cet insert :
      // déjà couvert par le message précis du guard dans l'immense majorité des cas.
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
