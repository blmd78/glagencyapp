import { Suspense } from 'react'
import { getPolice } from '@/features/police/services/get-police'
import { PoliceTemplate } from '@/features/police/PoliceTemplate'
import { PoliceSkeleton } from '@/features/police/components/police-skeleton'
import { canWritePolice, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { isDayInWindow } from '@/lib/periods'
import { SHIFTS } from '@/features/police/types'
import type { SanctionPrefill } from '@/features/police/components/sanction-dialog'
import type { PoliceData } from '@/features/police/types'

// Tracker sanctions « Police » — accordable via le droit `police` (policiers/managers).
export default async function PolicePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    /** Amorce venue du Relevé d'équipe — cf. `readPrefill`. */
    chatteur?: string
    jour?: string
    creneau?: string
    motif?: string
  }>
}) {
  const profile = await requireAccess('police')
  // Période = datepicker GLOBAL du header (`?from&to`), comme les autres pages du CRM —
  // `resolvePeriod` est la source unique (défaut : mois en cours). Synchrone → le h1 et le
  // sous-titre (libellé de période) s'affichent immédiatement, les données streament dessous.
  const params = await searchParams
  const period = resolvePeriod(params)

  // Droit d'écriture (saisie, édition, suppression) : `canWritePolice` (lib/auth, SOURCE
  // UNIQUE — miroir des gardes d'action et de la RLS). Un chatteur consulte en lecture seule.
  // Passé aussi à `getPolice` : le compteur d'avertissements récents (aide-décision de la
  // saisie) n'est chargé que pour les écrivains.
  const canWrite = canWritePolice(profile)
  // Kickoff SANS await (docs/guidelines-data-loading.md §3).
  // `callerId`/`callerRole` : périmètre par rôle — manager/sous-manager/policier cloisonnés
  // sur les chatteurs de LEURS modèles, admin/chatteur voient tout (cf. getPolice).
  const data = getPolice({ period, callerId: profile.id, callerRole: profile.baseRole, canWrite })
  // Amorce du Relevé d'équipe : des VALEURS PROPOSÉES, jamais une écriture. Le dialog, ses
  // gardes et son Zod restent le seul chemin — d'où le passage par l'URL plutôt qu'un formulaire
  // dupliqué côté Présence (le cross-feature est de toute façon interdit par l'ESLint).
  const prefill = canWrite ? readPrefill(params) : undefined

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
        <PoliceContent data={data} canWrite={canWrite} prefill={prefill} />
      </Suspense>
    </div>
  )
}

async function PoliceContent({
  data,
  canWrite,
  prefill,
}: {
  data: Promise<PoliceData>
  canWrite: boolean
  prefill?: SanctionPrefill
}) {
  return <PoliceTemplate data={await data} canWrite={canWrite} prefill={prefill} />
}

/**
 * Lit l'amorce `?chatteur&jour&creneau&motif` du Relevé d'équipe.
 *
 * REVALIDÉE ICI, et pas seulement à l'émission : une URL se fabrique à la main. Le jour est
 * borné à la même fenêtre de 14 jours que le schéma serveur (`isDayInWindow`) et le créneau au
 * vocabulaire de `police_entries.shift` — proposer une valeur que la Server Action rejettera
 * est pire que ne rien proposer. L'identité du chatteur, elle, est vérifiée là où elle compte :
 * dans la Server Action, qui applique le périmètre modèles.
 */
function readPrefill(p: {
  chatteur?: string
  jour?: string
  creneau?: string
  motif?: string
}): SanctionPrefill | undefined {
  const day = p.jour
  if (!p.chatteur || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !isDayInWindow(day)) return undefined
  return {
    chatterId: p.chatteur,
    day,
    shift: (SHIFTS as readonly string[]).includes(p.creneau ?? '') ? p.creneau : undefined,
    errorKey: p.motif,
  }
}
