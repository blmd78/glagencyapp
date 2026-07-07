import { getInsights } from '@/features/insights/services/get-insights'
import { getRanking } from '@/features/insights/services/get-ranking'
import { InsightsTemplate } from '@/features/insights/InsightsTemplate'
import { requireAccess } from '@/lib/auth'

// La page montre TOUJOURS S-1 (dernière semaine complète générée), comparée à la
// semaine en cours dans les cartes — bascule automatique chaque lundi, pas de sélecteur.
export default async function InsightsPage() {
  const profile = await requireAccess('insights')
  const data = await getInsights(undefined, { restricted: profile.role !== 'admin' })
  const ranking = await getRanking(data.weekStart)
  return (
    <InsightsTemplate
      data={data}
      ranking={ranking}
      isAdmin={profile.role === 'admin'}
      currentUserId={profile.id}
    />
  )
}
