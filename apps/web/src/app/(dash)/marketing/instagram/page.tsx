import { getMktSocial } from '@/features/marketing/services/get-social'
import { getLinkRows } from '@/features/marketing/services/get-links'
import { MktSocialTemplate } from '@/features/marketing/SocialTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

export default async function MktInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-instagram')
  const period = resolvePeriod(await searchParams)
  const [data, links] = await Promise.all([getMktSocial('instagram', period), getLinkRows(period)])
  return <MktSocialTemplate data={data} links={links.filter((l) => l.type === 'instagram')} />
}
