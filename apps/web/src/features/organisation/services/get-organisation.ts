import { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import type { OrgChatter, OrgRow, OrgSection, OrganisationData } from '../types'

/**
 * Le board d'orga, DÉRIVÉ des données existantes (AUCUNE saisie propre) :
 *   manager → ses sous-managers (rattachement `manager_ids`) → leurs modèles
 *   (`profile_creators`) → les chatters assignés à chaque modèle, groupés par shift
 *   (fiche chatteur MyPuls via le lien `profiles.chatter_id`).
 *
 * Conséquence voulue : tout changement fait dans MEMBRES (assignations, rattachements, lien
 * MyPuls) ou sur la fiche CHATTERS (shift) se reflète ici automatiquement — et inversement,
 * l'édition des cases du board (actions.ts) écrit CES données-là, pas une copie.
 *
 * Client ADMIN : page opérationnelle agence-wide (l'orga n'a de sens que complète), accès
 * gardé en amont par requireAccess('organisation') — même patron que get-repos.
 */
export async function getOrganisation(): Promise<OrganisationData> {
  const admin = createAdminClient()

  const [profilesRes, creatorsRes, assignRes, chattersRes] = await Promise.all([
    // fetchAll partout : tables sans purge, cap PostgREST silencieux (guidelines §2).
    fetchAll((f, t) =>
      admin
        .from('profiles')
        .select('id, display_name, email, role, manager_ids, chatter_id')
        .in('role', ['manager', 'sous-manager', 'chatteur'])
        .order('id')
        .range(f, t),
    ),
    admin.from('creators').select('id, name, active'),
    fetchAll((f, t) =>
      admin
        .from('profile_creators')
        .select('profile_id, creator_id')
        .order('profile_id')
        .order('creator_id')
        .range(f, t),
    ),
    fetchAll((f, t) => admin.from('chatters').select('id, shift').order('id').range(f, t)),
  ])
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (assignRes.error) throw new Error(assignRes.error.message)
  if (chattersRes.error) throw new Error(chattersRes.error.message)

  const profiles = profilesRes.data
  const creators = creatorsRes.data ?? []
  const nameOf = (p: { display_name: string | null; email: string | null }) =>
    p.display_name ?? p.email ?? '—'

  // Shift par chatteur MyPuls, puis par MEMBRE via son lien.
  const shiftByMypuls = new Map(chattersRes.data.map((c) => [c.id, c.shift]))
  const isShift = (v: string | null | undefined): v is CrmShift =>
    !!v && (CRM_SHIFTS as readonly string[]).includes(v)

  // Modèles par profil et chatters (membres) par modèle.
  const modelsByProfile = new Map<string, string[]>()
  for (const a of assignRes.data) {
    const arr = modelsByProfile.get(a.profile_id)
    if (arr) arr.push(a.creator_id)
    else modelsByProfile.set(a.profile_id, [a.creator_id])
  }
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))
  const chatterMembers = profiles.filter((p) => p.role === 'chatteur')
  const chattersByModel = new Map<string, OrgChatter[]>()
  let aPlacer = 0
  for (const m of chatterMembers) {
    const raw = m.chatter_id ? shiftByMypuls.get(m.chatter_id) : null
    const entry: OrgChatter = {
      id: m.id,
      name: nameOf(m),
      shift: isShift(raw) ? raw : null,
      linked: !!m.chatter_id,
    }
    if (!entry.shift) aPlacer += 1
    for (const creatorId of modelsByProfile.get(m.id) ?? []) {
      const arr = chattersByModel.get(creatorId)
      if (arr) arr.push(entry)
      else chattersByModel.set(creatorId, [entry])
    }
  }
  for (const arr of chattersByModel.values()) arr.sort((a, b) => a.name.localeCompare(b.name))

  const rowFor = (sousManagerName: string | null, creatorId: string): OrgRow => {
    const all = chattersByModel.get(creatorId) ?? []
    const byShift = Object.fromEntries(CRM_SHIFTS.map((s) => [s, [] as OrgChatter[]])) as Record<
      CrmShift,
      OrgChatter[]
    >
    const sansShift: OrgChatter[] = []
    for (const c of all) (c.shift ? byShift[c.shift] : sansShift).push(c)
    return {
      sousManagerName,
      creatorId,
      modelName: creatorName.get(creatorId) ?? '?',
      byShift,
      sansShift,
      total: all.length,
    }
  }

  // Groupes : un manager, ses sous-managers (rattachés), une ligne par modèle de chacun ;
  // puis les modèles portés par le manager lui-même et non couverts par ses sous-managers.
  const managers = profiles
    .filter((p) => p.role === 'manager')
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const sousManagers = profiles.filter((p) => p.role === 'sous-manager')
  const coveredModels = new Set<string>()

  const sections: OrgSection[] = []
  for (const mgr of managers) {
    const team = sousManagers
      .filter((sm) => (sm.manager_ids ?? []).includes(mgr.id))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    const rows: OrgRow[] = []
    const seen = new Set<string>()
    for (const sm of team) {
      for (const creatorId of modelsByProfile.get(sm.id) ?? []) {
        if (seen.has(creatorId)) continue
        seen.add(creatorId)
        coveredModels.add(creatorId)
        rows.push(rowFor(nameOf(sm), creatorId))
      }
    }
    for (const creatorId of modelsByProfile.get(mgr.id) ?? []) {
      if (seen.has(creatorId)) continue
      seen.add(creatorId)
      coveredModels.add(creatorId)
      rows.push(rowFor(null, creatorId))
    }
    // Managers sans équipe ni modèle (ex. face marketing) : pas de groupe vide.
    if (rows.length === 0 && team.length === 0) continue
    sections.push({
      managerName: nameOf(mgr),
      rows,
      total: rows.reduce((s, r) => s + r.total, 0),
    })
  }

  // Modèles actifs hors de toute section = trou d'assignation, à rendre VISIBLE (pas caché).
  const orphanModels = creators
    .filter((c) => c.active && !coveredModels.has(c.id))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b))

  const chatterOptions = chatterMembers
    .map((m) => ({ id: m.id, name: nameOf(m), linked: !!m.chatter_id }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    sections,
    chatterOptions,
    orphanModels,
    counts: {
      managers: sections.length,
      sousManagers: sousManagers.length,
      modeles: creators.filter((c) => c.active).length,
      chatteurs: chatterMembers.length,
      aPlacer,
    },
  }
}
