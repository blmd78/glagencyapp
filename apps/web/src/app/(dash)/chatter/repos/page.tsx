import { Suspense } from 'react'
import { getRepos } from '@/features/repos/services/get-repos'
import { ReposTemplate } from '@/features/repos/ReposTemplate'
import { ReposSkeleton } from '@/features/repos/components/repos-skeleton'
import { requireAccess } from '@/lib/auth'
import { ENCADREMENT_COL_BY_ROLE } from '@/features/repos/types'
import type { ReposData, ReposSelf } from '@/features/repos/types'

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
  const data = getRepos(week ?? null)
  const isAdmin = profile.role === 'admin'
  // `canWrite` (admin ou manager/sous-manager) : case « envoyé Telegram » + ÉDITION des
  // cases des colonnes CHATTEURS (les managers posent/décalent les repos de leurs chatters,
  // miroir RLS can_write_page). Colonnes encadrement (Managers/Sous-managers/Policiers) et compo des
  // colonnes : admin-only (cf. PlanningGrid). Un chatteur reste en lecture seule totale.
  const canWrite = isAdmin || profile.manager
  // AUTO-ASSIGNATION dans les colonnes d'encadrement (0102) : chacun pose son propre repos dans
  // la colonne de son rôle. `self` sert à la fois à ouvrir la case et à borner ses options — le
  // serveur refuse de toute façon tout id qui n'est pas le sien.
  const self = { id: profile.id, encadrementCol: ENCADREMENT_COL_BY_ROLE[profile.baseRole] ?? null }

  return (
    <Suspense fallback={<ReposSkeleton />}>
      <ReposContent data={data} isAdmin={isAdmin} canWrite={canWrite} self={self} />
    </Suspense>
  )
}

async function ReposContent({
  data,
  isAdmin,
  canWrite,
  self,
}: {
  data: Promise<ReposData>
  isAdmin: boolean
  canWrite: boolean
  self: ReposSelf
}) {
  return <ReposTemplate data={await data} isAdmin={isAdmin} canWrite={canWrite} self={self} />
}
