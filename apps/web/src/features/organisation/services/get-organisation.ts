import { createAdminClient } from '@glagency/db'
import { isOrgSectionHead } from '@/lib/roles'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import type { OrgChatter, OrgRow, OrgSection, OrganisationData } from '../types'

/**
 * Le board d'orga, DÉRIVÉ des données existantes (AUCUNE saisie propre) :
 *   manager → ses sous-managers (rattachement `manager_ids`) → leurs modèles
 *   (`profile_creators`) → les chatters assignés à chaque modèle, une pastille par PLACEMENT
 *   (`profile_creators.shifts`, migration 0110 : plusieurs colonnes de la même ligne possibles,
 *   Matin sur Emma et Soir sur Léa aussi — une case = exactement les lignes dont `shifts` contient
 *   ce shift). Bleu = placement principal, rouge = heure sup (`hs_shifts`, marque éditable).
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
        .select('id, display_name, email, role, manager_ids, shift, is_new, arrived_at, org_excluded')
        .in('role', ['admin', 'manager', 'sous-manager', 'chatteur'])
        // Les PARTIS (0102) sortent de l'organigramme : il décrit qui travaille ici aujourd'hui.
        // Leurs `profile_creators` ne sont pas supprimées pour autant — elles racontent ce qui
        // était vrai quand ils étaient là ; on cesse simplement de les rendre.
        .is('left_at', null)
        .order('id')
        .range(f, t),
    ),
    admin.from('creators').select('id, name, active'),
    fetchAll((f, t) =>
      admin
        .from('profile_creators')
        .select('profile_id, creator_id, shifts, hs_shifts')
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

  // Modèles par profil (lignes des porteurs) et chatters (membres) par modèle.
  const modelsByProfile = new Map<string, string[]>()
  for (const a of assignRes.data) {
    const arr = modelsByProfile.get(a.profile_id)
    if (arr) arr.push(a.creator_id)
    else modelsByProfile.set(a.profile_id, [a.creator_id])
  }
  const creatorName = new Map(creators.map((c) => [c.id, c.name]))
  const chatterMembers = profiles.filter((p) => p.role === 'chatteur')
  const chatterById = new Map(chatterMembers.map((m) => [m.id, m]))
  // UNE pastille par PLACEMENT (chatter, modèle, shift) — 0110. Le même chatteur peut donc être
  // Matin ET Soir sur Emma, et Soir sur Léa. `assigned` compte les personnes par modèle (total de
  // la ligne), `placed` celles qui ont au moins une case (KPI « à placer »).
  const chattersByModel = new Map<string, OrgChatter[]>()
  const assignedByModel = new Map<string, string[]>()
  const placed = new Set<string>()
  for (const a of assignRes.data) {
    const m = chatterById.get(a.profile_id)
    if (!m) continue // porteur (encadrant), parti, ou rôle non chatteur : pas une pastille
    const assigned = assignedByModel.get(a.creator_id)
    if (assigned) assigned.push(m.id)
    else assignedByModel.set(a.creator_id, [m.id])
    for (const shift of (a.shifts ?? []).filter(isShift)) {
      placed.add(m.id)
      const entry: OrgChatter = {
        id: m.id,
        name: nameOf(m),
        shift,
        hs: (a.hs_shifts ?? []).includes(shift),
        isNew: m.is_new ?? false,
        arrivedAt: m.arrived_at ?? null,
      }
      const arr = chattersByModel.get(a.creator_id)
      if (arr) arr.push(entry)
      else chattersByModel.set(a.creator_id, [entry])
    }
  }
  for (const arr of chattersByModel.values()) arr.sort((a, b) => a.name.localeCompare(b.name))
  // « À placer » = aucune case sur le board (assigné sans placement, ou pas assigné du tout).
  const aPlacer = chatterMembers.filter((m) => !placed.has(m.id)).length

  const rowFor = (owner: { id: string; smId: string | null; smName: string | null }, creatorId: string): OrgRow => {
    const all = chattersByModel.get(creatorId) ?? []
    const byShift = Object.fromEntries(CRM_SHIFTS.map((s) => [s, [] as OrgChatter[]])) as Record<
      CrmShift,
      OrgChatter[]
    >
    for (const c of all) byShift[c.shift].push(c)
    return {
      ownerId: owner.id,
      sousManagerId: owner.smId,
      sousManagerName: owner.smName,
      creatorId,
      modelName: creatorName.get(creatorId) ?? '?',
      byShift,
      assignedIds: assignedByModel.get(creatorId) ?? [],
      total: assignedByModel.get(creatorId)?.length ?? 0,
    }
  }

  // Groupes : un manager, ses sous-managers (rattachés), une ligne par modèle de chacun ;
  // puis les modèles portés par le manager lui-même et non couverts par ses sous-managers.
  // Tête de section = manager OU ADMIN : dans l'agence, certains admins (Axel, Dorian)
  // dirigent une équipe. Un admin sans équipe ni modèle ne crée pas de section (garde plus
  // bas), donc la liste ne se pollue pas.
  // `org_excluded` (0111, posé dans Membres) : manager TRANSVERSE qui a tous les modèles pour
  // tout voir sur le CRM (ex. Jam) — c'est un périmètre d'accès, pas de l'organisation, même
  // logique que les lignes directes d'admin plus bas. Exclu du board : ni section, ni option
  // manager. Ses modèles ne comptent plus comme couverts (le KPI « sans équipe » redevient
  // lisible) et ses sous-managers éventuels tombent en « Sans manager ».
  // `isOrgSectionHead` = source unique du prédicat, partagée avec la checkbox et les gates
  // d'écriture du drapeau (lib/roles.ts).
  const managers = profiles
    .filter((p) => isOrgSectionHead(p.role) && !p.org_excluded)
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

  // TOUS les membres rôle chatteur en poste sont plaçables (0100 : plus de dépendance au lien
  // MyPuls ; 0110 : autant de placements qu'on veut). Le shift PRINCIPAL voyage avec l'option : la
  // table colore les pastilles (rouge/bleu) sans rien recharger, affichage optimiste compris.
  const chatterOptions = chatterMembers
    .map((m) => ({
      id: m.id,
      name: nameOf(m),
      isNew: m.is_new ?? false,
      arrivedAt: m.arrived_at ?? null,
      principalShift: isShift(m.shift) ? m.shift : null,
    }))
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
