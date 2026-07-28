# To-do — pile de noms dépliables (design)

## 1. État des lieux

La to-do personnelle est le 2ᵉ onglet de `/chatter/planning` (`?vue=todo`). Elle affiche **une
seule liste à la fois** : celle de la personne désignée par `?membre=` (à défaut, la sienne).

Le planning journalier et le dashboard sont passés le 2026-07-26 à un autre affichage — **tous les
noms consultables empilés, un par ligne, dépliables sur leur contenu**. La to-do est restée sur
l'ancien modèle. Ce document décrit son alignement.

Trois briques sont déjà partagées et n'ont pas à être réécrites :

| Brique | Fichier | Utilisée par |
|---|---|---|
| Pile de noms / accordéons | `apps/web/src/components/members-accordion.tsx` | planning, dashboard |
| Markup repliable | `apps/web/src/components/collapsible-section.tsx` | + la to-do |
| Règles de roster | `apps/web/src/lib/roster.ts` | planning, dashboard |

**Une duplication subsiste**, et c'est le second objet de ce document.
`features/planning/components/planning-members.tsx` et
`features/reports/components/reports-members.tsx` sont identiques au nom près sur ~35 lignes : le
type `Panel`, le jeton de course `reqRef`, la fonction `load`, le `settle`, le `try/catch` et
**la même chaîne d'erreur mot pour mot**. Seuls diffèrent l'action appelée, le nom du champ de
payload, le repère, la forme du squelette et le composant de panneau.

Brancher la to-do sans rien faire produirait une **troisième copie**. Le commentaire de
`planning-members.tsx` documente déjà le coût de cette situation : un défaut de rechargement après
mutation, trouvé sur le Dashboard à l'audit du 2026-07-27, évité sur le planning parce que
quelqu'un y a repensé — pas parce que le code l'empêchait.

## 2. Décisions

| Question | Décision | Conséquence assumée |
|---|---|---|
| Sa propre liste dans la pile | **Repliée comme les autres**, en tête | Un clic pour accéder à sa to-do en arrivant |
| Repère de la ligne repliée | **Nombre de tâches non terminées** (`todo` + `in_progress`) | Une requête d'agrégat en plus au premier rendu |
| Duplication | **Extraire la machine à états maintenant** et rebrancher les trois dessus | On touche deux composants livrés en production le 2026-07-27 |
| Droits | **Inchangés** — chacun gère sa liste | Le périmètre de *visibilité* s'aligne sur le planning, pas les droits d'écriture |

**Libellé du repère : « 4 à traiter », pas « 4 en cours ».** « En cours » est déjà le libellé du
statut `in_progress` et une section de la liste ; le réutiliser pour désigner l'ensemble des
tâches non terminées ferait lire deux choses différentes sous le même mot. Liste vide ou
entièrement terminée → **« Rien »**.

## 3. Ce qui change à l'écran

- Sans filtre, **tous les noms consultables sont empilés**, un par ligne, soi en tête, tous
  repliés. Un seul panneau ouvert à la fois (`MembersAccordion` impose déjà cette règle).
- Le sélecteur `?membre=` devient un **filtre**, comme sur le planning. Aujourd'hui il désigne la
  cible ; demain, choisir quelqu'un affiche **sa liste seule, à plat, sans accordéon**, et ne rien
  choisir empile tout le monde. Les deux onglets de la page se comportent enfin de la même façon —
  `page.tsx` documente aujourd'hui cette asymétrie comme une exception à expliquer.
- L'avertissement « cette personne n'a pas accès à la page Planning » passe **par ligne** au lieu
  d'être global (il dépend de la personne, pas de la page).

Le contenu du panneau ouvert est **exactement l'écran actuel** (`TodosView`) : sections repliables
par statut, badge de statut cliquable, priorité en icône, ajout rapide par section. Rien n'y change.

## 4. Architecture — la machine à états partagée

Nouveau fichier `apps/web/src/hooks/use-member-panel.ts` (le dossier existe déjà, avec
`use-mobile.tsx`).

