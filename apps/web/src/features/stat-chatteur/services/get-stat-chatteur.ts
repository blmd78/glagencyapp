import { createAdminClient } from '@glagency/db'
import { getChatters } from '@/lib/services/get-chatters'
import type { Period } from '@/lib/period'
import type { CrmRole } from '@/lib/types/chatters'
import type { StatChatteurData } from '../types'

/** Compte les 4 désignations closing (rôle setter/closer + équipe rouge/bleue) sur une liste. */
function countDesignations(
  items: readonly { closingRole: string | null; closingTeam: string | null }[],
) {
  let nbSetters = 0
  let nbClosers = 0
  let nbRouge = 0
  let nbBleue = 0
  for (const it of items) {
    if (it.closingRole === 'setter') nbSetters++
    else if (it.closingRole === 'closer') nbClosers++
    if (it.closingTeam === 'rouge') nbRouge++
    else if (it.closingTeam === 'bleue') nbBleue++
  }
  return { nbSetters, nbClosers, nbRouge, nbBleue }
}

/**
 * Données de la page Stat chatteur : 4 KPI (compteurs de désignation closing) + le classement des
 * chatteurs closing par ventes (`vendu`), réutilisant `getChatters()` (qui porte déjà
 * `closingRole`/`closingTeam`/`vendu` par chatteur, agrégé sur la période du datepicker).
 *
 * KPI : en mode **restreint**, on compte sur le périmètre VISIBLE (les chatteurs déjà cloisonnés par
 * RLS) → KPI et classement décrivent la même population. En mode **admin**, on compte tous les
 * MEMBRES agence-wide (client admin sur `profiles`), y compris ceux non encore liés à un chatteur
 * (la désignation existe même sans lien).
 */
export async function getStatChatteur(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<StatChatteurData> {
  const chattersData = await getChatters(period, opts)

  const rows = chattersData.chatters
    .filter((c) => c.closingRole !== null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      closingRole: c.closingRole as CrmRole,
      closingTeam: c.closingTeam,
      vendu: c.vendu,
    }))
    .sort((a, b) => b.vendu - a.vendu)

  let kpis
  if (opts.restricted) {
    kpis = countDesignations(chattersData.chatters)
  } else {
    const admin = createAdminClient()
    const membersRes = await admin.from('profiles').select('closing_role, closing_team')
    if (membersRes.error) throw new Error(membersRes.error.message)
    kpis = countDesignations(
      (membersRes.data ?? []).map((m) => ({
        closingRole: m.closing_role,
        closingTeam: m.closing_team,
      })),
    )
  }

  return { period: chattersData.period, kpis, rows }
}
