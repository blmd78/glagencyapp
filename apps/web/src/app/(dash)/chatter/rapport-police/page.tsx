import { Suspense } from 'react'
import { startOfMonth, todayParis } from '@glagency/core'
import { requireAccess, type Profile } from '@/lib/auth'
import { recentDays, recentMonths } from '@/lib/periods'
import {
  getReportOptions,
  getPoliceReports,
  getChattersByModel,
} from '@/features/police-reports/services/get-police-reports'
import { PoliceReportsTemplate } from '@/features/police-reports/PoliceReportsTemplate'
import { PoliceReportsSkeleton } from '@/features/police-reports/components/reports-skeleton'

/**
 * Rapport du soir (section Police). Accès = page « Police » (même droit que le Tracker).
 * Piloté par une VUE + une ancre temporelle via l'URL : `?vue=jour` (défaut) cale la page sur un
 * JOUR (`?day=`, formulaire + historique du jour) ; `?vue=mois` la cale sur un MOIS (`?month=`,
 * consultation pure, historique groupé par jour). La bascule d'en-tête (`PeriodToggle`) change de
 * mode. L'écriture est bornée par la RLS `0071` + la garde `requireReporter` des actions ; on masque
 * la saisie pour un lecteur seul, et TOTALEMENT en mode mois (on ne saisit pas un rapport mensuel).
 */
export default async function RapportPolicePage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; day?: string; month?: string }>
}) {
  const profile = await requireAccess('police')
  const { vue: vueParam, day, month } = await searchParams
  const vue = vueParam === 'mois' ? 'mois' : 'jour'

  const today = todayParis()
  const days = recentDays(today)
  const months = recentMonths(today)
  // Défaut = aujourd'hui ; un `?day=` hors fenêtre est ignoré (empêche un jour arbitraire).
  const selectedDay = day && days.some((d) => d.day === day) ? day : today
  // Défaut = mois courant (1er) ; un `?month=` hors fenêtre est ignoré (même garde que `day`).
  const currentMonth = startOfMonth(today)
  const selectedMonth = month && months.some((m) => m.month === month) ? month : currentMonth

  // Droit d'écriture — MÊME calcul que le Tracker (police/page.tsx:25), miroir de
  // `requireReporter` (actions) + RLS `0071`. `requireAccess('police')` a déjà vérifié la page
  // pour un non-admin, donc `baseRole === 'police'` ici a forcément la page.
  const canWrite =
    profile.role === 'admin' || profile.manager || profile.baseRole === 'police'

  const optionsPromise = getReportOptions()
  // Jour = rapports du seul jour (`.eq('day', …)`) ; mois = plage du mois (`.gte/.lte`). `day` et
  // `month` sont mutuellement exclusifs — on ne passe QUE l'ancre du mode actif.
  const reportsPromise =
    vue === 'mois'
      ? getPoliceReports(profile, { month: selectedMonth })
      : getPoliceReports(profile, { day: selectedDay })

  return (
    <Suspense fallback={<PoliceReportsSkeleton />}>
      <Content
        profile={profile}
        canWrite={canWrite}
        vue={vue}
        day={selectedDay}
        days={days}
        month={selectedMonth}
        months={months}
        optionsPromise={optionsPromise}
        reportsPromise={reportsPromise}
      />
    </Suspense>
  )
}

async function Content({
  profile,
  canWrite,
  vue,
  day,
  days,
  month,
  months,
  optionsPromise,
  reportsPromise,
}: {
  profile: Profile
  canWrite: boolean
  vue: 'jour' | 'mois'
  day: string
  days: { day: string; label: string }[]
  month: string
  months: { month: string; label: string }[]
  optionsPromise: ReturnType<typeof getReportOptions>
  reportsPromise: ReturnType<typeof getPoliceReports>
}) {
  const [models, reports] = await Promise.all([optionsPromise, reportsPromise])

  // Pré-chargement SERVEUR des chatteurs, groupés par modèle en UNE requête (cf.
  // `getChattersByModel`) : le formulaire lit `chattersByModel[modèle]` côté client → aucun
  // round-trip ni état de chargement au changement de modèle. Seulement pour un écrivain qui voit
  // réellement le formulaire → uniquement en mode JOUR (pas de saisie en mois). Une seule requête
  // quel que soit le nombre de modèles (admin compris).
  const chattersByModel = canWrite && vue === 'jour' ? await getChattersByModel() : {}

  return (
    <PoliceReportsTemplate
      models={models}
      reports={reports}
      chattersByModel={chattersByModel}
      canWrite={canWrite}
      currentProfileId={profile.id}
      vue={vue}
      day={day}
      days={days}
      month={month}
      months={months}
    />
  )
}
