import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { getCatalog } from '@/features/training-catalog/services/get-catalog'
import { CatalogTemplate } from '@/features/training-catalog/CatalogTemplate'
import { CatalogSkeleton } from '@/features/training-catalog/components/catalog-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { CatalogData } from '@/features/training-catalog/types'

/** Catalogue de formation (ADMIN — item adminOnly, comme Membres) : `?module=<code>` = module affiché. */
export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const [, { module }] = await Promise.all([requireAdmin(), searchParams])
  // Kickoff SANS await : le h1 s'affiche immédiatement, le catalogue streame dans son boundary.
  const data = getCatalog()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Catalogue</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <CatalogSkeleton />
          </SectionFallback>
        }
      >
        <CatalogContent data={data} selectedCode={module ?? null} />
      </Suspense>
    </div>
  )
}

async function CatalogContent({ data, selectedCode }: { data: Promise<CatalogData>; selectedCode: string | null }) {
  return <CatalogTemplate data={await data} selectedCode={selectedCode} />
}
