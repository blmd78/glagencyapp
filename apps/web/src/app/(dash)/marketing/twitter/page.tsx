import { Suspense } from 'react'
import { getMktSocial } from '@/features/marketing-social/services/get-social'
import { getLinkRows } from '@/lib/services/get-mkt-links'
import { MktSocialTemplate } from '@/features/marketing-social/SocialTemplate'
import { MktSocialSkeleton } from '@/features/marketing-social/components/social-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { Skeleton } from '@/components/ui/skeleton'
import type { MktSocialData } from '@/features/marketing-social/types'
import type { MktLinkRow } from '@/lib/types/marketing'

export default async function MktTwitterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-twitter')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (requêtes indépendantes) : le shell (h1) s'affiche immédiatement,
  // KPIs + table streament dans leur boundary une fois les deux résolues.
  const data = getMktSocial('twitter', period)
  const links = getLinkRows(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Twitter / X</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <MktSocialSkeleton />
          </div>
        }
      >
        <MktTwitterContent data={data} links={links} />
      </Suspense>
    </div>
  )
}

async function MktTwitterContent({
  data,
  links,
}: {
  data: Promise<MktSocialData>
  links: Promise<MktLinkRow[]>
}) {
  const [d, l] = await Promise.all([data, links])
  return <MktSocialTemplate data={d} links={l.filter((x) => x.type === 'twitter')} />
}
