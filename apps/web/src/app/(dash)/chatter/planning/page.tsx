import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getPlanning, getPlanningMembers } from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { PlanningSkeleton } from '@/features/planning/components/planning-skeleton'
import { MemberSelect } from '@/features/planning/components/member-select'
import { getTodos } from '@/features/todos/services/get-todos'
import { TodosTemplate } from '@/features/todos/TodosTemplate'
import { TodosSkeleton } from '@/features/todos/components/todos-skeleton'
import { TodosTabs } from '@/features/todos/components/todos-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAccess } from '@/lib/auth'
import type { PlanningMember } from '@/features/planning/types'

/**
 * Deux onglets sur la même page (`?vue=`) : le planning journalier et la to-do personnelle.
 * Le sélecteur `?membre=` est COMMUN aux deux (superadmin → tout, superadmins compris ;
 * admin → managers/sous-managers ; manager → ses sous-managers directs ; sous-manager →
 * personne). Droits distincts : on n'édite pas SON planning (sauf superadmin), mais on gère
 * toujours SA to-do (spec 2026-07-20).
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

  // Kickoff SANS await : le sélecteur est un widget client (useRouter) qui a besoin de
  // `members` — tout le composite streame dans un seul boundary. `[]` pour sous-manager.
  const membersPromise = getPlanningMembers(profile.baseRole)

  return (
    <div className="flex flex-col gap-6">
      {/* `h1` HORS du `<Suspense>` : il ne dépend d'aucune donnée async (juste le rôle, déjà
          résolu par `requireAccess`) et doit rester affiché pendant tout le streaming — sinon
          titre + sélecteur + onglets disparaissent puis réapparaissent (clignotement). Seuls
          le sélecteur (dépend de `membersPromise`) et le contenu des onglets restent dans le
          boundary ; leur silhouette de secours (ci-dessous) enchaîne sans saut visible avec
          celle de `loading.tsx`. */}
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
            {vue === 'todo' ? <TodosSkeleton /> : <PlanningSkeleton />}
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
  // Personnes gérables (hors soi). S'il n'y en a aucune → pas de sélecteur (members vide),
  // on ouvre le sien. SOI-MÊME en tête. `role: ''` = pas de suffixe de rôle dans le libellé.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const members: PlanningMember[] = others.length
    ? [{ id: profileId, name: `${selfName} (moi)`, role: '', hasPlanningPage: true }, ...others]
    : []
  const target = membre && members.some((m) => m.id === membre) ? membre : profileId
  // Édition du PLANNING : on ne modifie jamais le sien (préparé par un rôle au-dessus) ; le
  // superadmin fait exception. RLS 0043/0061 + requireCanEdit = la vraie défense.
  const canEdit = superadmin || target !== profileId
  // La to-do, elle, est TOUJOURS gérée par son porteur — pas de flag symétrique (spec §1).
  const targetMember = members.find((m) => m.id === target)
  const targetName = target === profileId ? selfName : (targetMember?.name ?? '')

  // Un seul des deux onglets est actif à la fois (`?vue=`) : on ne charge — et ne construit
  // l'élément — que celui-là. Sans ça, `getTodos` devient une dépendance dure du planning
  // journalier (si le code arrive en production avant la migration 0067, elle lève et fait
  // tomber toute la page, alors que seul l'onglet To-do aurait dû casser) et chaque affichage
  // paie une requête + un rendu serveur complet pour un onglet que personne n'a demandé. Le
  // `<Tabs>` de `TodosTabs` ne pose pas de problème côté client : Radix ne rend dans le DOM que
  // le contenu de l'onglet actif (`Presence` de `@radix-ui/react-tabs`, pas de `forceMount`
  // posé ici) — mais ça ne joue qu'après coup, une fois le RSC déjà produit ; encore faut-il ne
  // pas construire l'élément de l'onglet inactif en amont.
  const planningNode =
    vue === 'planning' ? <PlanningTemplate data={await getPlanning(target)} canEdit={canEdit} /> : null
  const todoNode =
    vue === 'todo' ? (
      <TodosTemplate
        todos={await getTodos(target)}
        profileId={target}
        targetName={targetName}
        isSelf={target === profileId}
        targetHasAccess={targetMember?.hasPlanningPage ?? true}
      />
    ) : null

  return (
    <div className="flex flex-col gap-6">
      {/* Le sélecteur vit AU-DESSUS des onglets : Radix démonte le contenu de l'onglet
          inactif, donc un sélecteur logé dans l'en-tête du planning disparaîtrait dès qu'on
          bascule sur la to-do. Le `h1` « Planning », lui, est monté par `PlanningPage`
          (hors boundary, cf. plus haut) — pas ici. */}
      {members.length > 0 && (
        <div className="flex justify-end">
          <MemberSelect members={members} value={target} />
        </div>
      )}
      <TodosTabs vue={vue} planning={planningNode} todo={todoNode} />
    </div>
  )
}
