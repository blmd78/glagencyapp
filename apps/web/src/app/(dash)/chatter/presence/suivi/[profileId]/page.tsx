import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasWriteAccess, requireAccess } from '@/lib/auth'
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
  /**
   * `?bilan=<taskId>` : on arrive d'une tâche « 1:1 » de la To-Do, le formulaire s'ouvre armé.
   * `?week=` : la semaine de la To-Do d'où l'on vient, pour y REVENIR une fois le 1:1 clos — sans
   * elle, le retour tombait sur la semaine du jour civil, vide après minuit le dimanche.
   */
  searchParams: Promise<{ bilan?: string; week?: string }>
}) {
  const profile = await requireAccess('presence')
  const [{ profileId }, { bilan, week }] = await Promise.all([params, searchParams])
  // `hasWriteAccess` : le test précédent était TOUJOURS VRAI — il refaisait le contrôle que
  // `requireAccess('presence')` vient de passer deux lignes plus haut. Celui-ci exclut le chatteur,
  // qui peut porter la page en lecture (miroir de `can_write_page()`, 0060).
  const canWrite = hasWriteAccess(profile, 'presence')

  // AUCUN PÉRIMÈTRE MODÈLES ici — décision de Benoit du 2026-09-05, miroir de la liste
  // (`get-coaching-list.ts`, où le raisonnement est écrit). Le tracker d'origine rendait un 403
  // sur la fiche d'un chatteur hors périmètre (routes.js.txt:93-95 et :138-141) ; ce test rendait
  // surtout inaccessibles les chatteurs de ses propres modèles quand le rattachement
  // `profile_creators` manque. La fiche suit donc la liste : qui porte la page ouvre n'importe
  // quelle fiche de chatteur.
  const data = getChatterCoaching(profileId, canWrite)

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Suivi" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<ChatterFileSkeleton />}>
        <Body data={data} bilanTaskId={bilan ?? null} backWeek={week ?? null} viewerId={profile.id} />
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
  backWeek,
  viewerId,
}: {
  data: Promise<ChatterCoaching | null>
  bilanTaskId: string | null
  backWeek: string | null
  viewerId: string
}) {
  const d = await data
  if (!d) notFound()
  return <ChatterFile data={d} bilanTaskId={bilanTaskId} backWeek={backWeek} viewerId={viewerId} />
}
