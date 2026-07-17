import { Suspense } from 'react'
import { getMktSocial } from '@/features/marketing-social/services/get-social'
import { getLinkRows } from '@/lib/services/get-mkt-links'
import { MktSocialTemplate } from '@/features/marketing-social/SocialTemplate'
import { MktSocialSkeleton } from '@/features/marketing-social/components/social-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktSocialData } from '@/features/marketing-social/types'
import type { MktLinkRow } from '@/lib/types/marketing'

// Canal Telegram — même DA que Instagram/Twitter : KPIs, onglets Canaux/Liens.
// Les canaux s'ajoutent via « + Compte » (saisie manuelle des membres/vues en
// attendant l'automate t.me / bot officiel).
export default async function MktTelegramPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-telegram')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (requêtes indépendantes) : le shell (h1) s'affiche immédiatement,
  // KPIs + table streament dans leur boundary une fois les deux résolues.
  const data = getMktSocial('telegram', period)
  const links = getLinkRows(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Telegram</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <MktSocialSkeleton />
          </SectionFallback>
        }
      >
        <MktTelegramContent data={data} links={links} />
      </Suspense>
    </div>
  )
}

async function MktTelegramContent({
  data,
  links,
}: {
  data: Promise<MktSocialData>
  links: Promise<MktLinkRow[]>
}) {
  const [d, l] = await Promise.all([data, links])
  return <MktSocialTemplate data={d} links={l.filter((x) => x.type === 'telegram')} />
}
