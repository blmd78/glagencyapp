import { daysBetween, round2 } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktStaffData, MktStaffRow } from '../types'

const r2 = round2

/**
 * Staff & payes sur la période — formules du dashboard legacy (crm-marketing.html) :
 *   VA      = fixe×(jours/30) + subs de SES liens × rate_tw + vues de SES comptes IG/1000 × rate_ig
 *             + prime × (jours/30)
 *   Manager = fixe×(jours/30) + pct % du revenu total des liens sur la période
 */
export async function getMktStaff(period: Period): Promise<MktStaffData> {
  const supabase = await createClient()
  const [{ data: staff }, { data: staffLinks }, { data: accounts }, { data: links }, { data: daily }, { data: social }] =
    await Promise.all([
      supabase.from('mkt_staff').select('*').order('role').order('name'),
      supabase.from('mkt_staff_links').select('staff_id, link_id'),
      supabase
        .from('mkt_social_accounts')
        .select('id, handle, staff_id, platform')
        .in('platform', ['instagram', 'twitter']),
      supabase.from('mkt_links').select('id, name, active, type'),
      fetchAll((f, t) =>
        supabase
          .from('mkt_link_daily')
          .select('link_id, conversions, revenue_eur')
          .gte('date', period.from)
          .lte('date', period.to)
          .order('link_id')
          .order('date')
          .range(f, t),
      ),
      fetchAll((f, t) =>
        supabase
          .from('mkt_social_daily')
          .select('account_id, views_24h')
          .gte('date', period.from)
          .lte('date', period.to)
          .order('account_id')
          .order('date')
          .range(f, t),
      ),
    ])
  // Paiements des MOIS couverts par la période (les payes staff sont mensuelles).
  const monthStart = `${period.from.slice(0, 7)}-01`
  const monthEnd = `${period.to.slice(0, 7)}-01`
  const { data: payments } = await supabase
    .from('mkt_staff_payments')
    .select('staff_id, amount_eur')
    .gte('month', monthStart)
    .lte('month', monthEnd)

  const days = daysBetween(period.from, period.to) + 1
  const ratio = days / 30

  const convByLink = new Map<string, number>()
  let totalRevenue = 0
  for (const d of daily ?? []) {
    convByLink.set(d.link_id, (convByLink.get(d.link_id) ?? 0) + d.conversions)
    totalRevenue += Number(d.revenue_eur)
  }
  const viewsByAcc = new Map<string, number>()
  for (const d of social ?? []) {
    viewsByAcc.set(d.account_id, (viewsByAcc.get(d.account_id) ?? 0) + (d.views_24h ?? 0))
  }
  const linksByStaff = new Map<string, string[]>()
  for (const sl of staffLinks ?? []) {
    linksByStaff.set(sl.staff_id, [...(linksByStaff.get(sl.staff_id) ?? []), sl.link_id])
  }
  // Comptes IG = paye (vues reels) ; comptes TW = suivi/affichage uniquement (staff_id
  // posé aussi, mais la paye ne somme QUE les vues Instagram → aucun impact rémunération).
  const igAccounts = (accounts ?? []).filter((a) => a.platform === 'instagram')
  const twAccounts = (accounts ?? []).filter((a) => a.platform === 'twitter')
  const igByStaff = new Map<string, string[]>()
  for (const a of igAccounts) {
    if (a.staff_id) igByStaff.set(a.staff_id, [...(igByStaff.get(a.staff_id) ?? []), a.id])
  }
  const twByStaff = new Map<string, string[]>()
  for (const a of twAccounts) {
    if (a.staff_id) twByStaff.set(a.staff_id, [...(twByStaff.get(a.staff_id) ?? []), a.id])
  }

  // Fiches visibles du caller (RLS : les siennes, ou toutes pour un admin) et liens
  // assignés à une fiche invisible (= pris par le VA d'un autre manager).
  const visibleStaffIds = new Set((staff ?? []).map((st) => st.id))
  const takenLinkIds = new Set(
    (staffLinks ?? []).filter((sl) => !visibleStaffIds.has(sl.staff_id)).map((sl) => sl.link_id),
  )
  // Liens encore assignés à une fiche visible : gardés dans les options même disparus
  // (sinon la chip du sélecteur afficherait l'UUID brut).
  const visibleAssignedLinkIds = new Set(
    (staffLinks ?? []).filter((sl) => visibleStaffIds.has(sl.staff_id)).map((sl) => sl.link_id),
  )

  const paidByStaff = new Map<string, number>()
  for (const pmt of payments ?? []) {
    paidByStaff.set(pmt.staff_id, (paidByStaff.get(pmt.staff_id) ?? 0) + Number(pmt.amount_eur))
  }

  const rows: MktStaffRow[] = (staff ?? []).map((s) => {
    const linkIds = linksByStaff.get(s.id) ?? []
    const igAccountIds = igByStaff.get(s.id) ?? []
    const twAccountIds = twByStaff.get(s.id) ?? []
    const twConversions = linkIds.reduce((sum, id) => sum + (convByLink.get(id) ?? 0), 0)
    const igViews = igAccountIds.reduce((sum, id) => sum + (viewsByAcc.get(id) ?? 0), 0)
    const fixed = r2(Number(s.fixed_eur) * ratio)
    const twVariable = r2(twConversions * Number(s.rate_tw))
    const igVariable = r2((igViews / 1000) * Number(s.rate_ig))
    const bonus = r2(Number(s.bonus_eur) * ratio)
    const pctAmount = s.role === 'manager' ? r2((totalRevenue * Number(s.pct)) / 100) : 0
    return {
      id: s.id,
      name: s.name,
      role: s.role as 'va' | 'manager',
      color: s.color,
      fixedEur: Number(s.fixed_eur),
      rateTw: Number(s.rate_tw),
      rateIg: Number(s.rate_ig),
      bonusEur: Number(s.bonus_eur),
      pct: Number(s.pct),
      paymentMethod: s.payment_method,
      active: s.active,
      linkIds,
      igAccountIds,
      twAccountIds,
      pay: {
        fixed,
        twConversions,
        twVariable,
        igViews,
        igVariable,
        bonus,
        pctAmount,
        total: r2(fixed + twVariable + igVariable + bonus + pctAmount),
      },
      paid: r2(paidByStaff.get(s.id) ?? 0),
      remaining: r2(Math.max(0, fixed + twVariable + igVariable + bonus + pctAmount - (paidByStaff.get(s.id) ?? 0))),
    }
  })

  return {
    period: period.label,
    staff: rows,
    totalBudget: r2(rows.filter((s) => s.active).reduce((sum, s) => sum + s.pay.total, 0)),
    totalPaid: r2(rows.reduce((sum, s) => sum + s.paid, 0)),
    totalRemaining: r2(rows.filter((s) => s.active).reduce((sum, s) => sum + s.remaining, 0)),
    periodRevenue: r2(totalRevenue),
    monthStart,
    // Liens triés Twitter d'abord (prio Benoît : la prime subs vient des liens Twitter).
    // Anti-vol : un lien/compte déjà assigné à une fiche INVISIBLE (RLS owner_id → VA
    // d'un autre manager) n'est pas proposé — la fonction SQL 0028 refuse de toute façon.
    linkOptions: (links ?? [])
      .filter((l) => (l.active || visibleAssignedLinkIds.has(l.id)) && !takenLinkIds.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.active ? l.name : `${l.name} · disparu`,
        type: (l.type ?? 'other') as MktStaffData['linkOptions'][number]['type'],
      }))
      .sort((a, b) =>
        a.type === b.type
          ? a.name.localeCompare(b.name)
          : a.type === 'twitter'
            ? -1
            : b.type === 'twitter'
              ? 1
              : a.name.localeCompare(b.name),
      ),
    igOptions: igAccounts
      .filter((a) => !a.staff_id || visibleStaffIds.has(a.staff_id))
      .map((a) => ({ id: a.id, handle: a.handle }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
    twOptions: twAccounts
      .filter((a) => !a.staff_id || visibleStaffIds.has(a.staff_id))
      .map((a) => ({ id: a.id, handle: a.handle }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
  }
}
