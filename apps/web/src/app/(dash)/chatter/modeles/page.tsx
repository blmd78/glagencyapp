import { getModels } from '@/features/models/services/get-models'
import { ModelsTemplate } from '@/features/models/ModelsTemplate'
import { resolvePeriod } from '@/lib/period'

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const period = resolvePeriod(await searchParams)
  const data = await getModels(period)
  return <ModelsTemplate data={data} />
}
