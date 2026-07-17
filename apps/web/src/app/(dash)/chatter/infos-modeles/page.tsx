import { Suspense } from 'react'
import { getInfosModeles } from '@/features/infos-modeles/services/get-infos-modeles'
import { InfosModelesTemplate } from '@/features/infos-modeles/InfosModelesTemplate'
import { InfosModelesSkeleton } from '@/features/infos-modeles/components/infos-modeles-skeleton'
import { requireAccess } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { InfosModelesData } from '@/features/infos-modeles/types'

// Infos modèles (groupe Accès, porté de gla-workflow). Droit `infos-modeles` cochable
// dans Membres ; la RLS cloisonne un membre à SES modèles assignés (admin = tous).
export default async function InfosModelesPage() {
  const profile = await requireAccess('infos-modeles')
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, la liste streame dans
  // son boundary dès que la lecture répond.
  const data = getInfosModeles()
  const isAdmin = profile.role === 'admin'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Infos modèles</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <InfosModelesSkeleton />
          </SectionFallback>
        }
      >
        <InfosModelesContent data={data} isAdmin={isAdmin} />
      </Suspense>
    </div>
  )
}

async function InfosModelesContent({
  data,
  isAdmin,
}: {
  data: Promise<InfosModelesData>
  isAdmin: boolean
}) {
  return <InfosModelesTemplate data={await data} isAdmin={isAdmin} />
}
