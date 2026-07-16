import { Suspense } from 'react'
import { getBilan } from '@/features/bilan/services/get-bilan'
import { BilanTemplate } from '@/features/bilan/BilanTemplate'
import { BilanSkeleton } from '@/features/bilan/components/bilan-skeleton'
import { requireAccess } from '@/lib/auth'
import type { BilanData } from '@/features/bilan/types'

export default async function BilanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await requireAccess('bilan')
  const { week } = await searchParams
  // Kickoff SANS await : le header (titre + sélecteur de semaine) est un widget client
  // (`WeekSwitcher`, useRouter/useSearchParams) qui a besoin de `data.weeks`/`data.week` —
  // pas de h1 « immédiat » séparable ici sans casser la mise en page (titre + sélecteur
  // sur la même ligne, cf. docs/guidelines-data-loading.md §3 « widget d'en-tête couplé à
  // un hook — garde tout l'en-tête dans la View »). Tout le composite streame dans un seul
  // boundary.
  const data = getBilan(week)

  return (
    <Suspense fallback={<BilanSkeleton />}>
      <BilanContent data={data} />
    </Suspense>
  )
}

async function BilanContent({ data }: { data: Promise<BilanData> }) {
  return <BilanTemplate data={await data} />
}
