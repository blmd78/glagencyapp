'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
// RELEASE EN PAUSE : import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createTodo, deleteTodo, setTodoStatus } from '../actions'
import { type Todo, type TodoStatus } from '../types'
// KANBAN EN PAUSE : import { TODOS_AFFICHAGE_COOKIE } from '../types'
import { TodoDialog } from './todo-dialog'
import { TodosList } from './todos-list'
// KANBAN EN PAUSE (2026-07-20) — imports à rétablir avec la bascule (cf. plus bas) :
// import { Columns3, List } from 'lucide-react'
// import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
// import { TodosBoard } from './todos-board'

// KANBAN EN PAUSE (2026-07-20) — la chaîne de la préférence d'affichage est entièrement
// débranchée : plus personne n'écrit ce cookie et `page.tsx` ne le lit plus. Le nom est
// conservé comme graine de réactivation. À la reprise, il faudra rétablir la lecture côté
// serveur en plus des blocs commentés ci-dessous.
// Idiome de référence pour cette lecture : SIDEBAR_COOKIE_NAME / SIDEBAR_COOKIE_MAX_AGE
// (components/ui/sidebar.tsx). Pas de localStorage (script
// bloquant anti-flash) ni de `?affichage=` (préférence perso, pas à partager, l'URL porte
// déjà `?vue=` et `?membre=`).
// const TODOS_AFFICHAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 an

/**
 * Porte l'état de la to-do : état optimiste, dialog, `move()`, `remove()`, `releases`, filtre
 * par release. Seule la vue LISTE est rendue — le kanban et sa bascule sont en pause depuis le
 * 2026-07-20 (blocs commentés ci-dessous, composants et dépendance intacts). Remonté par
 * `key={profileId}` côté
 * `TodosTemplate.tsx` : changer de personne réinitialise tout cet état d'un coup (filtre,
 * dialog, saisie de l'ajout rapide) plutôt que de laisser des morceaux de l'ancienne personne
 * s'appliquer par erreur à la nouvelle liste.
 */
