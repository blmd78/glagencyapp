import { Suspense } from 'react'
import { addDays, todayParis } from '@glagency/core'
import { canWritePolice, requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { DAY_WINDOW } from '@/lib/periods'
import {
  getReportOptions,
  getPoliceReports,
  getChattersByModel,
} from '@/features/police-reports/services/get-police-reports'
import { getCreatorScope } from '@/lib/services/creator-scope'
import { PoliceReportsTemplate } from '@/features/police-reports/PoliceReportsTemplate'
import { PoliceReportsSkeleton } from '@/features/police-reports/components/reports-skeleton'

/**
 * Rapport du soir (section Police). Accès = page « Police » (même droit que le Tracker).
 * PÉRIODE = datepicker GLOBAL du header (`?from&to`, `resolvePeriod`) — plus de bascule
 * Jour/Mois locale (2026-08-17, aligné sur le Tracker). La SAISIE porte sa propre date
 * (datepicker du dialog, fenêtre 14 j) ; l'écriture est bornée par la RLS `0071` + la garde
 * `requireReporter` des actions ; on masque la saisie pour un lecteur seul.
 */
export default async function RapportPolicePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('police')
  const period = resolvePeriod(await searchParams)

  // Droit d'écriture — `canWritePolice` (lib/auth, SOURCE UNIQUE, même garde que le Tracker,
  // miroir de `requireReporter` + RLS `0071`).
  const canWrite = canWritePolice(profile)

  // Périmètre modèles par rôle (2026-08-06, comme le Tracker) : résolu UNE fois, partagé en
  // PROMESSE entre les lectures — le shell n'attend pas, chaque service l'attend en interne.
  const scopePromise = getCreatorScope(profile.id, profile.baseRole)

  // Options modèles + chatteurs par modèle : consommés par le SEUL formulaire de saisie →
  // chargés pour les écrivains uniquement (l'audit avait relevé le fetch inconditionnel).
  const optionsPromise = canWrite ? getReportOptions(scopePromise) : Promise.resolve([])
  const chattersByModelPromise: ReturnType<typeof getChattersByModel> =
    canWrite ? getChattersByModel(scopePromise) : Promise.resolve({})
  // Historique de la PÉRIODE affichée.
  const reportsPromise = getPoliceReports({ from: period.from, to: period.to }, scopePromise)
  // PRÉ-REMPLISSAGE du formulaire : mes fiches de la FENÊTRE DE SAISIE (14 j), indépendamment de
  // la période affichée — l'upsert est keyé (auteur, modèle, jour) : sans cette lecture, choisir
  // au datepicker un jour hors période ÉCRASERAIT à blanc une fiche existante, en silence.
  const today = todayParis()
  const prefillPromise = canWrite
    ? getPoliceReports({ from: addDays(today, -(DAY_WINDOW - 1)), to: today }, scopePromise)
    : Promise.resolve([])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rapport du soir</h1>
        <p className="text-sm text-muted-foreground">
          Chiffres du modèle et suivi individuel des chatters, un rapport par modèle et par soir
          · {period.label}
        </p>
      </div>
      <Suspense fallback={<PoliceReportsSkeleton />}>
        <Content
          profileId={profile.id}
          canWrite={canWrite}
          optionsPromise={optionsPromise}
          reportsPromise={reportsPromise}
          prefillPromise={prefillPromise}
          chattersByModelPromise={chattersByModelPromise}
        />
      </Suspense>
    </div>
  )
}

async function Content({
  profileId,
  canWrite,
  optionsPromise,
  reportsPromise,
  prefillPromise,
  chattersByModelPromise,
}: {
  profileId: string
  canWrite: boolean
  optionsPromise: ReturnType<typeof getReportOptions>
  reportsPromise: ReturnType<typeof getPoliceReports>
  prefillPromise: ReturnType<typeof getPoliceReports>
  chattersByModelPromise: ReturnType<typeof getChattersByModel>
}) {
  // Tout EN PARALLÈLE : options + rapports + pré-remplissage + chatteurs par modèle. Le
  // formulaire lit `chattersByModel[modèle]` côté client → aucun round-trip au changement de modèle.
  const [models, reports, prefillReports, chattersByModel] = await Promise.all([
    optionsPromise,
    reportsPromise,
    prefillPromise,
    chattersByModelPromise,
  ])

  return (
    <PoliceReportsTemplate
      models={models}
      reports={reports}
      prefillReports={prefillReports}
      chattersByModel={chattersByModel}
      canWrite={canWrite}
      currentProfileId={profileId}
    />
  )
}
