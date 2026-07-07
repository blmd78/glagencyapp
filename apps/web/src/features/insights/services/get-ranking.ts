import { addDays, round2 } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import type { RankingData, RankingRow } from '../types'

/**
 * Classement GLOBAL des chatteurs sur la semaine des insights — agrège chatter_daily via le
 * client admin (hors RLS, tous chatteurs). Chatteurs sans donnée la semaine exclus.
 */
export async function getRanking(weekStart: string | null): Promise<RankingData> {
  if (!weekStart) return { weekStart: '', rows: [] }
  const admin = createAdminClient()
  const weekEnd = addDays(weekStart, 6)

  const [{ data: daily }, { data: chatterRows }] = await Promise.all([
    admin
      .from('chatter_daily')
      .select('chatter_id, ca, propose, vendu, presence_active_h, reactivite_sec')
      .gte('date', weekStart)
      .lte('date', weekEnd),
    admin.from('chatters').select('id, display_name'),
  ])

  const nameById: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) nameById[c.id] = c.display_name

  const acc = new Map<
    string,
    { ca: number; propose: number; vendu: number; presenceH: number; reactSum: number; reactN: number }
  >()
  for (const d of daily ?? []) {
    const a =
      acc.get(d.chatter_id) ?? { ca: 0, propose: 0, vendu: 0, presenceH: 0, reactSum: 0, reactN: 0 }
    a.ca += Number(d.ca) || 0
    a.propose += Number(d.propose) || 0
    a.vendu += Number(d.vendu) || 0
    a.presenceH += Number(d.presence_active_h) || 0
    if (d.reactivite_sec != null) {
      a.reactSum += Number(d.reactivite_sec)
      a.reactN += 1
    }
    acc.set(d.chatter_id, a)
  }

  const rows: RankingRow[] = [...acc.entries()].map(([chatterId, a]) => ({
    chatterId,
    chatterName: nameById[chatterId] ?? '?',
    ca: round2(a.ca),
    presenceH: round2(a.presenceH),
    propose: a.propose,
    convPct: a.propose > 0 ? round2((a.vendu / a.propose) * 100) : null,
    reactSec: a.reactN > 0 ? Math.round(a.reactSum / a.reactN) : null,
  }))

  return { weekStart, rows }
}
