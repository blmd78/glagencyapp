import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
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
  const profile = await requireAccess('presence')
  const { profileId } = await params
  // PÉRIMÈTRE MODÈLES en LECTURE — le tracker d'origine rendait un 403 sur la fiche d'un chatteur
  // hors périmètre (`'forbidden'` renvoyé par le builder, routes.js.txt:93-95 et :138-141).
  // `notFound()` plutôt qu'un 403 : ne pas révéler qu'un profil existe à qui n'a pas à le voir.
  if (!(await isChatterInScope(await getCreatorScope(profile.id, profile.baseRole), profileId))) {
    notFound()
  }

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
