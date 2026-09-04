import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { MypulsChatterActivityTemplate } from '@/features/mypuls-chatter-activity/MypulsChatterActivityTemplate'
import { getChatterActivity } from '@/features/mypuls-chatter-activity/services/get-chatter-activity'
import type { ChatterActivityData } from '@/features/mypuls-chatter-activity/types'

/**
 * Fiche d'activité d'un chatteur, alimentée par MyPuls (`mypuls_shift_*`, 0138/0140).
 *
 * Le détail minute par minute est lu EN DIRECT chez MyPuls à l'ouverture (~186 ko, une à
 * quelques secondes de requêtes Elasticsearch chez eux) : d'où le `maxDuration` relevé et le
 * streaming dans un `<Suspense>`. Les agrégats du mois, eux, viennent de notre base et
 * s'affichent même si MyPuls ne répond pas.
 */
export const maxDuration = 300

export default async function PresenceChatterPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await requireAccess('presence')
  const { profileId } = await params
  const { date } = await searchParams

  // PÉRIMÈTRE MODÈLES en lecture. `notFound()` plutôt qu'un 403 : ne pas révéler qu'un profil
  // existe à qui n'a pas à le voir. `baseRole` et non `role`, sinon le périmètre est inerte.
  if (!(await isChatterInScope(await getCreatorScope(profile.id, profile.baseRole), profileId))) {
    notFound()
  }

  const data = getChatterActivity({ profileId, day: date })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/chatter/presence"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Relevé d’équipe
        </Link>
        <Suspense fallback={<h1 className="text-2xl font-semibold tracking-tight">Chatteur</h1>}>
          <Title data={data} />
        </Suspense>
      </div>
      <Suspense
        fallback={
          <SectionFallback>
            <KpiSkeleton />
            <TableSkeleton rows={6} />
          </SectionFallback>
        }
      >
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Title({ data }: { data: Promise<ChatterActivityData> }) {
  const d = await data
  return <h1 className="text-2xl font-semibold tracking-tight">{d.memberName}</h1>
}

async function Body({ data }: { data: Promise<ChatterActivityData> }) {
  return <MypulsChatterActivityTemplate data={await data} />
}
