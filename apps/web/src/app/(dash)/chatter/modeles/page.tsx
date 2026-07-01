import { getModels } from '@/features/models/services/get-models'
import { ModelsTemplate } from '@/features/models/ModelsTemplate'

export default async function ModelsPage() {
  const data = await getModels()
  return <ModelsTemplate data={data} />
}
