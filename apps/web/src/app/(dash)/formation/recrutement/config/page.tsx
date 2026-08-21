import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { ConfigTemplate } from '@/features/recruit-admin/ConfigTemplate'
import { ConfigSkeleton } from '@/features/recruit-admin/components/recruit-skeleton'
import { getRecruitConfig } from '@/features/recruit-admin/services/get-config'
import type { RecruitConfigData } from '@/features/recruit-admin/types'

/** Config du test de recrutement (ADMIN) : ouverture, déroulé, seuils du verdict, banque de QI. */
export default async function RecrutementConfigPage() {
  await requireAdmin()
  // Kickoff SANS await : le h1 s'affiche immédiatement, le formulaire streame dans son boundary.
  const config = getRecruitConfig()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Config du test</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <ConfigSkeleton />
          </SectionFallback>
        }
      >
        <ConfigContent config={config} />
      </Suspense>
    </div>
  )
}

async function ConfigContent({ config }: { config: Promise<RecruitConfigData> }) {
  return <ConfigTemplate config={await config} />
}
