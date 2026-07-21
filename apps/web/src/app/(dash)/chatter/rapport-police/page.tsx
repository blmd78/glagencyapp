import { Suspense } from 'react'
import { requireAccess, type Profile } from '@/lib/auth'
import {
  getReportOptions,
  getPoliceReports,
  getModelChatters,
} from '@/features/police-reports/services/get-police-reports'
import { PoliceReportsTemplate } from '@/features/police-reports/PoliceReportsTemplate'
import { PoliceReportsSkeleton } from '@/features/police-reports/components/reports-skeleton'

/**
 * Rapport du soir (section Police). Accès = page « Police » (même droit que le Tracker).
 * L'écriture est bornée par la RLS `0071` + la garde `requireReporter` des actions ; on masque
 * la saisie pour un lecteur seul (comme le Tracker), il ne voit que la consultation (tâche 5).
 */
export default async function RapportPolicePage() {
  const profile = await requireAccess('police')

  // Droit d'écriture — MÊME calcul que le Tracker (police/page.tsx:25), miroir de
  // `requireReporter` (actions) + RLS `0071`. `requireAccess('police')` a déjà vérifié la page
  // pour un non-admin, donc `baseRole === 'police'` ici a forcément la page.
  const canWrite =
    profile.role === 'admin' || profile.manager || profile.baseRole === 'police'

  const optionsPromise = getReportOptions(profile)
  const reportsPromise = getPoliceReports(profile, {})

  return (
    <Suspense fallback={<PoliceReportsSkeleton />}>
      <Content
        profile={profile}
        canWrite={canWrite}
        optionsPromise={optionsPromise}
        reportsPromise={reportsPromise}
      />
    </Suspense>
  )
}

async function Content({
  profile,
  canWrite,
  optionsPromise,
  reportsPromise,
}: {
  profile: Profile
  canWrite: boolean
  optionsPromise: ReturnType<typeof getReportOptions>
  reportsPromise: ReturnType<typeof getPoliceReports>
}) {
  const [options, reports] = await Promise.all([optionsPromise, reportsPromise])

  // Pré-chargement SERVEUR des chatteurs par modèle : le formulaire lit `chattersByModel[modèle]`
  // côté client → aucun round-trip ni état de chargement au changement de modèle. Seulement pour
  // un écrivain (le seul à voir le formulaire). Une requête `getModelChatters` par modèle en
  // parallèle. Tenable en v1 : un police/manager a une poignée de modèles assignés. PIRE CAS =
  // un ADMIN (périmètre non scopé → tous les modèles de l'agence) → rafale de N requêtes au
  // chargement ; si l'agence grossit, basculer sur un fetch client au `onChange` du modèle.
  const chattersByModel = canWrite
    ? Object.fromEntries(
        await Promise.all(
          options.models.map(
            async (m) => [m.id, await getModelChatters(profile, m.id)] as const,
          ),
        ),
      )
    : {}

  return (
    <PoliceReportsTemplate
      models={options.models}
      reports={reports}
      chattersByModel={chattersByModel}
      canWrite={canWrite}
      currentProfileId={profile.id}
    />
  )
}