export function TodosView({
  todos,
  profileId,
  targetHasAccess,
  label,
}: {
  todos: Todo[]
  /** Porteur de la liste (cible du sélecteur) — jamais le spectateur. */
  profileId: string
  targetHasAccess: boolean
  /** Libellé de la ligne d'en-tête (« Ma to-do » / « To-do de X ») — composé par TodosTemplate. */
  label: string
}) {
  const router = useRouter()
  // État optimiste : la carte/ligne change AVANT la réponse serveur. Un échec rejoue
  // l'état serveur (React réconcilie à la fin de la transition) + toast d'erreur.
  const [optimistic, applyOptimistic] = useOptimistic(
    todos,
    (state: Todo[], move: { id: string; status: TodoStatus }) =>
      state.map((t) =>
        t.id === move.id
          ? {
              ...t,
              status: move.status,
              // Posé EN MÊME TEMPS que le statut : `groupByStatus` trie « Terminé » par doneAt
              // décroissant — un doneAt absent partirait en queue, donc la carte déposée dans
              // « Terminé » atterrirait en bas puis sauterait en tête au rafraîchissement serveur.
              doneAt: move.status === 'done' ? new Date().toISOString() : null,
            }
          : t,
      ),
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  // KANBAN EN PAUSE : const [affichage, setAffichageState] = useState<TodoAffichage>(initialAffichage)
  // RELEASE EN PAUSE — dérivation des releases (datalist du dialog + filtre), à rétablir :
  // const releases = useMemo(
  //   () => [...new Set(todos.map((t) => t.release).filter((r): r is string => !!r))].sort(),
  //   [todos],
  // )
  // Filtre de VUE (pas de searchParams) : il ne change pas la donnée récupérée côté serveur et
  // n'a pas vocation à être partagé par lien (guidelines §6). Vit ici, et non dans
  // todos-board.tsx : c'est TodosView qui distribue `optimistic` aux deux feuilles de
  // présentation, donc le seul endroit d'où filtrer pour qu'il s'applique aux deux vues.
  // Sécurisé par le `key={profileId}` du composant (voir la doc de `TodosView` ci-dessus) :
  // sans lui, changer de personne pourrait laisser une release qui n'existe pas chez la
  // nouvelle liste sélectionnée, filtrant silencieusement toutes les tâches sans qu'aucun
  // contrôle visible ne permette de comprendre pourquoi ni de revenir en arrière (le `Select`
  // ne se rend que si `releases.length > 0`).
  // RELEASE EN PAUSE — filtre de vue, à rétablir avec le sélecteur ci-dessous :
  // const [release, setRelease] = useState<string>('all')
  // const visible = useMemo(
  //   () =>
  //     release === 'all'
  //       ? optimistic
  //       : optimistic.filter((t) => (release === 'none' ? !t.release : t.release === release)),
  //   [optimistic, release],
  // )

  // KANBAN EN PAUSE — écriture du cookie, à rétablir avec la bascule :
  // const setAffichage = (next: TodoAffichage) => {
  //   setAffichageState(next)
  //   document.cookie = `${TODOS_AFFICHAGE_COOKIE}=${next}; path=/; max-age=${TODOS_AFFICHAGE_COOKIE_MAX_AGE}`
  // }

  const move = (todo: Todo, status: TodoStatus) => {
    if (todo.status === status) return
    startTransition(async () => {
      applyOptimistic({ id: todo.id, status })
      // Valeur ABSOLUE du statut (jamais un déplacement relatif) : deux drags concurrents
      // convergent au lieu de s'additionner.
      const res = await setTodoStatus({ id: todo.id, profileId, status })
      if (!res.success) {
        toast.error(res.error)
        // Alignée sur remove() ci-dessous : le serveur a pu refuser parce que la tâche
        // n'existe plus (BusinessError). Sans resynchronisation, la carte fantôme resterait
        // affichée dans sa colonne/ligne de destination optimiste au lieu de réapparaître dans
        // sa colonne d'origine.
        router.refresh()
      }
    })
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (todo: Todo) => {
    setEditing(todo)
    setDialogOpen(true)
  }
  const remove = async (todo: Todo) => {
    const res = await deleteTodo({ id: todo.id, profileId })
    // Pas de toast de succès : la spec design de la feature réserve le toast à l'ÉCHEC — une
    // suppression réussie se voit déjà à l'écran (la ligne/carte disparaît), un toast à chaque
    // geste réussi est du bruit.
    if (res.success) return
    // Échec métier (ex. tâche déjà supprimée par quelqu'un d'autre) : l'action lève avant le
    // `revalidatePath`, donc `todos` reste périmé. `router.refresh()` resynchronise la liste
    // avec le serveur (même pattern que relance-checklist.tsx) pendant que le ConfirmDialog
    // affiche l'erreur.
    router.refresh()
    return res.error // string → le ConfirmDialog reste ouvert et affiche l'erreur
  }
  // Ajout rapide : défauts priorité moyenne, sans type ni release — ces champs restent dans le
  // dialog complet. Le STATUT vient de la section où le champ a été rempli (chaque panneau de
  // TodosList a son propre « + Créer ») — pas de défaut caché ici, sinon une tâche créée depuis
  // « En cours » naîtrait « À faire ». Pas d'état optimiste dédié : `createTodo` revalide le
  // path au succès, la nouvelle ligne arrive avec le prochain rendu serveur.
  const quickAdd = (title: string, status: TodoStatus) =>
    createTodo({ profileId, title, description: null, type: null, priority: 2, release: null, status })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {!targetHasAccess && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          Cette personne n’a pas accès à la page Planning : elle ne verra pas cette liste tant
          que « Planning » n’est pas coché dans Membres.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nouvelle tâche
        </Button>
        {/* RELEASE EN PAUSE (2026-07-20) — filtre retiré en même temps que le champ du dialog.
            La colonne existe toujours en base : les valeurs déjà saisies sont conservées et
            réapparaîtront telles quelles à la réactivation (décommenter ici, dans
            `todo-dialog.tsx` et dans `todo-row.tsx`).

        {releases.length > 0 && (
          <Select value={release} onValueChange={setRelease}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les releases</SelectItem>
              <SelectItem value="none">Sans release</SelectItem>
              {releases.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        */}
        {/* KANBAN EN PAUSE (2026-07-20) — la vue liste est la seule exposée pour l'instant.
            Réactivation = décommenter ce bloc, la branche de rendu plus bas, et les imports
            (ToggleGroup, List/Columns3, TodosBoard) en tête de fichier. Rien d'autre à
            reconstruire : `todos-board.tsx`, `todo-card.tsx`, `todo-column.tsx`, la dépendance
            dnd-kit, le cookie `todos_affichage` et `setAffichage` sont intacts.

        <ToggleGroup
          className="ml-auto"
          type="single"
          size="sm"
          value={affichage}
          onValueChange={(next) => {
            // Un ToggleGroup single peut renvoyer '' (clic sur l'item déjà actif) : ignoré,
            // la bascule garde toujours une valeur sélectionnée.
            if (next) setAffichage(next as TodoAffichage)
          }}
        >
          <ToggleGroupItem value="liste" aria-label="Vue liste">
            <List className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban" aria-label="Vue kanban">
            <Columns3 className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
        */}
      </div>
      {/* Kanban en pause : rendu inconditionnel de la liste. Version d'origine à restaurer —
          {affichage === 'liste' ? <TodosList … /> : <TodosBoard todos={visible} onEdit={openEdit}
          onDelete={remove} onMove={move} />} */}
      <TodosList todos={optimistic} onEdit={openEdit} onDelete={remove} onMove={move} onQuickAdd={quickAdd} />
      <TodoDialog
        profileId={profileId}
        todo={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
