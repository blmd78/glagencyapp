import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  getPlanning,
  getPlanningMembers,
  getPlanningOwners,
} from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'
import { MemberSelect } from '@/components/member-select'
import { getTodos } from '@/features/todos/services/get-todos'
import { getTodoCounts } from '@/features/todos/services/get-todo-counts'
import { TodosTemplate } from '@/features/todos/TodosTemplate'
import { TodosSkeleton } from '@/features/todos/components/todos-skeleton'
import { TodosTabs } from '@/features/todos/components/todos-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAccess } from '@/lib/auth'
import { applyFilter, resolveFilter, selfLabel } from '@/lib/roster'
import type { PlanningEntry, PlanningMember } from '@/features/planning/types'
import type { TodoEntry } from '@/features/todos/types'

/**
 * Deux onglets sur la même page (`?vue=`) : le planning journalier et la to-do personnelle.
 * Le périmètre des personnes est COMMUN (superadmin → tout, superadmins compris ; admin →
 * managers/sous-managers ; manager → ses sous-managers directs ; sous-manager → personne),
 * et le sélecteur `?membre=` reste COMMUN aux deux — et depuis 2026-07-28 il y joue le MÊME
 * rôle : un FILTRE sur une pile de noms dépliables (sans filtre, tout le monde est empilé ;
 * avec, la personne seule, à plat). Droits distincts en revanche : on n'édite pas SON planning
 * (sauf superadmin), mais on gère toujours SA to-do (spec 2026-07-20).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string; vue?: string }>
}) {
  const profile = await requireAccess('planning')
  // Jamais de chatteur (matrice), même si un admin lui a coché le slug 'planning'.
  // /no-access et pas landingHref : éviter la boucle si 'planning' est sa seule page autorisée.
  if (profile.baseRole === 'chatteur') redirect('/no-access')
  const { membre, vue: vueParam } = await searchParams
  const vue = vueParam === 'todo' ? 'todo' : 'planning'
  // KANBAN EN PAUSE (2026-07-20) — plus rien n'écrit `TODOS_AFFICHAGE_COOKIE` (todos/types.ts) :
  // pas de lecture ici tant que la bascule liste/kanban n'est pas réactivée. À la réactivation,
  // relire le cookie ici et repasser `affichage` à `TodosSkeleton`/`TodosTemplate` (cf.
  // todos-view.tsx pour l'écriture et le reste de la chaîne à rétablir).

  // Kickoff SANS await : la liste des personnes conditionne TOUT le composite (accordéons du
  // planning ou sélecteur de la to-do) — il streame dans un seul boundary. `[]` pour sous-manager.
  const membersPromise = getPlanningMembers(profile.baseRole)

  return (
    <div className="flex flex-col gap-6">
      {/* `h1` HORS du `<Suspense>` : il ne dépend d'aucune donnée async (juste le rôle, déjà
          résolu par `requireAccess`) et doit rester affiché pendant tout le streaming — sinon
          titre + sélecteur + onglets disparaissent puis réapparaissent (clignotement). TOUT le
          reste est dans le boundary — le sélecteur y compris, puisqu'il dépend de
          `membersPromise` ; sa silhouette de secours (ci-dessous) enchaîne sans saut visible
          avec celle de `loading.tsx`. */}
      <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div aria-hidden="true" className="flex flex-col gap-6">
              <div className="flex justify-end">
                <Skeleton className="h-9 w-52" />
              </div>
              <Skeleton className="h-10 w-64" />
            </div>
            {vue === 'todo' ? <TodosSkeleton /> : <RowsSkeleton />}
          </div>
        }
      >
        <PlanningContent
          profileId={profile.id}
          selfName={profile.displayName ?? profile.email ?? 'Moi'}
          superadmin={profile.superadmin}
          membre={membre}
          vue={vue}
          membersPromise={membersPromise}
        />
      </Suspense>
    </div>
  )
}

