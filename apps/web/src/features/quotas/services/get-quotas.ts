import { createClient } from '@/lib/supabase/server'
import type { QuotasData, QuotaTeamRow, ExclusionAccountRow } from '../types'

/**
 * Lecture des données de la feature « quotas » (appelée depuis la page).
 * Config manuelle, pas de filtre période : équipes actives + leurs seuils,
 * et TOUS les comptes OF avec leur flag d'exclusion du calcul LTV (LTV seulement —
 * le CA global et les autres chiffres comptent tous les comptes).
 * Une équipe inactive qui a encore une ligne quotas reste listée (sinon son
 * quota deviendrait invisible et impossible à retirer).
 */
export async function getQuotas(): Promise<QuotasData> {
  const supabase = await createClient()

  const [teamsRes, quotasRes, accountsRes] = await Promise.all([
    supabase.from('teams').select('id, name, active').order('name'),
    supabase
      .from('quotas')
      .select('team_id, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur'),
    supabase
      .from('creators')
      .select('id, name, excluded, is_private, active')
      .order('name'),
  ])

  // Ne jamais avaler une erreur : jetée (jamais un soft-error renvoyé), remonte à la
  // boundary error.tsx du workspace — même règle que toutes les autres lectures du repo
  // (docs/guidelines-standard-feature.md §3).
  if (teamsRes.error) throw new Error(teamsRes.error.message)
  if (quotasRes.error) throw new Error(quotasRes.error.message)
  if (accountsRes.error) throw new Error(accountsRes.error.message)

  const quotaByTeam = new Map(quotasRes.data.map((q) => [q.team_id, q]))

  const teamRows: QuotaTeamRow[] = teamsRes.data
    .filter((t) => t.active || quotaByTeam.has(t.id))
    .map((t) => {
      const q = quotaByTeam.get(t.id)
      return {
        teamId: t.id,
        teamName: t.name,
        quota: q
          ? {
              presenceH: q.presence_h,
              reactiviteS: q.reactivite_s,
              mediasProposes: q.medias_proposes,
              convPct: q.conv_pct,
              caEur: q.ca_eur,
            }
          : null,
      }
    })

  // Même garde que pour les équipes : un compte inactif encore exclu reste listé,
  // sinon son exclusion devient invisible et impossible à retirer depuis l'UI.
  const accounts: ExclusionAccountRow[] = accountsRes.data
    .filter((c) => c.active || c.excluded)
    .map((c) => ({
      creatorId: c.id,
      name: c.name,
      excluded: c.excluded,
      isPrivate: c.is_private,
    }))

  return { teams: teamRows, accounts }
}
