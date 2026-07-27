import { Suspense } from 'react'
import { requireAccess, hasWriteAccess } from '@/lib/auth'
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
        <ComptaContent
          data={data}
          // DEUX droits distincts (spec §6) : le manager SAISIT, seul l'admin PAIE.
          // `profile.role` ne vaut que 'admin' ou 'chatteur' — un manager y est mappé sur
          // 'chatteur' (lib/auth). Le tester ici priverait tout manager du formulaire.
          canEnter={hasWriteAccess(profile, 'compta')}
          canPay={profile.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}

async function ComptaContent({
  data,
  canEnter,
  canPay,
}: {
  data: Promise<ComptaData>
  canEnter: boolean
  canPay: boolean
}) {
  return <ComptaTemplate data={await data} canEnter={canEnter} canPay={canPay} />
}
