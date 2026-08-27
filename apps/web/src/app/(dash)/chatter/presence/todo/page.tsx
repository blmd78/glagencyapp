import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { TodoTemplate } from '@/features/tracking-todo/TodoTemplate'
import { TodoSkeleton } from '@/features/tracking-todo/components/todo-skeleton'
import { getTodoWeek, weekStartOf } from '@/features/tracking-todo/services/get-week'
import type { TodoWeek } from '@/features/tracking-todo/types'

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

  const data = getTodoWeek({
    ownerId,
    callerId: profile.id,
    isAdmin: profile.role === 'admin',
    week,
  })

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="To Do" />}>
        <Header data={data} owner={owner} />
      </Suspense>
      <Suspense fallback={<TodoSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

async function Header({ data, owner }: { data: Promise<TodoWeek>; owner?: string }) {
  const d = await data
  const href = (w: string): Route => {
    const q = new URLSearchParams({ week: w })
    if (owner) q.set('owner', owner)
    return `/chatter/presence/todo?${q.toString()}` as Route
  }
  return (
    <CtxBar title="To Do" crumb={<b>semaine du {label(d.weekStart)}</b>}>
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, -7))}>
        ← Semaine précédente
      </Link>
      <Link className="btn sm btn-ghost" href={href(weekStartOf(d.today))}>
        Cette semaine
      </Link>
      <Link className="btn sm btn-ghost" href={href(addDays(d.weekStart, 7))}>
        Semaine suivante →
      </Link>
    </CtxBar>
  )
}

async function Body({ data }: { data: Promise<TodoWeek> }) {
  return <TodoTemplate week={await data} />
}

const label = (day: string): string =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`))
