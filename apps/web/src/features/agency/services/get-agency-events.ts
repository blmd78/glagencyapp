import 'server-only'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { AgencyEvent } from '../month-layout'
import type { AgencyRole, EventColor, Legend } from '../schema'

/**
 * Durée de vie des URLs de photo : 1 h. Une URL déjà servie reste valable jusqu'au bout, même si
 * « Visible par » se resserre entre-temps — la fenêtre d'exposition reste donc courte. Au-delà,
 * une page laissée ouverte perd ses images jusqu'à la navigation suivante (assumé).
 */
const IMAGE_URL_TTL_S = 60 * 60

/**
 * TOUS les événements visibles, pour la grille du mois ET la liste en dessous (à venir / passé —
 * demande Benoit 2026-09-28) : `layoutMonth` ne garde de toute façon que ceux de la grille, une
 * seule lecture sert les deux. Client utilisateur : la RLS (`agency_events_read`) ne rend que
 * ceux qui visent le rôle de l'appelant. `fetchAll` : la liste « Passé » n'a pas de borne, la
 * table grossit pour toujours.
 *
 * Photos : le bucket `agency-events` est PRIVÉ et sans policy (0176). Les URLs sont signées en
 * service-role, mais UNIQUEMENT pour les événements que la RLS vient de rendre — une photo suit
 * donc « Visible par ». Une signature en échec laisse l'événement sans photo, jamais la page en
 * erreur.
 */
export async function getAgencyEvents(): Promise<AgencyEvent[]> {
  const supabase = await createClient()
  const { data, error } = await fetchAll((from, to) =>
    supabase
      .from('agency_events')
      .select('id, title, start_date, end_date, remind_on_day, audience, color, image_path, kind, creator_id')
      .order('start_date')
      .order('id')
      .range(from, to),
  )
  if (error) throw new Error(error.message)

  const admin = createAdminClient()
  const paths = data.flatMap((e) => (e.image_path ? [e.image_path] : []))
  const urls = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await admin.storage.from('agency-events').createSignedUrls(paths, IMAGE_URL_TTL_S)
    for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl)
  }

  // Modèles des événements rendus (2026-10-02) : nom et avatar lus en service-role, mais
  // UNIQUEMENT pour les événements que la RLS vient de rendre — comme les photos. La RLS de
  // `creators` ne donne pas toutes les modèles à un chatteur, alors que l'événement le vise.
  const creatorIds = [...new Set(data.flatMap((e) => (e.creator_id ? [e.creator_id] : [])))]
  const models = new Map<string, { name: string; avatarUrl: string | null }>()
  if (creatorIds.length > 0) {
    const { data: rows } = await admin.from('creators').select('id, name, avatar_path').in('id', creatorIds)
    const avatarPaths = (rows ?? []).flatMap((c) => (c.avatar_path ? [c.avatar_path] : []))
    const avatarUrls = new Map<string, string>()
    if (avatarPaths.length > 0) {
      const { data: signed } = await admin.storage.from('creator-avatars').createSignedUrls(avatarPaths, IMAGE_URL_TTL_S)
      for (const s of signed ?? []) if (s.path && s.signedUrl && !s.error) avatarUrls.set(s.path, s.signedUrl)
    }
    for (const c of rows ?? []) {
      models.set(c.id, { name: c.name, avatarUrl: c.avatar_path ? (avatarUrls.get(c.avatar_path) ?? null) : null })
    }
  }

  return data.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date,
    remindOnDay: e.remind_on_day,
    audience: e.audience as AgencyRole[],
    color: e.color as EventColor | null,
    imagePath: e.image_path,
    imageUrl: e.image_path ? (urls.get(e.image_path) ?? null) : null,
    kind: e.kind,
    creatorId: e.creator_id,
    creatorName: e.creator_id ? (models.get(e.creator_id)?.name ?? null) : null,
    creatorAvatarUrl: e.creator_id ? (models.get(e.creator_id)?.avatarUrl ?? null) : null,
  }))
}

/** Une modèle proposable dans la fenêtre d'événement. */
export type AgencyModel = { id: string; name: string }

/**
 * Les modèles du sélecteur de la fenêtre d'événement — ADMIN seul (la page ne l'appelle que pour
 * lui) : modèles actives et non exclues, par nom.
 */
export async function getAgencyModels(): Promise<AgencyModel[]> {
  const { data, error } = await createAdminClient()
    .from('creators')
    .select('id, name')
    .eq('active', true)
    .eq('excluded', false)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** La légende des couleurs (`agency_legend`, 0176) — lisible par tout compte connecté. */
export async function getAgencyLegend(): Promise<Legend> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agency_legend').select('color, label')
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map((r) => [r.color, r.label])) as Legend
}
