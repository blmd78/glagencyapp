import { getModels } from '@/features/models/services/get-models'
import { requireAccess } from '@/lib/auth'
import { ModelsTemplate } from '@/features/models/ModelsTemplate'
import { resolvePeriod } from '@/lib/period'

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('modeles')
  const period = resolvePeriod(await searchParams)
  const data = await getModels(period)
  return <ModelsTemplate data={data} />
}