```ts
useMemberPanel<T>(load: (input: { profileId: string }) => Promise<ActionResult<T>>)
  → { panel: { id: string; loading: boolean; data?: T; error?: string } | null,
      open: (id: string) => void }
```

Le hook porte ce que les deux fichiers écrivent déjà à l'identique :

- l'état du panneau ouvert (un seul à la fois, donc un seul état) ;
- le **jeton par requête** (`reqRef`) : deux appels sur la *même* personne — rouvrir vite, ou
  recharger après mutation pendant qu'un chargement vole encore — ne doivent pas laisser gagner le
  plus ancien. Seule la dernière requête émise a le droit d'écrire ;
- le `try/catch` d'échec de **transport** (`runAction` n'a pas pu renvoyer d'`ActionResult`) : sans
  lui, la promesse rejette sans être captée et le panneau reste en squelette à vie ;
- la chaîne d'erreur correspondante, désormais en **un seul exemplaire**.

Chaque feature ne garde que ce qui lui est propre : le repère (`hint`), la forme du squelette, et
le composant de panneau. `planning-members.tsx` et `reports-members.tsx` tombent de ~85 lignes à
~30 ; `todos-members.tsx` naît à ~30 au lieu de 85.

L'extraction est **mécanique** : un `diff` des deux fichiers, aux identifiants près, ne laisse que
les cinq points de variation listés ci-dessus.

## 5. Données

**Premier rendu.** Le roster vient de `getPlanningMembers` — déjà en place, déjà commun aux deux
onglets. S'y ajoute un service d'agrégat :

```ts
getTodoCounts(profileIds: string[]): Promise<Map<string, number>>
```

Il calque `getReportDays` (`features/reports/services/get-reports.ts`) : **`fetchAll`**, jamais un
`select` nu, avec `.order()` sur la PK complète. La raison est écrite dans ce précédent et vaut
ici : N personnes × leurs tâches peut dépasser la limite PostgREST de 1000 lignes, **qui tronque
en silence** (cf. `docs/guidelines-data-loading.md`). Une entrée par id demandé, même à zéro.

**Aucun contenu de liste n'est transporté au premier rendu** — seulement les compteurs. Sans ça,
dérouler vingt noms embarquerait les tâches des vingt.

**À l'ouverture.** Nouvelle Server Action `loadTodos` dans `features/todos/actions.ts`, calquée sur
`loadPlanning` : `runAction` + `z.object({ profileId: z.uuid() })` + handler `getTodos(profileId)`.
Elle suit la convention du fichier — contrôle du droit **en tête du handler**, pas dans `guard`
(`noGuard`), pour les raisons déjà documentées en tête de `todos/actions.ts`.

**Après mutation — le point sensible.** `TodosView` s'appuie aujourd'hui sur `revalidatePath` et
`useOptimistic`. En pile, `revalidatePath` repatche l'arbre serveur, mais le contenu du panneau
vient d'une Server Action, pas de cet arbre : il resterait sur l'instantané d'avant l'écriture.
Il faut donc un **rechargement explicite du panneau ouvert** après création, changement de statut
et suppression — le `onChanged` du planning. C'est précisément le défaut trouvé sur le Dashboard à
l'audit du 2026-07-27 ; on le traite d'emblée.

Le compteur de la ligne repliée, lui, est servi par l'arbre serveur : `revalidatePath` suffit à le
rafraîchir, aucun traitement particulier.

## 6. Droits — inchangés

**Aucune migration, aucune modification de RLS, aucune modification de garde.**
`can_write_todo_of` (0067) et `requireCanWriteTodo` restent telles quelles.

Sur `todos`, **lecture = écriture** : la RLS `todos_select` s'appuie sur `can_write_todo_of`. Le
roster du planning est déjà inclus dans le périmètre écrivable de la to-do, vérifié rôle par rôle
contre `requireCanWriteTodo` :

