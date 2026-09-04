import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { MypulsShiftVacationsTemplate } from '@/features/mypuls-shift-vacations/MypulsShiftVacationsTemplate'
import { getVacations } from '@/features/mypuls-shift-vacations/services/get-vacations'
import type { VacationsPage } from '@/features/mypuls-shift-vacations/types'

/**
 * Détail des vacations — la vue d'enquête du relevé MyPuls.
 *
 * On l'ouvre quand un chiffre du Relevé surprend : le grain est la VACATION (segments regroupés
 * au seuil de la page Réglages), et les filtres sont libres là où le Relevé impose un jour.
 *
 * La lecture est lancée SANS `await` : le titre s'affiche tout de suite.
 */
export default async function PresenceVacationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    du?: string
    au?: string
    chatteur?: string
    modele?: string
    creneau?: string
  }>
}) {
  const profile = await requireAccess('presence')
  const { du, au, chatteur, modele, creneau } = await searchParams

  const data = getVacations({
    callerId: profile.id,
    // `baseRole` et NON `role` — sinon `getCreatorScope` est inerte (même piège que le Relevé).
    callerRole: profile.baseRole,
    from: du,
    to: au,
    // `?chatteur=` porte un `chatters.id` — la clé du relevé depuis 0144.
    chatterId: chatteur,
    model: modele,
    slot: creneau,
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Détail des vacations</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <Vacations data={data} />
      </Suspense>
    </div>
  )
}

async function Vacations({ data }: { data: Promise<VacationsPage> }) {
  return <MypulsShiftVacationsTemplate data={await data} />
}
