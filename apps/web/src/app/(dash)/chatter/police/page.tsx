import { Suspense } from 'react'
import { getPolice } from '@/features/police/services/get-police'
import { PoliceTemplate } from '@/features/police/PoliceTemplate'
import { PoliceSkeleton } from '@/features/police/components/police-skeleton'
import { canWritePolice, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import type { PoliceData } from '@/features/police/types'

// Tracker sanctions « Police » — accordable via le droit `police` (policiers/managers).
export default async function PolicePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('police')
  // Période = datepicker GLOBAL du header (`?from&to`), comme les autres pages du CRM —
  // `resolvePeriod` est la source unique (défaut : mois en cours). Synchrone → le h1 et le
  // sous-titre (libellé de période) s'affichent immédiatement, les données streament dessous.
  const period = resolvePeriod(await searchParams)

  // Droit d'écriture (saisie, édition, suppression) : `canWritePolice` (lib/auth, SOURCE
  // UNIQUE — miroir des gardes d'action et de la RLS). Un chatteur consulte en lecture seule.
  // Passé aussi à `getPolice` : le compteur d'avertissements récents (aide-décision de la
  // saisie) n'est chargé que pour les écrivains.
  const canWrite = canWritePolice(profile)
  // Kickoff SANS await (docs/guidelines-data-loading.md §3).
  // `callerId`/`callerRole` : périmètre par rôle — manager/sous-manager/policier cloisonnés
  // sur les chatteurs de LEURS modèles, admin/chatteur voient tout (cf. getPolice).
  const data = getPolice({ period, callerId: profile.id, callerRole: profile.baseRole, canWrite })

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Libellé « Tracker » aligné sur la nav (config/workspaces.ts) — slug/route inchangés. */}
        <h1 className="text-2xl font-semibold tracking-tight">Tracker — sanctions</h1>
        <p className="text-sm text-muted-foreground">
          Avertissements par erreur, puis malus décidé à la main · {period.label}
        </p>
      </div>
      <Suspense fallback={<PoliceSkeleton />}>
        <PoliceContent data={data} canWrite={canWrite} />
      </Suspense>
    </div>
  )
}

async function PoliceContent({
  data,
  canWrite,
}: {
  data: Promise<PoliceData>
  canWrite: boolean
}) {
  return <PoliceTemplate data={await data} canWrite={canWrite} />
}
