import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { ChatterFile } from '@/features/tracking-coaching/components/chatter-file'
import { ChatterFileSkeleton } from '@/features/tracking-coaching/components/coaching-skeleton'
import { getChatterCoaching } from '@/features/tracking-coaching/services/get-chatter-coaching'
import type { ChatterCoaching } from '@/features/tracking-coaching/types'

/**
 * Fiche de suivi d'un chatteur — port de `/notes/:id`.
 *
 * `canWrite` : porteurs de la page et admins. Un chatteur qui consulte son propre suivi le voit
 * en lecture — on note quelqu'un, on ne se note pas soi-même.
 */
export default async function PresenceSuiviChatterPage({
  params,
}: {
  params: Promise<{ profileId: string }>
}) {
  const profile = await requireAccess('presence')
  const { profileId } = await params
  const canWrite = profile.role === 'admin' || profile.pages.includes('presence')

  const data = getChatterCoaching(profileId, canWrite)

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Suivi" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<ChatterFileSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Header({ data }: { data: Promise<ChatterCoaching | null> }) {
  const d = await data
  return (
    <CtxBar
      title={d?.name ?? 'Suivi'}
      crumb={
        <Link href="/chatter/presence/suivi">
          <b>← Suivi chatters</b>
        </Link>
      }
    />
  )
}

async function Body({ data }: { data: Promise<ChatterCoaching | null> }) {
  const d = await data
  if (!d) notFound()
  return <ChatterFile data={d} />
}
