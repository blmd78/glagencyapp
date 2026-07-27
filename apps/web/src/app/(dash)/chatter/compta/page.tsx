import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getCompta } from '@/features/compta/services/get-compta'
import { ComptaTemplate } from '@/features/compta/ComptaTemplate'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'
import type { ComptaData } from '@/features/compta/types'

/**
 * Compta = paie des chatteurs, par quinzaine (1–15 / 16–fin). L'admin voit tout et exécute les
 * virements ; manager et sous-manager gèrent les saisies de LEURS rattachés (RLS 0085). Le
 * chatteur n'a jamais la page.
 */
export default async function ComptaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; period?: string }>
}) {
  const profile = await requireAccess('compta')
  const { month, period } = await searchParams
  // Kickoff SANS await : le h1 s'affiche immédiatement, la pile de noms streame dans son
  // boundary quand la lecture répond (docs/guidelines-standard-feature.md §2.2).
  const data = getCompta({ month, period })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compta</h1>
      <Suspense fallback={<ComptaSkeleton />}>
        <ComptaContent data={data} canPay={profile.role === 'admin'} />
      </Suspense>
    </div>
  )
}

async function ComptaContent({
  data,
  canPay,
}: {
  data: Promise<ComptaData>
  canPay: boolean
}) {
  return <ComptaTemplate data={await data} canPay={canPay} />
}
