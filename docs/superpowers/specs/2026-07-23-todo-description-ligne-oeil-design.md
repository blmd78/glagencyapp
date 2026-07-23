# To-do : description croppée dans la ligne + œil de consultation

**Date** : 2026-07-23
**Page** : `/chatter/planning?vue=todo` — vue liste uniquement (le kanban en pause n'est pas touché).
**Contexte** : la description d'une tâche n'est visible aujourd'hui que dans le dialog
d'édition. On veut la lire d'un coup d'œil sans passer par « Modifier ».

## 1. Description croppée dans la ligne (`todo-row.tsx`)

- Après le titre, **sur la même ligne** : la description en `text-muted-foreground`,
  tronquée (`truncate`). Choix validé contre l'alternative « 2e ligne sous le titre »
  pour garder la densité actuelle (1 ligne par tâche).
- Les sauts de ligne saisis sont **aplatis** dans cet aperçu (première portion du texte
  seulement — c'est un extrait, pas la mise en forme).
- **Colonne titre à largeur fixe** (ajout validé après premier essai) : quand une
  description suit, le bloc icône de type + titre occupe une largeur constante
  (`w-72`, plafonnée à 50 % sur écran étroit) — tous les titres « s'arrêtent au même
  endroit » et les aperçus de description démarrent alignés d'une ligne à l'autre.
  L'icône de type fait partie de la colonne (elle est conditionnelle : la laisser
  dehors décalerait les lignes sans type). Titre plus long que la colonne → tronqué.
- Tâche sans description : pas de colonne, le titre reprend toute la largeur — la
  ligne reste identique à aujourd'hui (aucun placeholder).

## 2. Œil = Popover de consultation (nouveau `todo-peek.tsx`)

- Icône `Eye` (lucide), bouton ghost du même gabarit que crayon/poubelle (`size-7` /
  icône `size-3.5`), placée **avant le crayon** dans le groupe d'actions.
- **Toujours visible**, sur toutes les lignes — y compris sans description (choix
  validé : position constante des actions, prime sur un popover parfois presque vide).
- Au clic, `Popover` shadcn (déjà dans le kit, `components/ui/popover.tsx`), ~320 px,
  ancré à l'œil, contenant :
  - titre + icône de type (mêmes `TYPE_ICON`/`TYPE_CLASS` que la ligne) ;
  - pastille de statut (`STATUS_CLASS`, libellé écrit) + priorité (icône
    `PRIORITY_ICON` + libellé `priorityLabel`) ;
  - **description complète** en `whitespace-pre-wrap` (les sauts de ligne saisis sont
    conservés — raison d'être du « pas de trim » du dialog), `max-h` + scroll vertical
    si très longue ;
  - si `description === null` : « Aucune description » en muted ;
  - pied : auteur (`createdByName`, sinon « Claude ») · date de création formatée.
- **Lecture seule** : aucune action dans le popover (modifier reste sur le crayon).
  Fermeture par clic ailleurs ou Échap (comportement Popover natif).
- Accessibilité : `aria-label` explicite sur le trigger (« Voir le détail »).

## Périmètre / non-changements

- Fichiers touchés : `todo-row.tsx` (ligne + intégration) + nouveau
  `features/todos/components/todo-peek.tsx`.
- Aucune migration, aucun changement de service ni de type : `Todo.description` est
  déjà chargée par `get-todos.ts`.
- `todo-card.tsx` (kanban en pause) inchangé.
