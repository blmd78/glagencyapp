import { Suspense } from 'react'
import { getOrganisation } from '@/features/organisation/services/get-organisation'
import { OrganisationTemplate } from '@/features/organisation/OrganisationTemplate'
import { OrganisationSkeleton } from '@/features/organisation/components/organisation-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { requireAccess } from '@/lib/auth'
import type { OrganisationData } from '@/features/organisation/types'

// Organisation de l'agence (catégorie Équipe) — droit `organisation` cochable dans Membres.
// Vue DÉRIVÉE de Membres/Chatters (aucune saisie ici) : manager → sous-managers → modèles →
// chatters par shift, miroir de la Google Sheet d'orga.
export default async function OrganisationPage() {
  const profile = await requireAccess('organisation')
  // Kickoff SANS await : le h1 s'affiche immédiatement, l'orga streame dans son boundary.
  const data = getOrganisation()
  // Édition (cases + statut) : ADMIN uniquement (v1) — réassigner un modèle change le
  // périmètre RLS d'un chatteur, même pouvoir que le dialog Membres admin.
  const isAdmin = profile.role === 'admin'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Organisation</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <OrganisationSkeleton />
          </SectionFallback>
        }
      >
        <OrganisationContent data={data} isAdmin={isAdmin} />
      </Suspense>
    </div>
  )
}

async function OrganisationContent({ data, isAdmin }: { data: Promise<OrganisationData>; isAdmin: boolean }) {
  return <OrganisationTemplate data={await data} isAdmin={isAdmin} />
}
