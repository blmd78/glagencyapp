import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays, frDayMonthParis } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { TodoTemplate } from '@/features/tracking-todo/TodoTemplate'
import { TodoSkeleton } from '@/features/tracking-todo/components/todo-skeleton'
import { getTodoWeek, weekStartOf } from '@/features/tracking-todo/services/get-week'
import type { TodoWeek } from '@/features/tracking-todo/types'

/**
 * « Ma to-do » du CHATTEUR — la même to-do que celle des encadrants, donnée au chatteur pour qu'il
 * remplisse la sienne (demande Benoit : « tout pareil que l'autre CRM »).
 *
 * Placée côté Formation, là où le chatteur va déjà (droit `frm-entrainement`), et non côté encadrant
 * (`/chatter/presence/todo`, réservé à `presence`). Même composant, même comportement — habitudes,
 * sections, cases, débrief — scopé à SON profil. Son manager pourra y déposer des tâches (à venir).
 *
 * Rien à récupérer du tracker : les chatteurs n'y avaient pas de to-do. Elle part de vide, le
 * chatteur la remplit et gère ensuite.
 */
export default async function MaTodoPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const profile = await requireAccess('frm-entrainement')
  const { week } = await searchParams

  // Toujours SA semaine : un chatteur ne voit que sa propre to-do (owner = lui).
  const data = getTodoWeek({
    ownerId: profile.id,
    callerId: profile.id,
    callerRole: profile.baseRole,
    isAdmin: false,
    week,
  })

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="Ma to-do" />}>
        <Header data={data} />
      </Suspense>
      <Suspense fallback={<TodoSkeleton />}>
        <Body data={data} />
      </Suspense>
    </div>
  )
}

const label = (iso: string): string => frDayMonthParis(iso)

async function Header({ data }: { data: Promise<TodoWeek> }) {
  const d = await data
  const href = (w: string): Route => `/formation/ma-todo?week=${w}` as Route
  return (
    <CtxBar title="Ma to-do" crumb={<b>semaine du {label(d.weekStart)}</b>}>
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
