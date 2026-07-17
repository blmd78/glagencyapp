import { getMktLinks } from '@/features/marketing-liens/services/get-links'
import { MktLiensTemplate } from '@/features/marketing-liens/LiensTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

export default async function MktLiensPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-liens')
  const period = resolvePeriod(await searchParams)
  return <MktLiensTemplate data={await getMktLinks(period)} />
}
