import { getQuotas } from '@/features/quotas/services/get-quotas'
import { requireAdmin } from '@/lib/auth'
import { QuotasTemplate } from '@/features/quotas/QuotasTemplate'

// Page de config (seuils journaliers + exclusions) — pas de filtre période.
export default async function QuotasPage() {
  await requireAdmin()
  const data = await getQuotas()
  return <QuotasTemplate data={data} />
}
