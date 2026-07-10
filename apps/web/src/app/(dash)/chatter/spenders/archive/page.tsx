import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { requireAccess } from '@/lib/auth'

// Vue « archive » de la sous-catégorie Spenders (CRM closing). Toutes partagent le droit crm-spenders.
export default async function SpendersViewarchivePage() {
  await requireAccess('crm-spenders')
  const data = await getSpenders()
  return <SpendersTemplate data={data} view="archive" />
}
