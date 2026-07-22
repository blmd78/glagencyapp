import { createAdminClient } from '@glagency/db'
import { getChatters } from '@/lib/services/get-chatters'
import type { Period } from '@/lib/period'
import type { CrmRole } from '@/lib/types/chatters'
import type { StatChatteurData } from '../types'

/**
 * Données de la page Stat chatteur : 4 KPI (nombre de MEMBRES par désignation closing, client admin
 * agence-wide car la RLS `profiles` cloisonne par équipe) + le classement des chatteurs closing par
 * ventes (`vendu`), réutilisant `getChatters()` (qui porte déjà `closingRole`/`closingTeam`/`vendu`
 * par chatteur, agrégé sur la période du datepicker). `restricted` transmis tel quel à getChatters.
 */
export async function getStatChatteur(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<StatChatteurData> {
  const admin = createAdminClient()
  const [chattersData, membersRes] = await Promise.all([
    getChatters(period, opts),
    admin.from('profiles').select('closing_role, closing_team'),
  ])
  if (membersRes.error) throw new Error(membersRes.error.message)

  let nbSetters = 0
  let nbClosers = 0
  let nbRouge = 0
  let nbBleue = 0
  for (const m of membersRes.data ?? []) {
    if (m.closing_role === 'setter') nbSetters++
    else if (m.closing_role === 'closer') nbClosers++
    if (m.closing_team === 'rouge') nbRouge++
    else if (m.closing_team === 'bleue') nbBleue++
  }

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

  return { period: chattersData.period, kpis: { nbSetters, nbClosers, nbRouge, nbBleue }, rows }
}