async function PlanningContent({
  profileId,
  selfName,
  superadmin,
  membre,
  vue,
  membersPromise,
}: {
  profileId: string
  selfName: string
  superadmin: boolean
  membre?: string
  vue: 'planning' | 'todo'
  membersPromise: Promise<PlanningMember[]>
}) {
  // Personnes gérables (hors soi), SOI-MÊME en tête. `role: ''` = pas de suffixe de rôle.
  // Le « (moi) » ne sert qu'à se distinguer des autres : inutile quand on est seul.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const roster: PlanningMember[] = [
    { id: profileId, name: selfLabel(selfName, others), role: '', hasPlanningPage: true },
    ...others,
  ]
  // `?membre=` est un FILTRE sur les DEUX onglets depuis 2026-07-28 : absent = tout le monde
  // empilé, présent = cette personne seule, affichée à plat. Avant, la to-do s'en servait pour
  // désigner sa cible — les deux onglets se comportent désormais pareil.
  const filterId = resolveFilter(roster, membre)
  const shown = applyFilter(roster, filterId)

  // Un seul des deux onglets est actif à la fois (`?vue=`) : on ne charge — et ne construit
  // l'élément — que celui-là. Sans ça, `getTodos` devient une dépendance dure du planning
  // journalier (si le code arrive en production avant la migration 0067, elle lève et fait
  // tomber toute la page, alors que seul l'onglet To-do aurait dû casser) et chaque affichage
  // paie une requête + un rendu serveur complet pour un onglet que personne n'a demandé. Le
  // `<Tabs>` de `TodosTabs` ne pose pas de problème côté client : Radix ne rend dans le DOM que
  // le contenu de l'onglet actif (`Presence` de `@radix-ui/react-tabs`, pas de `forceMount`
  // posé ici) — mais ça ne joue qu'après coup, une fois le RSC déjà produit ; encore faut-il ne
  // pas construire l'élément de l'onglet inactif en amont.
  //
  // Chaque onglet a son PROPRE boundary : sans lui, `PlanningContent` attendrait toute la
  // chaîne (membres → plannings → blocs, 3 allers-retours en série) avant de rendre quoi que
  // ce soit, alors que le sélecteur et la barre d'onglets ne dépendent que du premier. Ici la
  // coquille part dès `membersPromise` résolu, et le contenu la rejoint en streaming.
  const planningNode =
    vue === 'planning' ? (
      <Suspense fallback={<RowsSkeleton />}>
        <PlanningTab members={shown} profileId={profileId} superadmin={superadmin} />
      </Suspense>
    ) : null
  const todoNode =
    vue === 'todo' ? (
      <Suspense fallback={<TodosSkeleton />}>
        <TodoTab members={shown} profileId={profileId} />
      </Suspense>
    ) : null

  return (
    <div className="flex flex-col gap-6">
      {/* Le sélecteur vit AU-DESSUS des onglets : Radix démonte le contenu de l'onglet
          inactif, donc un sélecteur logé dans l'en-tête disparaîtrait à la bascule. Sa valeur
          et son option « Tous les membres » sont désormais les MÊMES sur les deux onglets —
          c'est un seul et même filtre (`filterId`), plus une cible d'un côté et un filtre de
          l'autre. Le `h1` « Planning » est monté par `PlanningPage` (hors boundary, plus haut). */}
      {others.length > 0 && (
        <div className="flex justify-end">
          <MemberSelect members={roster} value={filterId} allowAll />
        </div>
      )}
      <TodosTabs vue={vue} planning={planningNode} todo={todoNode} />
    </div>
  )
}

/**
 * Contenu de l'onglet Planning — isolé pour que son chargement ne retienne pas la coquille.
 *
 * Une seule personne à afficher → rendu à plat : on charge SON planning tout de suite, il n'y a
 * pas d'accordéon à déplier. Sinon on ne charge que « qui a un planning » (repère de la ligne
 * repliée) ; les blocs partent à l'ouverture (`loadPlanning`). Sans ça, dérouler 19 noms
 * embarquerait les blocs des 19 dans le premier rendu.
 */
async function PlanningTab({
  members,
  profileId,
  superadmin,
}: {
  members: PlanningMember[]
  profileId: string
  superadmin: boolean
}) {
  const single = members.length === 1
  const [data, owners] = await Promise.all([
    single ? getPlanning(members[0].id) : Promise.resolve(null),
    single ? Promise.resolve(new Set<string>()) : getPlanningOwners(members.map((m) => m.id)),
  ])
  // On ne modifie jamais SON propre planning (préparé par un rôle au-dessus) ; le superadmin
  // fait exception. La RLS 0043/0061 + `requireCanEdit` restent la vraie défense — `canEdit`
  // n'est qu'optimiste côté UI.
  const entries: PlanningEntry[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    hasPlanning: single ? (data?.exists ?? false) : owners.has(m.id),
    canEdit: superadmin || m.id !== profileId,
  }))
  return <PlanningTemplate entries={entries} data={data} />
}

/**
 * Contenu de l'onglet To-do — même raison d'être que `PlanningTab`.
 *
 * Une seule personne à afficher → rendu à plat : on charge SA liste tout de suite, il n'y a pas
 * d'accordéon à déplier. Sinon on ne charge que les COMPTEURS (repère de la ligne repliée) ;
 * les tâches partent à l'ouverture (`loadTodos`). Sans ça, dérouler 19 noms embarquerait les
 * tâches des 19 dans le premier rendu.
 */
async function TodoTab({
  members,
  profileId,
}: {
  members: PlanningMember[]
  profileId: string
}) {
  const single = members.length === 1
  const [todos, counts] = await Promise.all([
    single ? getTodos(members[0].id) : Promise.resolve([]),
    single ? Promise.resolve(new Map<string, number>()) : getTodoCounts(members.map((m) => m.id)),
  ])
  const entries: TodoEntry[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    openCount: counts.get(m.id) ?? 0,
    hasPlanningPage: m.hasPlanningPage,
  }))
  return <TodosTemplate entries={entries} todos={single ? todos : null} profileId={profileId} />
}

