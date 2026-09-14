import { addDays, isoWeekday, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { savedLabel } from '../saved-label'

export interface RecapDay {
  date: string
  label: string
  filled: boolean
  focus: string
  problem: string
  positive: string
  negative: string
  notes: string
  /**
   * « lundi 14/09 à 03:05 » — heure du DERNIER enregistrement (`updated_at`), lue à Paris. La table
   * n'a pas de `created_at` : `saveDaily` réécrit la ligne à chaque sauvegarde. `null` sans ligne.
   */
  savedLabel: string | null
}

export interface RecapPerson {
  profileId: string
  name: string
  role: string
  planned: number
  done: number
  notDone: number
  percent: number
  debriefs: number
  expectedDebriefs: number
  /**
   * Le VERBATIM des débriefs de cette personne est-il lisible par le spectateur ? Miroir EXACT du
   * `case` de `tracker_todo_week_recap` (0137) : un admin, et chacun sur son propre journal.
   * Sans ce drapeau, `days` vide serait indiscernable de « aucun débrief déposé » et la carte
   * afficherait « Pas de débrief » à côté d'un compteur qui dit le contraire.
   */
  verbatim: boolean
  days: RecapDay[]
}

export interface RecapGroup {
  label: string
  people: RecapPerson[]
}

export interface RecapData {
  weekStart: string
  weekEnd: string
  totals: { planned: number; done: number; notDone: number; debriefs: number; expected: number }
  groups: RecapGroup[]
}

interface RawPerson {
  profileId: string
  name: string
  role: string
  planned: number
  done: number
  debriefs: number
  days: { date: string; focus: string; problem: string; positive: string; negative: string; notes: string }[]
}

/**
 * Récap hebdomadaire des to-do et débriefs des encadrants.
 *
 * ⚠️ Ce n'est PAS un récap de présence — c'est le bilan de la to-do (tâche 5). Le contresens est
 * facile : leur écran s'appelle « Récap » et vit dans le tracker.
 *
 * REGROUPEMENT INFÉRÉ. Leur écran range les encadrants en trois paliers — « suivi des chatters et
 * 1:1 », « to do seule, pas de chatters », « admin et principal ». La règle exacte n'est écrite
 * nulle part dans ce qu'on a relevé ; celle-ci la reproduit à partir du seul signal dont on
 * dispose : le rôle, et l'existence de modèles assignés. À confronter à leur `recappage.js` si on
 * remet un jour la main dessus.
 */
export async function getWeekRecap(
  /**
   * Le SPECTATEUR. Il ne sert pas à filtrer — c'est la RPC (definer, 0137) qui borne le périmètre
   * et décide du verbatim ; il sert à SAVOIR ce qu'elle vient de rendre, pour que la carte ne
   * mente pas sur un `days` vide. La règle est écrite deux fois, en SQL et ici, à dessein : le
   * SQL autorise, celui-ci raconte.
   */
  viewer: { id: string; isAdmin: boolean },
  week?: string,
): Promise<RecapData> {
  const today = todayParis()
  const weekStart = addDays(week ?? today, -(isoWeekday(week ?? today) - 1))
  const weekEnd = addDays(weekStart, 6)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tracker_todo_week_recap', {
    p_from: weekStart,
    p_to: weekEnd,
  })
  if (error) throw new Error(error.message)
  const raw = (data as RawPerson[] | null) ?? []

  // Jours attendus : jusqu'à aujourd'hui pour la semaine en cours, les sept sinon. Compter sur
  // sept un mercredi afficherait « 0/7 » à quelqu'un qui n'a encore rien pu rater.
  const lastDay = today < weekEnd ? today : weekEnd
  const expected = Math.max(0, Math.round((Date.parse(lastDay) - Date.parse(weekStart)) / 86_400_000) + 1)

  // L'HEURE D'ENREGISTREMENT est lue à côté de la RPC, pas dans sa réponse : la policy
  // `tracker_todo_daily_read` (admin, ou son propre journal) couvre EXACTEMENT les personnes dont
  // le verbatim est rendu — aucune migration pour une colonne que le client a déjà le droit de lire.
  const verbatimIds = raw.filter((p) => viewer.isAdmin || p.profileId === viewer.id).map((p) => p.profileId)
  const [withModels, savedAt] = await Promise.all([
    profilesWithModels(raw.map((p) => p.profileId)),
    debriefSavedAt(verbatimIds, weekStart, weekEnd),
  ])

  const people: RecapPerson[] = raw.map((p) => {
    const verbatim = viewer.isAdmin || p.profileId === viewer.id
    const byDate = new Map(p.days.map((d) => [d.date, d]))
    const days: RecapDay[] = []
    // Aucune colonne de jours à construire quand le verbatim n'est pas rendu : elles seraient
    // toutes « Pas de débrief », ce qui est faux dès que `debriefs > 0`.
    for (let i = 0; verbatim && i < expected; i++) {
      const date = addDays(weekStart, i)
      const d = byDate.get(date)
      const at = savedAt.get(`${p.profileId}|${date}`)
      days.push({
        date,
        label: new Intl.DateTimeFormat('fr-FR', {
          weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC',
        }).format(new Date(`${date}T12:00:00Z`)),
        // Rempli = il y a du CONTENU, pas seulement une ligne. Le formulaire n'impose aucun champ
        // et `saveDaily` fait un upsert inconditionnel : enregistrer à blanc crée une ligne aux
        // cinq champs vides. Sur `d != null`, la journée passait alors pour remplie et s'ouvrait
        // sur un bloc vide, en contradiction avec le compteur — que le SQL, lui, ne compte que si
        // l'un des cinq champs est non vide (0137). Même règle des deux côtés.
        filled: d != null && [d.focus, d.problem, d.positive, d.negative, d.notes].some((v) => v.trim() !== ''),
        focus: d?.focus ?? '',
        problem: d?.problem ?? '',
        positive: d?.positive ?? '',
        negative: d?.negative ?? '',
        notes: d?.notes ?? '',
        savedLabel: d != null && at ? savedLabel(at) : null,
      })
    }
    return {
      profileId: p.profileId,
      name: p.name,
      role: p.role,
      planned: p.planned,
      done: p.done,
      notDone: p.planned - p.done,
      percent: p.planned > 0 ? Math.round((p.done / p.planned) * 100) : 0,
      debriefs: p.debriefs,
      expectedDebriefs: expected,
      verbatim,
      days,
    }
  })

  const bucket = (p: RecapPerson): string => {
    if (p.role === 'admin' || p.role === 'principal') return 'admin et principal'
    return withModels.has(p.profileId) ? 'suivi des chatters et 1:1' : 'to do seule, pas de chatters'
  }
  const order = ['suivi des chatters et 1:1', 'to do seule, pas de chatters', 'admin et principal']
  const groups: RecapGroup[] = order
    .map((label) => ({ label, people: people.filter((p) => bucket(p) === label) }))
    .filter((g) => g.people.length > 0)

  return {
    weekStart,
    weekEnd,
    totals: {
      planned: people.reduce((n, p) => n + p.planned, 0),
      done: people.reduce((n, p) => n + p.done, 0),
      notDone: people.reduce((n, p) => n + p.notDone, 0),
      debriefs: people.reduce((n, p) => n + p.debriefs, 0),
      expected: expected * people.length,
    },
    groups,
  }
}

/**
 * `updated_at` des débriefs de la semaine, par `owner_id|date`. Client UTILISATEUR : la RLS borne.
 * Pas de `fetchAll` : borné par la CLÉ (owner_id, date), au plus sept lignes par personne rendue —
 * très loin du plafond de 1 000 de PostgREST (même raisonnement que `get-members.ts`).
 */
async function debriefSavedAt(ids: string[], from: string, to: string): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_todo_daily')
    .select('owner_id, date, updated_at')
    .in('owner_id', ids)
    .gte('date', from)
    .lte('date', to)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((r) => [`${r.owner_id}|${r.date}`, r.updated_at]))
}

/**
 * Qui a des modèles assignés. Client admin : `profile_creators` est cloisonnée par RLS alors qu'on
 * lit ici les assignations d'AUTRES profils — même raison que `creator-scope.ts`.
 */
async function profilesWithModels(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const admin = createAdminClient()
  const { data, error } = await admin.from('profile_creators').select('profile_id').in('profile_id', ids)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.profile_id))
}
