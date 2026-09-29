import { Suspense } from 'react'
import { getMktSocial } from '@/features/marketing-social/services/get-social'
import { MktSocialTemplate } from '@/features/marketing-social/SocialTemplate'
import { MktSocialSkeleton } from '@/features/marketing-social/components/social-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktSocialData } from '@/features/marketing-social/types'

export default async function MktTwitterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('mkt-twitter')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + table streament dans
  // leur boundary. Pas d'onglet Liens ici (demande Benoit 2026-09-29 : « on veut juste du
  // Twitter / X ») — les liens X restent sur l'écran Liens de tracking.
  const data = getMktSocial('twitter', period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Twitter / X</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <MktSocialSkeleton />
          </SectionFallback>
        }
      >
        <MktTwitterContent data={data} canAddAccounts={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function MktTwitterContent({
  data,
  canAddAccounts,
}: {
  data: Promise<MktSocialData>
  canAddAccounts: boolean
}) {
  return <MktSocialTemplate data={await data} canAddAccounts={canAddAccounts} />
}
