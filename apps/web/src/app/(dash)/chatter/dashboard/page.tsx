import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getReports, getReportMembers } from '@/features/reports/services/get-reports'
import { ReportsTemplate } from '@/features/reports/ReportsTemplate'
import { ReportsSkeleton } from '@/features/reports/components/reports-skeleton'
import type { ReportMember } from '@/features/reports/types'

/**
 * Dashboard = comptes rendus journaliers. Chacun rédige LE SIEN ; consultation hiérarchique
 * via `?membre=` (manager → ses rattachés directs ; admin/superadmin → tout). RLS = verrou réel.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string }>
}) {
  const profile = await requireAccess('dashboard')
  const { membre } = await searchParams
  // Kickoff SANS await : le h1 s'affiche immédiatement, le composite streame dans le boundary.
  const membersPromise = getReportMembers()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<ReportsSkeleton />}>
        <DashboardContent
          profileId={profile.id}
          selfName={profile.displayName ?? profile.email ?? 'Moi'}
          superadmin={profile.superadmin}
          membre={membre}
          membersPromise={membersPromise}
        />
      </Suspense>
    </div>
  )
}

async function DashboardContent({
  profileId,
  selfName,
  superadmin,
  membre,
  membersPromise,
}: {
  profileId: string
  selfName: string
  superadmin: boolean
  membre?: string
  membersPromise: Promise<ReportMember[]>
}) {
  // Personnes consultables hors soi (la RLS de `profiles` a déjà scopé par rôle). S'il y en a,
  // on préfixe SOI (« (moi) ») pour le sélecteur ; sinon pas de sélecteur.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const members: ReportMember[] = others.length
    ? [{ id: profileId, name: `${selfName} (moi)`, role: '' }, ...others]
    : []
  const target = membre && members.some((m) => m.id === membre) ? membre : profileId
  const isSelf = target === profileId
  // On ne rédige que LE SIEN ; le superadmin ne rédige pas (v1).
  const canWrite = isSelf && !superadmin
  const targetName = isSelf ? selfName : (others.find((m) => m.id === target)?.name ?? '—')
  const reports = await getReports(target)

  return (
    <ReportsTemplate
      reports={reports}
      targetName={targetName}
      members={members}
      target={target}
      canWrite={canWrite}
      isSelf={isSelf}
    />
  )
}
