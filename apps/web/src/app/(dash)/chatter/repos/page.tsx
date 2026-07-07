import { getRepos } from '@/features/repos/services/get-repos'
import { ReposTemplate } from '@/features/repos/ReposTemplate'
import { requireAccess } from '@/lib/auth'

// Planning des jours de repos — page accordable aux sous-managers (droit `repos`).
export default async function ReposPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const profile = await requireAccess('repos')
  const { week } = await searchParams
  const data = await getRepos(week ?? null)
  return <ReposTemplate data={data} isAdmin={profile.role === 'admin'} />
}
