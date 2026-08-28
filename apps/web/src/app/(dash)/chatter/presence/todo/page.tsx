import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { TodoTemplate } from '@/features/tracking-todo/TodoTemplate'
import { TodoSkeleton } from '@/features/tracking-todo/components/todo-skeleton'
import { getTodoHolders } from '@/features/tracking-todo/services/get-holders'
import { getTodoWeek, weekStartOf } from '@/features/tracking-todo/services/get-week'
import { TrackerImportButton } from '@/features/tracking-todo/components/tracker-import-button'
import type { TodoWeek } from '@/features/tracking-todo/types'

// L'import depuis le tracker (login + lecture throttlée de plusieurs pages) tourne dans une Server
// Action, donc dans le budget-temps de cette page.
export const maxDuration = 300

/**
 * To-Do hebdomadaire des encadrants — port de `/todo` du tracker GLA.
 *
 * Chacun voit SA semaine ; un admin peut ouvrir celle d'un autre via `?owner=`. La semaine
 * affichée vit dans l'URL (`?week=`), donc elle se partage et revient au retour arrière.
 */
export default async function PresenceTodoPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; owner?: string }>
}) {
  const profile = await requireAccess('presence')
  const { week, owner } = await searchParams
  const ownerId = profile.role === 'admin' && owner ? owner : profile.id

  // Les encadrants dont un admin peut ouvrir la semaine. Leur écran a le même sélecteur
  // (todo.html:578) ; sans lui, la dérogation « déposer une tâche » n'a aucun point d'entrée.
  const holders = profile.role === 'admin' ? getTodoHolders() : Promise.resolve([])

  const data = getTodoWeek({
    ownerId,
    callerId: profile.id,
    callerRole: profile.baseRole,
    isAdmin: profile.role === 'admin',
    week,
  })

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="To Do" />}>
        <Header data={data} owner={owner} holders={holders} viewerId={profile.id} ownWeek={ownerId === profile.id} />
      </Suspense>
      <Suspense fallback={<TodoSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Header({
  data,
  owner,
  holders,
  viewerId,
  ownWeek,
}: {
  data: Promise<TodoWeek>
  owner?: string
  holders: Promise<{ id: string; name: string }[]>
  viewerId: string
  /** Sa propre semaine ? Le bouton de récupération n'a de sens que là (on ramène SON historique). */
  ownWeek: boolean
}) {
  const [d, people] = await Promise.all([data, holders])
  const href = (w: string): Route => {
    const q = new URLSearchParams({ week: w })
    if (owner) q.set('owner', owner)
    return `/chatter/presence/todo?${q.toString()}` as Route
  }
  return (
    <CtxBar title="To Do" crumb={<b>semaine du {label(d.weekStart)}</b>}>
      {ownWeek && <TrackerImportButton />}
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, -7))}>
        ← Semaine précédente
      </Link>
      <Link className="btn sm btn-ghost" href={href(weekStartOf(d.today))}>
        Cette semaine
      </Link>
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, 7))}>
        Semaine suivante →
      </Link>
      {/* Sélecteur de semaine — admin seulement (`holders` est vide pour les autres). Liens et non
          `<select>` : la page est un Server Component, l'état vit dans l'URL et reste partageable. */}
      {people.length > 0 ? (
        <span className="whose">
          <Link
            className={owner && owner !== viewerId ? 'btn sm btn-ghost' : 'btn sm'}
            href={`/chatter/presence/todo?week=${d.weekStart}` as Route}
          >
            Ma semaine
          </Link>
          {people
            .filter((p) => p.id !== viewerId)
            .map((p) => (
              <Link
                key={p.id}
                className={owner === p.id ? 'btn sm' : 'btn sm btn-ghost'}
                href={`/chatter/presence/todo?week=${d.weekStart}&owner=${p.id}` as Route}
              >
                {p.name}
              </Link>
            ))}
        </span>
      ) : null}
    </CtxBar>
  )
}

async function Body({ data }: { data: Promise<TodoWeek> }) {
  return <TodoTemplate week={await data} />
}

const label = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`))
