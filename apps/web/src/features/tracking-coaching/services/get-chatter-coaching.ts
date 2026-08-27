import { todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { ChatterCoaching, CoachingSession, Skill, SkillRating } from '../types'

interface RawRating {
  id: string
  skill_id: string
  stars: number
  comment: string
  created_at: string
  author: { display_name: string | null } | null
}

/**
 * Le suivi complet d'un chatteur : sa grille de compétences avec l'historique de chaque note,
 * ses sessions 1:1 et les notes libres de l'encadrement.
 *
 * Cinq lectures parallèles, toutes bornées à un chatteur — quelques dizaines de lignes chacune.
 * Pas de RPC : il n'y a rien à agréger, seulement à assembler.
 */
export async function getChatterCoaching(
  profileId: string,
  canWrite: boolean,
): Promise<ChatterCoaching | null> {
  const supabase = await createClient()

  const [profileRes, skillsRes, ratingsRes, sessionsRes, notesRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email').eq('id', profileId).maybeSingle(),
    supabase.from('tracker_skills').select('id, name, description, position')
      .eq('active', true).order('position'),
    // `fetchAll` et non un `select` nu : c'est la SEULE lecture de cette fiche qui puisse
    // dépasser les 1000 lignes de PostgREST. Sept compétences notées chaque semaine pendant
    // trois ans y suffisent — et la troncature serait SILENCIEUSE : un historique amputé, une
    // « note courante » fausse, et personne pour s'en apercevoir. `.order()` sur `created_at`
    // PUIS `id` : sans second critère, deux notes posées dans la même seconde peuvent changer
    // de place d'une page à l'autre et être lues deux fois ou pas du tout.
    fetchAll<RawRating>((f, t) =>
      supabase.from('tracker_ratings')
        .select('id, skill_id, stars, comment, created_at, author:profiles!tracker_ratings_author_id_fkey(display_name)')
        .eq('chatter_id', profileId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(f, t),
    ),
    supabase.from('tracker_sessions')
      .select('id, date, score, summary, general, author:profiles!tracker_sessions_author_id_fkey(display_name)')
      .eq('chatter_id', profileId).order('date', { ascending: false }),
    supabase.from('tracker_chatter_notes')
      .select('id, body, created_at, author:profiles!tracker_chatter_notes_author_id_fkey(display_name)')
      .eq('chatter_id', profileId).order('created_at', { ascending: false }),
  ])

  for (const res of [profileRes, skillsRes, ratingsRes, sessionsRes, notesRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  const profile = profileRes.data
  if (!profile) return null

  const { data: models, error: modelsErr } = await supabase
    .from('profile_creators').select('creators(name)').eq('profile_id', profileId)
  if (modelsErr) throw new Error(modelsErr.message)

  const name = (a: { display_name: string | null } | null) => a?.display_name ?? 'inconnu'

  const skills: Skill[] = (skillsRes.data ?? []).map((s) => {
    const history: SkillRating[] = (ratingsRes.data ?? [])
      .filter((r) => r.skill_id === s.id)
      .map((r) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment,
        author: name(r.author),
        date: r.created_at.slice(0, 10),
      }))
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      // La note courante est la plus récente : on n'écrase jamais, on empile.
      current: history[0]?.stars ?? null,
      history,
    }
  })

  const sessions: CoachingSession[] = (sessionsRes.data ?? []).map((s) => ({
    id: s.id,
    date: s.date,
    score: s.score == null ? null : Number(s.score),
    summary: s.summary,
    general: s.general,
    author: name(s.author),
  }))

  const scored = sessions.filter((s) => s.score != null)
  const last = sessions[0]?.date ?? null
  const today = Date.parse(`${todayParis()}T12:00:00Z`)

  return {
    profileId,
    name: profile.display_name ?? profile.email ?? 'sans nom',
    models: (models ?? []).map((m) => m.creators?.name).filter((n): n is string => Boolean(n)),
    average: scored.length
      ? Math.round((scored.reduce((n, s) => n + (s.score as number), 0) / scored.length) * 100) / 100
      : null,
    scoredSessions: scored.length,
    totalSessions: sessions.length,
    lastSessionDate: last,
    gapDays: last == null ? null : Math.max(0, Math.round((today - Date.parse(`${last}T12:00:00Z`)) / 86_400_000)),
    skills,
    sessions,
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id,
      body: n.body,
      author: name(n.author),
      date: n.created_at.slice(0, 10),
    })),
    canWrite,
  }
}
