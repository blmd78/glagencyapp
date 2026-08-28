import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { todayParis } from '@glagency/core'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { ManagersTemplate } from '@/features/tracking-managers/ManagersTemplate'
import { ManagersSkeleton } from '@/features/tracking-managers/components/managers-skeleton'
import {
  getManagersDay,
  type ManagersData,
} from '@/features/tracking-managers/services/get-managers-day'

const DAYS = 14

/**
 * Présence des managers — port de `/m/:date` du tracker GLA.
 * Sélecteur de date en `searchParams`, comme le board : l'état reste dans l'URL, partageable.
 */
export default async function PresenceManagersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await requireAccess('presence')
  // Le tracker d'origine réservait cette vue à `canSeeManagers` = admin OU « principal »
  // (core-modules.txt:837, routes.js.txt:100-107) ; un simple `manager` y recevait un 403.
  // Correspondance de rôles chez nous : leur `principal` (tous les chatteurs + l'onglet Managers,
  // sans la gestion des comptes) = notre `manager` ; leur `manager` (borné à ses modèles) = notre
  // `sous-manager`. La présence des autres encadrants n'a pas à être lisible par un pair.
  if (profile.role !== 'admin' && profile.baseRole !== 'manager') notFound()
  const { date } = await searchParams
  const day = date ?? todayParis()

  const data = getManagersDay(day)

  return (
    <div className="trk trk-page">
      <CtxBar title="Managers" crumb={<b>{dayLabel(day)}</b>}>
        <details className="dd">
          <summary>{dayLabel(day)}</summary>
          <div className="dd-menu">
            {lastDays(day, DAYS).map((d) => (
              <Link
                key={d}
                href={`/chatter/presence/managers?date=${d}` as Route}
                className={d === day ? 'on' : ''}
              >
                {dayLabel(d)}
              </Link>
            ))}
          </div>
        </details>
      </CtxBar>

      <Suspense fallback={<ManagersSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Body({ data }: { data: Promise<ManagersData> }) {
  return <ManagersTemplate data={await data} />
}

/** « mer. 26/08 » — leur format. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(d)
  const dm = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(d)
  return `${wd} ${dm}`
}

function lastDays(from: string, count: number): string[] {
  const base = Date.parse(`${from}T12:00:00Z`)
  return Array.from({ length: count }, (_, i) =>
    new Date(base - i * 86_400_000).toISOString().slice(0, 10),
  )
}
