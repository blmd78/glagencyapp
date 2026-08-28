import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasWriteAccess, requireAccess } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
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
  searchParams,
}: {
  params: Promise<{ profileId: string }>
  /** `?bilan=<taskId>` : on arrive d'une tâche « 1:1 » de la To-Do, le formulaire s'ouvre armé. */
  searchParams: Promise<{ bilan?: string }>
}) {
  const profile = await requireAccess('presence')
  const [{ profileId }, { bilan }] = await Promise.all([params, searchParams])
  // `hasWriteAccess` : le test précédent était TOUJOURS VRAI — il refaisait le contrôle que
  // `requireAccess('presence')` vient de passer deux lignes plus haut. Celui-ci exclut le chatteur,
  // qui peut porter la page en lecture (miroir de `can_write_page()`, 0060).
  const canWrite = hasWriteAccess(profile, 'presence')

  // PÉRIMÈTRE MODÈLES en LECTURE — le tracker d'origine rendait un 403 sur la fiche d'un chatteur
  // hors périmètre (`'forbidden'` renvoyé par le builder, routes.js.txt:93-95 et :138-141).
  // `notFound()` plutôt qu'un 403 : ne pas révéler qu'un profil existe à qui n'a pas à le voir.
  if (!(await isChatterInScope(await getCreatorScope(profile.id, profile.baseRole), profileId))) {
    notFound()
  }

  const data = getChatterCoaching(profileId, canWrite)

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Suivi" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<ChatterFileSkeleton />}>
        <Body data={data} bilanTaskId={bilan ?? null} viewerId={profile.id} />
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

async function Body({
  data,
  bilanTaskId,
  viewerId,
}: {
  data: Promise<ChatterCoaching | null>
  bilanTaskId: string | null
  viewerId: string
}) {
  const d = await data
  if (!d) notFound()
  return <ChatterFile data={d} bilanTaskId={bilanTaskId} viewerId={viewerId} />
}
