import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { addDays } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { canAssignTodoOf } from '@/lib/tracking/todo-guards'
import { CtxBar } from '@/components/tracking/ctx-bar'
import { TodoTemplate } from '@/features/tracking-todo/TodoTemplate'
import { TodoSkeleton } from '@/features/tracking-todo/components/todo-skeleton'
import { getTodoHolders } from '@/features/tracking-todo/services/get-holders'
import { getTodoWeek, weekStartOf } from '@/features/tracking-todo/services/get-week'
import { TrackerImportButton } from '@/features/tracking-todo/components/tracker-import-button'
import { TodoAccountSelect } from '@/features/tracking-todo/components/todo-account-select'
import type { TodoWeek } from '@/features/tracking-todo/types'

// L'import depuis le tracker (login + lecture throttlée de plusieurs pages) tourne dans une Server
// Action, donc dans le budget-temps de cette page.
export const maxDuration = 300

/**
 * To-Do hebdomadaire des encadrants — port de `/todo` du tracker GLA.
 *
 * Chacun voit SA semaine ; un admin — et depuis 2026-08-31 un manager, pour ses sous-managers
 * rattachés — peut ouvrir celle d'un autre via `?owner=` pour y déposer une tâche. La semaine
 * affichée vit dans l'URL (`?week=`), donc elle se partage et revient au retour arrière.
 */
export default async function PresenceTodoPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; owner?: string }>
}) {
  const profile = await requireAccess('presence')
  const { week, owner } = await searchParams

  // `?owner=` n'est honoré QUE si l'appelant a la dérogation de dépôt sur cette personne ; sinon
  // on retombe en silence sur sa propre semaine. Cette validation n'est pas cosmétique : la RLS
  // de `tracker_todo_tasks` (0127:142) laisse tout porteur du slug `presence` lire n'importe
  // quelle semaine, donc un `?owner=` cru suffirait à ouvrir celle de n'importe qui. Le prédicat
  // est le MÊME que celui des gardes d'écriture (`canAssignTodoOf`) — deux copies divergeraient.
  // Coût : une lecture de profil, et seulement quand `?owner=` est présent (jamais par défaut).
  const canAssign = !!owner && owner !== profile.id && (await canAssignTodoOf(profile, owner))
  const ownerId = canAssign ? (owner as string) : profile.id

  // Les encadrants dont on peut ouvrir la semaine. Leur écran a le même sélecteur
  // (todo.html:578) ; sans lui, la dérogation « déposer une tâche » n'a aucun point d'entrée.
  // Vide pour qui n'a aucune dérogation → le sélecteur ne se rend pas.
  const holders = getTodoHolders(profile)

  const data = getTodoWeek({
    ownerId,
    callerId: profile.id,
    callerRole: profile.baseRole,
    canAssign,
    week,
  })

  return (
    <div className="trk trk-page">
      <Suspense fallback={<CtxBar title="To Do" />}>
        {/* `owner` RÉSOLU et non le paramètre brut : un `?owner=` refusé retombe sur sa propre
            semaine, la nav de semaine et le sélecteur doivent suivre — sinon les liens
            traîneraient un owner que le serveur vient d'écarter. */}
        <Header
          data={data}
          owner={ownerId === profile.id ? undefined : ownerId}
          holders={holders}
          viewerId={profile.id}
          ownWeek={ownerId === profile.id}
        />
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
    <CtxBar
      title="To Do"
      crumb={<b>semaine du {label(d.weekStart)}</b>}
      // Bouton de récupération à l'extrême droite : il n'a de sens que sur SA propre semaine, et
      // que si on peut y écrire. `d.canWrite` en plus de `ownWeek` : un porteur du droit qui n'est
      // pas encadrant (chatteur, policier) voit un écran entièrement en lecture seule — lui laisser
      // le seul bouton d'écriture de la page, que le serveur refuse désormais, serait la dernière
      // promesse non tenue de cet écran.
      right={ownWeek && d.canWrite ? <TrackerImportButton /> : undefined}
    >
      {/* Nav de semaine SEGMENTÉE, à l'identique du tracker (`.datenav.seg` : ‹ / cette semaine / ›). */}
      <div className="seg">
        <Link href={href(addDays(d.weekStart, -7))} aria-label="Semaine précédente">‹</Link>
        <Link href={href(weekStartOf(d.today))}>cette semaine</Link>
        <Link href={href(addDays(d.weekStart, 7))} aria-label="Semaine suivante">›</Link>
      </div>
      {/* Sélecteur de compte (notre Combobox) : admin, ou manager avec des sous-managers rattachés —
          `holders` est vide pour tous les autres, le sélecteur ne se rend alors pas. */}
      {people.length > 0 ? (
        <TodoAccountSelect week={d.weekStart} viewerId={viewerId} current={owner ?? viewerId} people={people} />
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
