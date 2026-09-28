import { redirect } from 'next/navigation'
import { todayParis } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { AgencyTemplate } from '@/features/agency/AgencyTemplate'
import { parseListTab } from '@/features/agency/event-list'
import { parseMonth } from '@/features/agency/month-layout'
import { getAgencyEvents } from '@/features/agency/services/get-agency-events'

/**
 * Agence — ouverte à TOUT profil connecté (nav `everyone`, spec 2026-09-25) : la session suffit,
 * aucun `requireAccess`. Les contrôles d'écriture ne s'affichent qu'aux admins, et les Server
 * Actions refont la garde.
 */
export default async function AgencePage({ searchParams }: { searchParams: Promise<{ mois?: string; vue?: string }> }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  const { mois, vue } = await searchParams
  const today = todayParis()
  const events = await getAgencyEvents()
  return (
    <AgencyTemplate
      month={parseMonth(mois, today)}
      today={today}
      events={events}
      tab={parseListTab(vue)}
      canEdit={profile.role === 'admin'}
    />
  )
}
