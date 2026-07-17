import { Suspense } from 'react'
import { getScripts } from '@/features/scripts/services/get-scripts'
import { ScriptsTemplate } from '@/features/scripts/ScriptsTemplate'
import { ScriptsSkeleton } from '@/features/scripts/components/scripts-skeleton'
import { requireAccess } from '@/lib/auth'
import type { ScriptsData } from '@/features/scripts/types'

/**
 * Scripts de chat par modèle : les membres consultent/copient (RLS : leurs modèles
 * assignés uniquement), les admins éditent le funnel via `?modele=`.
 */
export default async function ScriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ modele?: string }>
}) {
  const [profile, { modele }] = await Promise.all([requireAccess('scripts'), searchParams])
  // Kickoff SANS await : le header (titre + sélecteur de modèle) est un widget client
  // (`ScriptsView`, useRouter) qui a besoin de `data.creators`/`data.creatorId` — pas de h1
  // « immédiat » séparable ici sans casser la mise en page (titre et sélecteur streament
  // ensemble, cf. repos/page.tsx + docs/guidelines-data-loading.md §3).
  const data = getScripts(modele)

  return (
    <Suspense fallback={<ScriptsSkeleton />}>
      <ScriptsContent data={data} isAdmin={profile.role === 'admin'} />
    </Suspense>
  )
}

async function ScriptsContent({
  data,
  isAdmin,
}: {
  data: Promise<ScriptsData>
  isAdmin: boolean
}) {
  return <ScriptsTemplate data={await data} isAdmin={isAdmin} />
}
