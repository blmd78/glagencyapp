import { getScripts } from '@/features/scripts/services/get-scripts'
import { ScriptsTemplate } from '@/features/scripts/ScriptsTemplate'
import { requireAccess } from '@/lib/auth'

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
  const data = await getScripts(modele)
  return <ScriptsTemplate data={data} isAdmin={profile.role === 'admin'} />
}
