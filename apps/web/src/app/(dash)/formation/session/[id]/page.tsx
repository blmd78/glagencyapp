import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { SessionTemplate } from '@/features/training-session/SessionTemplate'
import { SessionSkeleton } from '@/features/training-session/components/session-skeleton'
import type { SessionData } from '@/features/training-session/types'
import { getSession } from '@/features/training-session/services/get-session'
import { requireAccess } from '@/lib/auth'

/**
 * Budget de durée des Server Actions de cette route : la notation d'un boss lance 5 appels Sonnet
 * (parallèles) — le défaut de 15 s ne suffit pas. À confirmer avec le plan Vercel (300 s = plafond
 * des fonctions Node sur les plans payants).
 */
export const maxDuration = 300

/** Une session d'entraînement — jouer (propriétaire) ou relire (encadrant Suivi, admin). 404 si inconnue / hors RLS. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, { id }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), params])
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getSession(id)
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <SessionContent data={data} viewerId={profile.id} />
    </Suspense>
  )
}

async function SessionContent({ data, viewerId }: { data: Promise<SessionData | null>; viewerId: string }) {
  const s = await data
  if (!s) notFound()
  return <SessionTemplate data={s} viewerIsOwner={s.profileId === viewerId} />
}
