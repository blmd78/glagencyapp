import { Suspense } from 'react'
import Link from 'next/link'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { ChatterTemplate } from '@/features/tracking-chatter/ChatterTemplate'
import { ChatterSkeleton } from '@/features/tracking-chatter/components/chatter-skeleton'
import { getChatterPeriods } from '@/features/tracking-chatter/services/get-chatter-periods'
import type { ChatterData } from '@/features/tracking-chatter/types'

/**
 * Fiche chatteur — port de `/c/:id` du tracker GLA.
 *
 * Le titre est le NOM du chatteur, qui n'est connu qu'après la lecture : la barre de contexte
 * attend donc la donnée, contrairement au board dont le titre est fixe. Le fil d'Ariane ramène au
 * board, comme chez eux.
 */
export default async function PresenceChatterPage({
  params,
}: {
  params: Promise<{ profileId: string }>
}) {
  await requireAccess('presence')
  const { profileId } = await params

  const data = getChatterPeriods(profileId)

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Chatteur" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<ChatterSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Header({ data }: { data: Promise<ChatterData> }) {
  const d = await data
  return (
    <CtxBar
      title={d.name}
      crumb={
        <Link href="/chatter/presence">
          <b>← Board</b>
        </Link>
      }
    />
  )
}

async function Body({ data }: { data: Promise<ChatterData> }) {
  return <ChatterTemplate data={await data} />
}
