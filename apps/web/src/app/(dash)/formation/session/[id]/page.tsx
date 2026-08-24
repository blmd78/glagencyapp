import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { z } from 'zod'
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
  // `[id]` validé AVANT la requête : un uuid mal formé (lien tronqué, vieux favori) ferait échouer
  // Postgres (22P02) et tomberait sur la boundary d'erreur + Sentry, au lieu d'un 404 franc.
  // Même patron que overview/page.tsx et recrutement/page.tsx.
  if (!z.uuid().safeParse(id).success) notFound()
  // Pas de `await` ici : la requête part pendant que le squelette s'affiche (streaming).
  const data = getSession(id)
  return (
    // `.gla` = thème repris de Good Luck Agency (cf. `formation-theme.css`) : c'est l'écran où le
    // chatteur passe le plus de temps, il doit être le plus fidèle.
    <div className="gla">
      <Suspense fallback={<SessionSkeleton />}>
        <SessionContent data={data} viewerId={profile.id} />
      </Suspense>
    </div>
  )
}

async function SessionContent({ data, viewerId }: { data: Promise<SessionData | null>; viewerId: string }) {
  const s = await data
  if (!s) notFound()
  return <SessionTemplate data={s} viewerIsOwner={s.profileId === viewerId} />
}
