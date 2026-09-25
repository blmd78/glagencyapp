import { redirect } from 'next/navigation'
import { todayParis } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { AgencyTemplate } from '@/features/agency/AgencyTemplate'
import { parseMonth } from '@/features/agency/month-layout'
import { getAgencyMonth } from '@/features/agency/services/get-agency-month'

/**
 * Agence — ouverte à TOUT profil connecté (nav `everyone`, spec 2026-09-25) : la session suffit,
 * aucun `requireAccess`. Les contrôles d'écriture ne s'affichent qu'aux admins, et les Server
 * Actions refont la garde.
 */
export default async function AgencePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  const { mois } = await searchParams
  const today = todayParis()
  const month = parseMonth(mois, today)
  const events = await getAgencyMonth(month)
  return <AgencyTemplate month={month} today={today} events={events} canEdit={profile.role === 'admin'} />
}