| Viewer | Roster `getPlanningMembers` | `requireCanWriteTodo` | Cohérent |
|---|---|---|---|
| superadmin | superadmins, admins, managers, sous-managers | tout le monde | ✅ |
| admin | managers, sous-managers | tout sauf admin/superadmin | ✅ |
| manager | ses sous-managers directs | ses sous-managers directs | ✅ |
| sous-manager | personne | sa propre liste | ✅ |

**Aucune ligne de la pile ne peut donc échouer à l'ouverture pour cause de droit.**

Corollaire : `getTodoCounts` s'exécute sous RLS. Une personne dont la to-do n'est pas lisible ne
remonte aucune ligne → compteur 0 → « Rien ». Pas d'erreur affichée, pas de fuite d'information.
Cette dégradation est silencieuse **par construction** ; elle est acceptable tant que le tableau
ci-dessus tient. Si l'un des deux périmètres bouge un jour sans l'autre, le symptôme sera « tout le
monde à Rien », pas une erreur — à garder en tête au débogage.

## 7. Découpage technique

**Créés**

- `apps/web/src/hooks/use-member-panel.ts`
- `apps/web/src/features/todos/components/todos-members.tsx`
- `apps/web/src/features/todos/services/get-todo-counts.ts`

**Modifiés**

- `apps/web/src/features/planning/components/planning-members.tsx` — passe sur le hook
- `apps/web/src/features/reports/components/reports-members.tsx` — passe sur le hook
- `apps/web/src/features/todos/actions.ts` — ajout de `loadTodos`
- `apps/web/src/features/todos/TodosTemplate.tsx` — pile ou vue à plat, calqué sur `PlanningTemplate`
- `apps/web/src/features/todos/types.ts` — ajout de `TodoEntry`
- `apps/web/src/app/(dash)/chatter/planning/page.tsx` — `TodoTab` construit les entrées ; le
  sélecteur devient un filtre sur les deux onglets

## 8. Hors périmètre

- Le **kanban** et le champ **release** restent en pause (blocs commentés, colonne conservée en
  base). Ce chantier ne les réactive pas et ne les supprime pas.
- Aucun changement au contenu du panneau (`TodosView`, `TodosList`, `todo-row`, `todo-dialog`).
- Aucun changement de droits, aucune migration.
- Pas de pagination : le volume reste de quelques dizaines de lignes par personne.

## 9. Risques et cas limites

| Risque | Traitement |
|---|---|
| Régression sur planning / dashboard, livrés en prod le 2026-07-27, **sans aucun test** | L'extraction est mécanique et vérifiée par `diff` ; typecheck + build + repasse manuelle des **trois** piles sur la préprod UAT |
| Panneau figé en squelette sur coupure réseau | Le `try/catch` de transport, désormais unique, dans le hook |
| Panneau périmé après une mutation | Rechargement explicite (§5) — le bug du Dashboard |
| Une seule personne dans le roster (sous-manager) | Rendu à plat, sans accordéon — `PlanningTemplate` traite déjà ce cas, `TodosTemplate` le copie |
| `?membre=` inconnu ou hors périmètre | `resolveFilter` le ramène à `null` (pas de filtre) — comportement déjà partagé |
| Liste vide | Repère « Rien » ; le panneau ouvert affiche l'état vide actuel de `TodosList` |

## 10. Vérification

Il n'existe **aucun test sur `apps/web`** (seul `packages/core` en a). Ce chantier n'introduit
aucune logique de domaine — le hook est de la mécanique React, les services sont des requêtes —
donc rien à ajouter dans `packages/core`.

La vérification est donc :

1. `pnpm --filter @glagency/web typecheck` et `lint` — 0 erreur ;
2. `pnpm --filter @glagency/web build` — le build complet, qui seul attrape les erreurs de
   prerender (cf. leçons de release) ;
3. repasse **manuelle sur la préprod UAT** des trois piles : planning, dashboard **et** to-do —
   ouvrir, refermer, rouvrir vite, muter puis vérifier que le panneau reflète la mutation.

Le point 3 n'est pas facultatif : c'est le seul filet qui couvre la refacto des deux composants
existants.
