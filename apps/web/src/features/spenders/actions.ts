'use server'

// Server Actions du tracker spenders (relances R1→R10, reset, archive) — supabase-js + RLS.
// Droit : admin ou page `crm-spenders`. Le cloisonnement par modèle est appliqué par la RLS
// (policies de 0034) ; on garde ici le contrôle d'accès de page + la validation zod.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { relanceInput, setCompteurInput, targetInput } from './schema'

type Result = { success: true } | { success: false; error: string }

async function requireCrm() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('crm-spenders')) return null
  return profile
}

/**
 * Enregistre une relance. Le numéro R est figé = compteur courant + 1 (relances depuis le
 * dernier reset). L'unicité (creator_id, fan_id, jour_paris) garantit « 1 relance/jour ».
 */
export async function addRelance(raw: unknown): Promise<Result> {
  const p = relanceInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  // Garde + lecture CRM en PARALLÈLE (indépendants — la RLS protège la lecture) :
  // une vague d'aller-retour de moins sur le chemin de chaque clic de relance.
  const supabase = await createClient()
  const [profile, { data: crm }] = await Promise.all([
    requireCrm(),
    supabase
      .from('spender_crm')
      .select('compteur_reset_at')
      .eq('creator_id', p.data.creatorId)
      .eq('fan_id', p.data.fanId)
      .maybeSingle(),
  ])
  if (!profile) return { success: false, error: 'Accès refusé' }

  let q = supabase
    .from('relances')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', p.data.creatorId)
    .eq('fan_id', p.data.fanId)
  if (crm?.compteur_reset_at) q = q.gt('created_at', crm.compteur_reset_at)
  const { count } = await q

  const { error } = await supabase.from('relances').insert({
    creator_id: p.data.creatorId,
    fan_id: p.data.fanId,
    chatter_id: p.data.chatterId,
    created_by: profile.id,
    numero_r: (count ?? 0) + 1,
    note: p.data.note ?? null,
  })
  if (error) {
    // Violation de l'unique (creator_id, fan_id, jour_paris) = déjà relancé aujourd'hui.
    if (error.code === '23505') return { success: false, error: 'Déjà relancé aujourd’hui' }
    return { success: false, error: error.message }
  }
  // Scope 'layout' : couvre les 4 vraies vues (/liste, /tracker, /alertes, /archive) —
  // '/chatter/spenders' seul ne cible que la page de redirection, pas le sous-arbre.
  revalidatePath('/chatter/spenders', 'layout')
  return { success: true }
}

/** Remet le compteur R à zéro (le fan a reconverti) : borne le cycle à maintenant. */
export async function resetCompteur(raw: unknown): Promise<Result> {
  const profile = await requireCrm()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = targetInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const now = new Date().toISOString()
  // Remet R à 0 : base à 0 ET reborne (sinon un R forcé par un admin resterait).
  const { error } = await supabase.from('spender_crm').upsert(
    { creator_id: p.data.creatorId, fan_id: p.data.fanId, compteur_base: 0, compteur_reset_at: now, updated_at: now },
    { onConflict: 'creator_id,fan_id' },
  )
  if (error) return { success: false, error: error.message }
  // Scope 'layout' : couvre les 4 vraies vues (/liste, /tracker, /alertes, /archive) —
  // '/chatter/spenders' seul ne cible que la page de redirection, pas le sous-arbre.
  revalidatePath('/chatter/spenders', 'layout')
  return { success: true }
}

/**
 * Force la valeur du compteur R (ADMIN uniquement). Pose la base + reborne le cycle à
 * maintenant → R = valeur, et les « + » suivants reprennent à valeur+1.
 */
export async function setCompteur(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Réservé aux admins' }
  const p = setCompteurInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Valeur invalide (0–99)' }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('spender_crm').upsert(
    { creator_id: p.data.creatorId, fan_id: p.data.fanId, compteur_base: p.data.value, compteur_reset_at: now, updated_at: now },
    { onConflict: 'creator_id,fan_id' },
  )
  if (error) return { success: false, error: error.message }
  // Scope 'layout' : couvre les 4 vraies vues (/liste, /tracker, /alertes, /archive) —
  // '/chatter/spenders' seul ne cible que la page de redirection, pas le sous-arbre.
  revalidatePath('/chatter/spenders', 'layout')
  return { success: true }
}

/** Archive / désarchive un spender (au bout du cycle R10, ou réactivé). */
export async function setArchived(raw: unknown, archived: boolean): Promise<Result> {
  const profile = await requireCrm()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = targetInput.safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }

  const supabase = await createClient()
  const { error } = await supabase.from('spender_crm').upsert(
    {
      creator_id: p.data.creatorId,
      fan_id: p.data.fanId,
      archived,
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'creator_id,fan_id' },
  )
  if (error) return { success: false, error: error.message }
  // Scope 'layout' : couvre les 4 vraies vues (/liste, /tracker, /alertes, /archive) —
  // '/chatter/spenders' seul ne cible que la page de redirection, pas le sous-arbre.
  revalidatePath('/chatter/spenders', 'layout')
  return { success: true }
}
