import { Suspense } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canWritePolice, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { MypulsShiftReportTemplate } from '@/features/mypuls-shift-report/MypulsShiftReportTemplate'
import { getShiftReport } from '@/features/mypuls-shift-report/services/get-shift-report'
import type { ShiftReport } from '@/features/mypuls-shift-report/types'

/**
 * Relevé d'équipe — qui a tenu son poste, sur la PÉRIODE du header.
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
  searchParams: Promise<{
    from?: string
    to?: string
    shift?: string
    attendu?: string
    ecart?: string
  }>
}) {
  const profile = await requireAccess('presence')
  const params = await searchParams
  // PÉRIODE = le datepicker GLOBAL du header (`?from&to`), comme les autres pages du CRM.
  // `resolvePeriod` est la source unique (défaut : mois en cours). Le service la borne ensuite
  // à hier — aujourd'hui n'est jamais relevé.
  const period = resolvePeriod(params)
  const { shift, attendu, ecart } = params

  const data = getShiftReport({
    callerId: profile.id,
    // `baseRole` et NON `role` : ce dernier écrase `manager`/`sous-manager`/`police` en
    // 'admin'|'chatteur' (lib/auth/index.ts:31), or `getCreatorScope` teste justement ces
    // trois rôles-là — le périmètre serait INERTE. C'est le bug qu'avait le Board porté.
    callerRole: profile.baseRole,
    from: period.from,
    to: period.to,
    periodLabel: period.label,
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
      {/* Les réglages en HAUT À DROITE, et nulle part ailleurs. Ils étaient atteints en
          cliquant la ligne « Relevé MyPuls du … » et le compteur de libellés non rattachés :
          on tombait donc sur un écran de maintenance en cliquant ce qu'on lisait comme un
          NOM. Un lien doit mener là où son texte le dit. */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Relevé d’équipe</h1>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link
            href="/chatter/presence/reglages"
            title="Journal des relevés, seuils de mesure et gens à rattacher"
          >
            <SlidersHorizontal className="size-4" />
            Réglages
          </Link>
        </Button>
      </div>
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
