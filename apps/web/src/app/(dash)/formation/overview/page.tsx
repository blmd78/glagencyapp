import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireAccess } from '@/lib/auth'
import { OverviewTemplate } from '@/features/training-overview/OverviewTemplate'
import { OverviewSkeleton } from '@/features/training-overview/components/overview-skeleton'
import { getChatter } from '@/features/training-overview/services/get-chatter'
import { getOverview } from '@/features/training-overview/services/get-overview'
import type { ChatterDetail, OverviewData } from '@/features/training-overview/types'

/**
 * Budget de durée des Server Actions de cette route : le re-score admin (`rescoreSession`) d'un
 * boss lance 5 appels Sonnet (parallèles) — le défaut de 15 s ne suffit pas. À confirmer avec le
 * plan Vercel (300 s = plafond des fonctions Node sur les plans payants).
 */
export const maxDuration = 300

/**
 * Overview encadrant (droit Suivi) : roster de la promo, fiche d'un chatter (`?chatter=`),
 * signalements, et coût IA pour un admin.
 *
 * Le SÉLECTEUR de chatter n'est montré qu'à l'encadrement qui pilote (admin / manager /
 * sous-manager) ; un policier ou un lecteur à qui on donne Suivi voit le roster sans sélecteur
 * (`Profile.role` ne distingue que admin/chatteur — le rôle exact est `baseRole`).
 */
export default async function FormationOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ chatter?: string }>
}) {
  const [profile, { chatter }] = await Promise.all([requireAccess('frm-suivi'), searchParams])
  const isAdmin = profile.role === 'admin'
  const showPicker = isAdmin || profile.baseRole === 'manager' || profile.baseRole === 'sous-manager'
  // `?chatter=` validé AVANT la requête : un uuid mal formé ferait échouer Postgres (22P02) et
  // tomberait sur la boundary d'erreur au lieu d'être ignoré.
  const parsedId = z.uuid().safeParse(chatter)
  const selectedId = parsedId.success ? parsedId.data : null

  // Kickoff SANS await (pattern streaming) : les deux lectures partent en parallèle pendant que
  // le shell (h1) s'affiche ; la fiche ne dépend pas du roster (le nom est repris côté Template).
  const overview = getOverview(isAdmin)
  const detail = selectedId ? getChatter(selectedId) : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      {/* Le `<h1>` est déjà rendu ci-dessus (il ne dépend d'aucune donnée) → squelette sans titre. */}
      <Suspense fallback={<OverviewSkeleton withTitle={false} />}>
        <OverviewContent overview={overview} detail={detail} selectedId={selectedId} showPicker={showPicker} isAdmin={isAdmin} />
      </Suspense>
    </div>
  )
}

async function OverviewContent({
  overview,
  detail,
  selectedId,
  showPicker,
  isAdmin,
}: {
  overview: Promise<OverviewData>
  detail: Promise<ChatterDetail> | null
  selectedId: string | null
  showPicker: boolean
  isAdmin: boolean
}) {
  const [data, chatter] = await Promise.all([overview, detail])
  // Uuid valide mais hors roster (chatter parti, droit Entraînement retiré, id d'un autre profil) :
  // 404 franc plutôt qu'une fiche vide titrée « — ». Ici et pas dans la page : c'est le roster,
  // résolu seulement maintenant, qui dit si l'id existe.
  if (selectedId && !data.roster.some((r) => r.profileId === selectedId)) notFound()
  return (
    <OverviewTemplate
      overview={data}
      chatter={chatter ?? null}
      selectedId={selectedId}
      showPicker={showPicker}
      isAdmin={isAdmin}
    />
  )
}
