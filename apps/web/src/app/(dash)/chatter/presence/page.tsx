import { Suspense } from 'react'
import { canWritePolice, requireAccess } from '@/lib/auth'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { MypulsShiftReportTemplate } from '@/features/mypuls-shift-report/MypulsShiftReportTemplate'
import { getShiftReport } from '@/features/mypuls-shift-report/services/get-shift-report'
import type { ShiftReport } from '@/features/mypuls-shift-report/types'

/**
 * Relevé d'équipe — qui a tenu son poste, sur un jour et un créneau.
 *
 * La source est MyPuls (`mypuls_shift_*`, migrations 0138/0140) : c'est la seule mesure de
 * présence dont l'app dispose réellement. L'agent Electron du tracker porté n'a jamais été
 * repointé — ses tables sont vides depuis l'origine.
 *
 * La lecture est lancée SANS `await` : le titre s'affiche tout de suite, la RPC est streamée
 * dans son `<Suspense>`.
 */
export default async function PresenceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; shift?: string; attendu?: string; ecart?: string }>
}) {
  const profile = await requireAccess('presence')
  const { date, shift, attendu, ecart } = await searchParams

  const data = getShiftReport({
    callerId: profile.id,
    // `baseRole` et NON `role` : ce dernier écrase `manager`/`sous-manager`/`police` en
    // 'admin'|'chatteur' (lib/auth/index.ts:31), or `getCreatorScope` teste justement ces
    // trois rôles-là — le périmètre serait INERTE. C'est le bug qu'avait le Board porté.
    callerRole: profile.baseRole,
    day: date,
    slot: shift,
    onlyExpected: attendu === '1',
    belowOnly: ecart === '1',
    // Le lien « Signaler » n'apparaît que pour qui peut RÉELLEMENT écrire une sanction —
    // `canWritePolice` est la source unique, miroir des gardes d'action et de la RLS. Un
    // porteur de « presence » sans le droit Police lit le relevé sans jamais voir le lien.
    canWritePolice: canWritePolice(profile),
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Relevé d’équipe</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <KpiSkeleton />
            <TableSkeleton />
          </SectionFallback>
        }
      >
        <Report data={data} />
      </Suspense>
    </div>
  )
}

async function Report({ data }: { data: Promise<ShiftReport> }) {
  return <MypulsShiftReportTemplate data={await data} />
}
