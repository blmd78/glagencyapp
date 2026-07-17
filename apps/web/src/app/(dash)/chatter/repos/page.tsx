import { Suspense } from 'react'
import { getRepos } from '@/features/repos/services/get-repos'
import { ReposTemplate } from '@/features/repos/ReposTemplate'
import { ReposSkeleton } from '@/features/repos/components/repos-skeleton'
import { requireAccess } from '@/lib/auth'
import type { ReposData } from '@/features/repos/types'

// Planning des jours de repos — page accordable aux sous-managers (droit `repos`).
export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const profile = await requireAccess('repos')
  const { week } = await searchParams
  // Kickoff SANS await : le header (titre + sélecteur de semaine) est un widget client
  // (`ReposView`, useRouter/useSearchParams) qui a besoin de data.weeks/data.weekStart — pas
  // de h1 « immédiat » séparable ici sans casser la mise en page (titre et sélecteur sur la
  // même ligne, cf. bilan/page.tsx + docs/guidelines-data-loading.md §3). Tout le composite
  // streame dans un seul boundary.
  const data = getRepos(week ?? null, profile)
  const isAdmin = profile.role === 'admin'

  return (
    <Suspense fallback={<ReposSkeleton />}>
      <ReposContent data={data} isAdmin={isAdmin} />
    </Suspense>
  )
}

async function ReposContent({
  data,
  isAdmin,
}: {
  data: Promise<ReposData>
  isAdmin: boolean
}) {
  return <ReposTemplate data={await data} isAdmin={isAdmin} />
}
