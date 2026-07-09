import { getSpenders } from '@/features/spenders/services/get-spenders'
import { SpendersTemplate } from '@/features/spenders/SpendersTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

// Spenders (CRM closing) — fans à CA ≥ seuil, scrapés depuis MyPuls (/chat/init + /team/money).
// L'état (CA vie, dernier message) est la photo du dernier scrape ; le CA période suit le datepicker.
export default async function SpendersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('crm-spenders')
  const period = resolvePeriod(await searchParams)
  const data = await getSpenders(period)
  return <SpendersTemplate data={data} />
}
