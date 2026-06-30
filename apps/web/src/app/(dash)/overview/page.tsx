import { getOverview } from '@/features/overview/services/get-overview'
import { OverviewTemplate } from '@/features/overview/OverviewTemplate'

// La page récupère la donnée (via le service de la feature) et la passe au template.
export default async function OverviewPage() {
  const data = await getOverview()
  return <OverviewTemplate data={data} />
}
