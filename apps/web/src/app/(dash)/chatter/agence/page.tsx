import { redirect } from 'next/navigation'
import { todayParis } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { AgencyTemplate } from '@/features/agency/AgencyTemplate'
import { parseListTab } from '@/features/agency/event-list'
import { parseMonth } from '@/features/agency/month-layout'
import { getAgencyEvents, getAgencyLegend, getAgencyModels } from '@/features/agency/services/get-agency-events'

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
  const canEdit = profile.role === 'admin'
  // Modèles du sélecteur de la fenêtre d'événement : lus pour l'admin seul, qui seul l'ouvre.
  const [events, legend, models] = await Promise.all([getAgencyEvents(), getAgencyLegend(), canEdit ? getAgencyModels() : Promise.resolve([])])
  return (
    <AgencyTemplate
      month={parseMonth(mois, today)}
      today={today}
      events={events}
      legend={legend}
      models={models}
      tab={parseListTab(vue)}
      canEdit={canEdit}
    />
  )
}
