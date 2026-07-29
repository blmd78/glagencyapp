import { addDays, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { REPORT_WINDOW_DAYS, type Report, type ReportMember } from '../types'

/** Borne basse de la fenêtre glissante affichée (jour métier Paris, jamais UTC — §6). */
const windowStart = () => addDays(todayParis(), -REPORT_WINDOW_DAYS)

/**
 * Comptes rendus d'UNE personne, fenêtre 30 jours, antéchrono. Le cloisonnement est porté par
 * la RLS (`daily_reports_read`, 0053/0064). Chargé À LA DEMANDE quand on déplie son nom
 * (`loadReports`, actions.ts) — sinon le premier rendu embarquerait le texte intégral de 30
 * jours × tous les encadrants, alors que la pile s'affiche repliée.
 * Volume : ≤ 31 lignes → pas de `fetchAll` nécessaire.
 */
export async function getReports(profileId: string): Promise<Report[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('daily_reports')
    .select('day, content')
    .eq('profile_id', profileId)
    .gte('day', windowStart())
    .order('day', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ day: r.day, content: r.content }))
}

/** Ligne réduite au strict nécessaire du repère « a écrit / n'a rien écrit ». */
interface DayRow {
  profile_id: string
  day: string
}

/**
 * Les JOURS où chaque personne a écrit, sans le contenu — c'est tout ce dont la pile repliée a
 * besoin (« Compte rendu du jour » / « Rien aujourd'hui »). Une entrée par id demandé, même vide.
 */
export async function getReportDays(profileIds: string[]): Promise<Map<string, string[]>> {
  const byProfile = new Map<string, string[]>(profileIds.map((id) => [id, []]))
  if (!profileIds.length) return byProfile

  const supabase = await createClient()
  // `fetchAll` : N personnes × 30 jours peut dépasser la limite PostgREST de 1000 lignes,
  // qui tronque EN SILENCE (cf. docs/guidelines-data-loading.md).
  const { data, error } = await fetchAll<DayRow>((f, t) =>
    supabase
      .from('daily_reports')
      .select('profile_id, day')
      .in('profile_id', profileIds)
      .gte('day', windowStart())
      // `.order()` sur la PK COMPLÈTE (guidelines §2) : `unique (profile_id, day)` (0053)
      // suffirait à rendre l'ordre total, `id` ferme le cas à la lettre.
      .order('profile_id')
      .order('day', { ascending: false })
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)

  for (const r of data) byProfile.get(r.profile_id)?.push(r.day)
  return byProfile
}

/**
 * Rôles EMPILÉS en accordéons : l'encadrement (demande du propriétaire, 2026-07-26 — « pas
 * mettre les chatteurs »). Ce n'est PAS un filtre de lecture : un chatteur reste joignable par
 * le SÉLECTEUR, qui liste tout le monde — on ne veut simplement pas dérouler 100 chatteurs sur
 * la page. Le superadmin, lui, ne rédige pas (v1) et reste hors des deux.
 */
const PILED_ROLES = ['admin', 'manager', 'sous-manager', 'police']

/** Cette personne a-t-elle sa ligne dans la pile ? Soi toujours (`role: ''`). */
export const isPiled = (member: ReportMember, selfId: string): boolean =>
  member.id === selfId || PILED_ROLES.includes(member.role)

/**
 * Personnes consultables sur le Dashboard — TOUT LE MONDE sauf le superadmin, chatteurs
 * compris : c'est ce qui alimente le sélecteur. La RLS de `profiles` (0097) fait le scoping :
 * admin ET tout encadrant → tout le monde ; chatteur → soi seul.
 * Le tri de la PILE se fait ensuite côté page (`isPiled`), pas ici — sinon le sélecteur
 * perdrait les chatteurs avec elle.
 */
export async function getReportMembers(): Promise<ReportMember[]> {
  const supabase = await createClient()
  // fetchAll : `profiles` grossit avec l'équipe (cap PostgREST 1000 silencieux) — même règle
  // que team.ts/get-repos sur la même table. `.order('id')` en tiebreaker = tri déterministe.
  const { data, error } = await fetchAll((f, t) =>
    supabase
      .from('profiles')
      .select('id, display_name, email, role')
      .neq('role', 'superadmin')
      .order('display_name')
      .order('id')
      .range(f, t),
  )
  if (error) throw new Error(error.message)
  return data.map((p) => ({ id: p.id, name: p.display_name ?? p.email ?? '—', role: p.role }))
}
