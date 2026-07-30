import { createAdminClient } from '@glagency/db'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import type { OrgChatter, OrgRow, OrgSection, OrganisationData } from '../types'

/**
 * Le board d'orga, DÉRIVÉ des données existantes (AUCUNE saisie propre) :
 *   manager → ses sous-managers (rattachement `manager_ids`) → leurs modèles
 *   (`profile_creators`) → les chatters assignés à chaque modèle, groupés par shift
 *   (`profiles.shift`, migration 0100).
 *
 * Conséquence voulue : tout changement fait dans MEMBRES (assignations, rattachements, shift)
 * se reflète ici automatiquement — et inversement, l'édition des cases du board (actions.ts)
 * écrit CES données-là, pas une copie.
 *
 * Client ADMIN : page opérationnelle agence-wide (l'orga n'a de sens que complète), accès
 * gardé en amont par requireAccess('organisation') — même patron que get-repos.
 */
export async function getOrganisation(): Promise<OrganisationData> {
  const admin = createAdminClient()

  const [profilesRes, creatorsRes, assignRes] = await Promise.all([
    // fetchAll partout : tables sans purge, cap PostgREST silencieux (guidelines §2).
    fetchAll((f, t) =>
      admin
        .from('profiles')
        .select('id, display_name, email, role, manager_ids, shift')
        .in('role', ['admin', 'manager', 'sous-manager', 'chatteur'])
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
  ])
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (assignRes.error) throw new Error(assignRes.error.message)

  const profiles = profilesRes.data
  const creators = creatorsRes.data ?? []
  const nameOf = (p: { display_name: string | null; email: string | null }) =>
    p.display_name ?? p.email ?? '—'

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
    const entry: OrgChatter = {
      id: m.id,
      name: nameOf(m),
      shift: isShift(m.shift) ? m.shift : null,
    }
    if (!entry.shift) aPlacer += 1
    for (const creatorId of modelsByProfile.get(m.id) ?? []) {
      const arr = chattersByModel.get(creatorId)
      if (arr) arr.push(entry)
      else chattersByModel.set(creatorId, [entry])
    }
  }
  for (const arr of chattersByModel.values()) arr.sort((a, b) => a.name.localeCompare(b.name))

  const rowFor = (owner: { id: string; smId: string | null; smName: string | null }, creatorId: string): OrgRow => {
    const all = chattersByModel.get(creatorId) ?? []
    const byShift = Object.fromEntries(CRM_SHIFTS.map((s) => [s, [] as OrgChatter[]])) as Record<
      CrmShift,
      OrgChatter[]
    >
    for (const c of all) if (c.shift) byShift[c.shift].push(c)
    return {
      ownerId: owner.id,
      sousManagerId: owner.smId,
      sousManagerName: owner.smName,
      creatorId,
      modelName: creatorName.get(creatorId) ?? '?',
      byShift,
      total: all.length,
    }
  }

  // Groupes : un manager, ses sous-managers (rattachés), une ligne par modèle de chacun ;
  // puis les modèles portés par le manager lui-même et non couverts par ses sous-managers.
  // Tête de section = manager OU ADMIN : dans l'agence, certains admins (Axel, Dorian)
  // dirigent une équipe. Un admin sans équipe ni modèle ne crée pas de section (garde plus
  // bas), donc la liste ne se pollue pas.
  const managers = profiles
    .filter((p) => p.role === 'manager' || p.role === 'admin')
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
        rows.push(rowFor({ id: sm.id, smId: sm.id, smName: nameOf(sm) }, creatorId))
      }
    }
    // Lignes « directes » (modèle porté par la tête elle-même) — SEULEMENT pour un manager.
    // Un ADMIN est assigné à TOUS les modèles par nature (c'est son périmètre d'accès, pas
    // une information d'organisation) : les rendre en lignes donnait 16 lignes « Axel » là où
    // la feuille en montre 2 via son sous-manager. Ses assignations restent intactes en base
    // — on ne les affiche simplement pas comme de l'orga.
    if (mgr.role === 'manager') {
      for (const creatorId of modelsByProfile.get(mgr.id) ?? []) {
        if (seen.has(creatorId)) continue
        seen.add(creatorId)
        coveredModels.add(creatorId)
        rows.push(rowFor({ id: mgr.id, smId: null, smName: null }, creatorId))
      }
    }
    // AUCUNE SECTION SANS LIGNE. Une section vide ne produisait qu'un « Aucun modèle assigné à
    // cette équipe » — un `<tr>` réduit à son message, SANS la colonne Manager : plusieurs
    // équipes dans ce cas donnaient des lignes rigoureusement identiques, impossibles à
    // distinguer (retour Benoit 2026-07-30, capture à l'appui). Le board ne montre donc que ce
    // qui existe ; les trous d'organisation se lisent dans la carte KPI « Modèles actifs »
    // (« N sans équipe »), qui est faite pour ça.
    if (rows.length === 0) continue
    sections.push({
      managerId: mgr.id,
      managerName: nameOf(mgr),
      rows,
      total: rows.reduce((s, r) => s + r.total, 0),
    })
  }

  // SOUS-MANAGERS RATTACHÉS À PERSONNE (ou à un manager absent) : sans cette section, leurs
  // modèles et leurs chatters n'apparaîtraient NULLE PART — le board ne construit ses sections
  // que par manager (en prod : 2 sous-managers sur 5, dont l'un porte 4 modèles et 24
  // chatters, audit 2026-07-29). `managerId: ''` = sentinelle « sans manager » : choisir un
  // manager sur une de ces lignes rattache le sous-manager (moveOrgTeam, fromManagerId null).
  const managerIdSet = new Set(managers.map((m) => m.id))
  const orphanSms = sousManagers
    .filter((sm) => !(sm.manager_ids ?? []).some((id) => managerIdSet.has(id)))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const orphanRows: OrgRow[] = []
  for (const sm of orphanSms) {
    for (const creatorId of modelsByProfile.get(sm.id) ?? []) {
      if (orphanRows.some((r) => r.creatorId === creatorId && r.ownerId === sm.id)) continue
      coveredModels.add(creatorId)
      orphanRows.push(rowFor({ id: sm.id, smId: sm.id, smName: nameOf(sm) }, creatorId))
    }
  }
  if (orphanRows.length) {
    sections.push({
      managerId: '',
      managerName: 'Sans manager',
      rows: orphanRows,
      total: orphanRows.reduce((s, r) => s + r.total, 0),
    })
  }

  // Modèles actifs hors de toute section = trou d'assignation, à rendre VISIBLE (pas caché).
  const orphanModels = creators
    .filter((c) => c.active && !coveredModels.has(c.id))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b))

  // TOUS les membres rôle chatteur sont plaçables depuis 0100 : le shift vit sur le membre, plus
  // sur la fiche MyPuls — un chatteur sans lien n'est plus un angle mort du board.
  const chatterOptions = chatterMembers
    .map((m) => ({ id: m.id, name: nameOf(m) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    sections,
    chatterOptions,
    sousManagerOptions: sousManagers
      .map((sm) => ({ id: sm.id, name: nameOf(sm) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    managerOptions: managers.map((m) => ({ id: m.id, name: nameOf(m) })),
    modelOptions: creators
      .filter((c) => c.active)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    orphanModels,
    counts: {
      // Sections réelles : la synthétique « Sans manager » n'est pas une équipe.
      managers: sections.filter((x) => x.managerId !== '').length,
      sousManagers: sousManagers.length,
      modeles: creators.filter((c) => c.active).length,
      chatteurs: chatterMembers.length,
      aPlacer,
    },
  }
}
