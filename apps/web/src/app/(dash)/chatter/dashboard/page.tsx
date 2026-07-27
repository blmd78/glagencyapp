import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { applyFilter, resolveFilter, selfLabel } from '@/lib/roster'
import {
  getReportDays,
  getReportMembers,
  getReports,
  isPiled,
} from '@/features/reports/services/get-reports'
import { ReportsTemplate } from '@/features/reports/ReportsTemplate'
import { ReportsSkeleton } from '@/features/reports/components/reports-skeleton'
import type { ReportEntry, ReportMember } from '@/features/reports/types'

/**
 * Dashboard = comptes rendus journaliers. Chacun rédige LE SIEN ; la consultation hiérarchique
 * (manager → ses rattachés directs ; admin/superadmin → tout) empile les noms de
 * l'ENCADREMENT en accordéons, un par ligne — les chatteurs, trop nombreux pour une pile,
 * restent joignables par le sélecteur. Celui-ci est un FILTRE optionnel :
 * absent = tout le monde empilé, présent = cette personne seule, affichée à plat. La liste ne
 * contient que l'encadrement (chatteurs écartés, cf. `getReportMembers`). RLS = verrou réel.
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
  // Personnes consultables hors soi (la RLS de `profiles` a déjà scopé par hiérarchie). SOI en
  // tête ; le « (moi) » ne sert qu'à se distinguer des autres : inutile quand on est seul.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const roster: ReportMember[] = [
    { id: profileId, name: selfLabel(selfName, others), role: '' },
    ...others,
  ]

  // DEUX périmètres distincts, et c'est volontaire :
  // — le SÉLECTEUR liste `roster`, tout le monde, chatteurs compris : on doit pouvoir aller
  //   lire le compte rendu d'un chatteur en le choisissant ;
  // — la PILE d'accordéons ne montre que l'encadrement (`isPiled`), sinon la page déroulerait
  //   cent noms de chatteurs.
  // `?membre=` validé sur le roster COMPLET : filtrer sur un chatteur reste donc possible, et
  // l'affiche à plat.
  const filterId = resolveFilter(roster, membre)
  const shown = filterId
    ? applyFilter(roster, filterId)
    : roster.filter((m) => isPiled(m, profileId))

  // Une seule personne à afficher → rendu à plat : on charge SON contenu tout de suite, il n'y
  // a pas d'accordéon à déplier. Sinon on ne charge que les JOURS d'écriture (repère de la
  // ligne repliée) ; le texte part à l'ouverture (`loadReports`). `getReportDays` pré-remplit
  // une entrée par id — le `?? []` n'est là que pour TypeScript.
  const single = shown.length === 1
  const [reports, days] = await Promise.all([
    single ? getReports(shown[0].id) : Promise.resolve([]),
    single ? Promise.resolve(new Map<string, string[]>()) : getReportDays(shown.map((m) => m.id)),
  ])
  const entries: ReportEntry[] = shown.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    days: days.get(m.id) ?? [],
    // On ne rédige que LE SIEN ; le superadmin ne rédige pas (v1).
    canWrite: m.id === profileId && !superadmin,
  }))

  return (
    <ReportsTemplate
      entries={entries}
      reports={reports}
      selectableMembers={roster}
      filterId={filterId}
    />
  )
}
