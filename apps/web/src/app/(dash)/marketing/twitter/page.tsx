import { getMktSocial } from '@/features/marketing-social/services/get-social'
import { getLinkRows } from '@/lib/services/get-mkt-links'
import { MktSocialTemplate } from '@/features/marketing-social/SocialTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

export default async function MktTwitterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-twitter')
  const period = resolvePeriod(await searchParams)
  const [data, links] = await Promise.all([getMktSocial('twitter', period), getLinkRows(period)])
  return <MktSocialTemplate data={data} links={links.filter((l) => l.type === 'twitter')} />
}
