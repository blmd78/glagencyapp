import { getInsights } from '@/features/insights/services/get-insights'
import { InsightsTemplate } from '@/features/insights/InsightsTemplate'
import { requireAccess } from '@/lib/auth'

// La page montre TOUJOURS S-1 (dernière semaine complète générée), comparée à la
// semaine en cours dans les cartes — bascule automatique chaque lundi, pas de sélecteur.
export default async function InsightsPage() {
  const profile = await requireAccess('insights')
  const data = await getInsights()
  return <InsightsTemplate data={data} isAdmin={profile.role === 'admin'} currentUserId={profile.id} />
}
