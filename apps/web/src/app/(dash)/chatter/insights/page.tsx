import { InsightsTemplate } from '@/features/insights/InsightsTemplate'
import { requireAccess } from '@/lib/auth'

export default async function InsightsPage() {
  await requireAccess('insights')
  // TODO: récupérer les données via @/features/insights/services + @/lib/supabase/server
  return <InsightsTemplate />
}
