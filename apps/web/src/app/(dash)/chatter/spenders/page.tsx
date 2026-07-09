import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { requireAccess } from '@/lib/auth'

// Spenders (CRM closing) — fans à CA ≥ seuil, scrapés depuis MyPuls (/chat/init + /team/money).
export default async function SpendersPage() {
  await requireAccess('crm-spenders')
  const data = await getSpenders()
  return <SpendersTemplate data={data} />
}
