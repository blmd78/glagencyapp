import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getStatChatteur } from '@/features/stat-chatteur/services/get-stat-chatteur'
import { StatChatteurTemplate } from '@/features/stat-chatteur/StatChatteurTemplate'
import { StatChatteurSkeleton } from '@/features/stat-chatteur/components/stat-chatteur-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { StatChatteurData } from '@/features/stat-chatteur/types'
import type { StatChatteurVue } from '@/features/stat-chatteur/components/stat-chatteur-tabs.client'

export default async function StatChatteurPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vue?: string; modele?: string }>
}) {
  const profile = await requireAccess('stat-chatteur')
  const params = await searchParams
  const period = resolvePeriod(params)
  // `?vue=modele` = onglet « Par modèle » ; `?modele=` = la modèle choisie (sinon la plus rentable).
  const vue: StatChatteurVue = params.vue === 'modele' ? 'modele' : 'chatteurs'
  // Kickoff SANS await (pattern streaming, cf. chatters/page.tsx) : le shell (h1) s'affiche
  // immédiatement, le podium + classement streame dans son boundary quand la donnée répond.
  const data = getStatChatteur(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stat chatter</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <StatChatteurSkeleton />
          </SectionFallback>
        }
      >
        <StatChatteurContent data={data} vue={vue} modele={params.modele} />
      </Suspense>
    </div>
  )
}

async function StatChatteurContent({
  data,
  vue,
  modele,
}: {
  data: Promise<StatChatteurData>
  vue: StatChatteurVue
  modele?: string
}) {
  return <StatChatteurTemplate data={await data} vue={vue} modele={modele} />
}
