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
  await requireAccess('organisation')
  // Kickoff SANS await : le h1 s'affiche immédiatement, l'orga streame dans son boundary.
  const data = getOrganisation()

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
        <OrganisationContent data={data} />
      </Suspense>
    </div>
  )
}

async function OrganisationContent({ data }: { data: Promise<OrganisationData> }) {
  return <OrganisationTemplate data={await data} />
}
