import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { requireAccess } from '@/lib/auth'

// Spenders (CRM closing) — fans à CA ≥ seuil, scrapés depuis MyPuls (/chat/init + /team/money).
// Page « ever » : pas de datepicker, on agrège tout ce qu'on scrape (CA total = total vie MyPuls,
// évolution = nos transactions par jour).
export default async function SpendersPage() {
  await requireAccess('crm-spenders')
  const data = await getSpenders()
  return <SpendersTemplate data={data} />
}
