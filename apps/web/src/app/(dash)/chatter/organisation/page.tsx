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
  // Deux niveaux, comme le planning repos (cf. features/organisation/actions.ts) :
  //  • canWrite (admin OU encadrant porteur de la page) = composer les CASES — poser un shift,
  //    assigner un chatteur à un modèle ; miroir de `can_write_page('organisation')` (0100) ;
  //  • isAdmin = la STRUCTURE (ajouter/supprimer une ligne, déplacer une équipe), qui réécrit
  //    l'organigramme. Un chatteur reste en lecture seule totale.
  const isAdmin = profile.role === 'admin'
  const canWrite = isAdmin || profile.manager

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
        <OrganisationContent data={data} isAdmin={isAdmin} canWrite={canWrite} />
      </Suspense>
    </div>
  )
}

async function OrganisationContent({
  data,
  isAdmin,
  canWrite,
}: {
  data: Promise<OrganisationData>
  isAdmin: boolean
  canWrite: boolean
}) {
  return <OrganisationTemplate data={await data} isAdmin={isAdmin} canWrite={canWrite} />
}
