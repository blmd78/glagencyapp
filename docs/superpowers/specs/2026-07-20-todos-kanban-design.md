# Spec — To-do personnelle (onglet du Planning)

**Date** : 2026-07-20 · **Statut** : implémenté (plan `docs/superpowers/plans/2026-07-20-todos-kanban.md`)
**Branche de travail** : à créer depuis `develop` (`feature/todos-kanban`)

## Objectif

Remplacer le suivi informel dans Discord (où des sujets passent à la trappe) par une **to-do
dans l'app** : à faire / en cours / fini. Chaque encadrant a **sa** liste ; un supérieur peut y
déposer une tâche. La liste de Benoit sert aussi de roadmap de dev : **Claude y écrit
directement** (en SQL), pour que ce qui est décidé en session atterrisse dans une liste plutôt
que dans un fil de discussion.

Le champ **release cible** fait le lien avec le
[système de versioning](./2026-07-19-release-versioning-design.md) (`v1.4`…), sans couplage
technique : le `CHANGELOG.md` de release-please reste la trace de ce qui **est sorti**.

## Décisions validées (brainstorming 2026-07-20)

| Sujet | Choix |
|---|---|
| Emplacement | **Onglet de la page Planning** (`/chatter/planning`) — bascule Journalier ↔ To-do |
| Portée | **Une to-do par personne**, comme le planning (une ligne par tâche, `profile_id`) |
| Sélecteur | **Celui du planning, partagé** entre les deux onglets — plus les **superadmins**, visibles des seuls superadmins |
| Accès | **Compris dans le droit « Planning »** — pas de slug ni de case Membres en plus (§1) |
| Face marketing | **Hors v1** — la page Planning n'existe que côté chatteurs |
| Forme | **Deux vues** : LISTE (par défaut) et KANBAN 3 colonnes, avec bascule (demande Benoit 2026-07-20) |
| Choix de la vue | **Cookie** `todos_affichage` lu côté serveur — préférence durable, zéro flash au premier rendu |
| Bascule | **Bouton à 2 icônes** (liste / colonnes), PAS des onglets : la page en a déjà au-dessus |
| Déplacement | **Drag & drop** (dnd-kit) + `useOptimistic` |
| Ordre dans une colonne | **Automatique** (priorité puis date) — pas de réordonnancement manuel |
| Champs | titre, description, priorité, **type** (optionnel), **release cible** (optionnel) |
| Types | **3** : `feature` / `bug` / `maintenance` — facultatifs (pas de « autre ») |
| Realtime | **Non** — revalidation à la mutation |
| Écriture par Claude | **SQL direct** (service role, MCP Supabase) dans la liste de Benoit |

### Ce qui change par rapport à la première version de cette spec

La to-do était un **board admin unique** dans un onglet séparé, découpé par face
(chatteurs / marketing). Elle devient une **liste par personne greffée sur le Planning**, parce
que les managers en ont besoin aussi et que le Planning porte déjà le sélecteur de personne et
le modèle de droits hiérarchique. Conséquences :
- la colonne `workspace` (chatter/marketing/global) **disparaît** : la page Planning n'existe
  que côté chatteurs, le découpage par face n'a plus d'objet ;
- l'onglet dédié `/chatter/todos` **disparaît** au profit d'un onglet interne ;
- le `type` devient **facultatif** : imposer une taxonomie de dev (`bug`/`feature`) à un manager
  qui note « rappeler Marco » n'a pas de sens.

## 1. Emplacement, accès & droits

### Onglets

La page `/chatter/planning` porte deux onglets : **Journalier** (l'existant) et **To-do**.
L'onglet actif vit dans l'URL (`?vue=todo`), comme la personne sélectionnée (`?membre=<uuid>`,
`planning/page.tsx:17`) — les deux se combinent, l'URL reste partageable et le rendu serveur.
Composant `components/ui/tabs.tsx` (déjà présent, utilisé par `marketing-liens` et
`marketing-social`).

**Le sélecteur de personne est commun aux deux onglets** : changer de personne garde l'onglet
courant, changer d'onglet garde la personne.

### Qui a une to-do

**La to-do est comprise dans le droit « Planning », pas un droit à part.** Aucun slug `todo`
n'est créé, `PAGE_SLUGS` n'est pas touché et **aucune case ne s'ajoute au dialog Membres** :
cocher « Planning » ouvre les deux onglets, point.

L'accès à la page est donc inchangé : `requireAccess('planning')` puis blocage explicite des
chatteurs (`planning/page.tsx:19-22`). Pour un **manager ou sous-manager**, donner une to-do =
**cocher « Planning » dans Membres** ; les admins et superadmins passent `requireAccess` sans
slug (`lib/auth/index.ts:82`) et en ont donc toujours une. Décision assumée : quatre managers
chatteurs (Akari, Chérif, Gael, Marco) n'ont pas ce slug aujourd'hui et n'auront pas de to-do
tant qu'il n'est pas coché. Aucune règle d'accès nouvelle n'est introduite.

⚠️ **Le sélecteur liste par rôle, pas par slug** (`get-planning.ts:104-107`) : ces quatre
managers y apparaissent quand même, et on peut leur déposer une tâche qu'ils ne verront pas.
Mitigation v1 : `getPlanningMembers` remonte aussi `pages`, et l'onglet To-do affiche un
bandeau d'avertissement (« cette personne n'a pas accès à la page Planning — elle ne verra pas
cette liste ») quand la cible est un manager/sous-manager sans le slug. Pas de filtrage du
sélecteur : il est partagé avec l'onglet Journalier, dont le comportement ne doit pas changer.

### Qui écrit dans la to-do de qui

Le modèle du planning est repris **avec une différence assumée** : au planning, personne
n'édite le sien (sauf superadmin) ; une to-do qu'on ne peut pas cocher soi-même n'aurait aucun
sens, donc **chacun gère la sienne**.

| Appelant | Écrit dans sa propre to-do | Écrit dans celle de |
|---|---|---|
| superadmin | oui | **tout le monde**, superadmins compris |
| admin | oui | managers, sous-managers (pas les admins ni superadmins) |
| manager | oui | ses **sous-managers directs** |
| sous-manager | oui | personne |
| chatteur | — | — (pas d'accès à la page) |

**Un chatteur n'a jamais de to-do, ni comme auteur ni comme cible** : `can_edit_planning_of`
autoriserait un admin à écrire chez un chatteur, mais celui-ci n'a pas accès à la page — la
liste serait invisible. La fonction `can_write_todo_of` (§2) exige donc que **la cible soit un
encadrant**.

**Lecture = écriture.** Contrairement au planning, il n'existe pas de to-do en lecture seule :
`todos_select` utilise le même prédicat que les écritures, et le sélecteur ne propose que des
personnes sur lesquelles on peut écrire. Aucun flag `canWrite` n'est donc calculé côté page —
ce serait une branche morte. (Si un jour on veut « voir sans écrire », il faudra une fonction
`can_read_todo_of` distincte.)

Ces règles sont exactement `can_edit_planning_of(target)` (migration `0061`) **∪** « soi, si
l'on est encadrant », **∩** « la cible est un encadrant ».

### Superadmins dans le sélecteur

Aujourd'hui `getPlanningMembers` construit la liste par rôle en dur
(`services/get-planning.ts:93-100`) : un superadmin voit `admin`, `manager`, `sous-manager` —
**jamais les superadmins**. On ajoute `superadmin` à cette liste **pour le seul viewer
superadmin**, ce qui permet à un superadmin d'ouvrir la fiche d'un autre et d'y déposer une
tâche. Un admin ne voit toujours ni les admins ni les superadmins.

Côté base, rien à changer : `can_edit_planning_of` autorise déjà un superadmin sur **toute**
cible, lui-même et les autres superadmins compris (court-circuit `is_superadmin()`,
`0061_planning_manager_scope.sql:51-57`). La restriction était purement applicative.

⚠️ Ce changement affecte **aussi l'onglet Journalier** (même sélecteur) : un superadmin pourra
donc désormais ouvrir et éditer le planning d'un autre superadmin. C'est déjà ce que la RLS
autorise ; c'est un élargissement d'UI, pas de droits.

## 2. Données — migration `0067_todos.sql`

```sql
create table public.todos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'done')),
  -- Facultatif : sert la roadmap de dev, inutile pour une tâche opérationnelle.
  type        text check (type in ('feature', 'bug', 'maintenance')),
  -- Rang numérique et NON un libellé : un `order by` sur du texte trierait
  -- alphabétiquement (basse < haute < moyenne), soit un ordre faux et silencieux.
  priority    smallint not null default 2 check (priority in (1, 2, 3)),  -- 1 haute, 2 moyenne, 3 basse
  release     text,                                   -- cible libre : 'v1.4', null = non planifié
  created_by  uuid references public.profiles(id) on delete set null,
  -- Nom de l'auteur DÉNORMALISÉ (posé par les Server Actions) : la RLS de `profiles` (0054)
  -- ne laisse un manager lire que lui-même et ses rattachés, donc une jointure sur l'auteur
  -- renverrait null quand un admin dépose une tâche chez lui.
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);

-- Écrire dans une to-do : les règles du planning, plus la sienne (un encadrant gère sa liste).
-- La CIBLE doit être un encadrant : `can_edit_planning_of` autorise un admin sur un chatteur,
-- or un chatteur n'a pas accès à la page — sa to-do serait invisible et sans objet.
create or replace function public.can_write_todo_of(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
      select 1 from profiles t
      where t.id = target
        and t.role in ('superadmin', 'admin', 'manager', 'sous-manager')
    )
    and (
      public.can_edit_planning_of(target)
      or (target = (select auth.uid()) and exists (
            select 1 from profiles p
            where p.id = (select auth.uid())
              and p.role in ('superadmin', 'admin', 'manager', 'sous-manager')
          ))
    );
$$;
revoke all on function public.can_write_todo_of(uuid) from public;
grant execute on function public.can_write_todo_of(uuid) to authenticated;

alter table public.todos enable row level security;

create policy todos_select on public.todos for select to authenticated
  using ((select public.can_write_todo_of(profile_id)));
create policy todos_insert on public.todos for insert to authenticated
  with check ((select public.can_write_todo_of(profile_id)));
create policy todos_update on public.todos for update to authenticated
  using ((select public.can_write_todo_of(profile_id)))
  with check ((select public.can_write_todo_of(profile_id)));
create policy todos_delete on public.todos for delete to authenticated
  using ((select public.can_write_todo_of(profile_id)));

-- Toutes les lectures filtrent d'abord par personne, puis par statut.
create index todos_profile_status_idx on public.todos (profile_id, status);
-- Toute FK est indexée (convention 0055_fk_indexes.sql, « advisor 100 % vert »).
create index todos_created_by_idx on public.todos (created_by);

-- updated_at / done_at maintenus EN BASE : Claude écrit en SQL direct (§5), hors des
-- Server Actions — un maintien applicatif seul les laisserait périmés. INSERT compris :
-- une tâche créée directement en 'done' doit avoir son done_at.
create or replace function public.todos_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.done_at := case
    when new.status = 'done'
      then coalesce(case when tg_op = 'UPDATE' then old.done_at end, now())
    else null
  end;
  return new;
end;
$$;

create trigger todos_touch_trg before insert or update on public.todos
  for each row execute function public.todos_touch();
```

Conventions respectées :
- **`text` + `check`, jamais `create type … enum`** (règle projet) — ajouter une valeur plus tard
  = `drop constraint` + recréer, sans migration de données.
- Fonctions RLS **wrappées en `(select …)`** dans les policies : pattern initPlan déjà appliqué
  au repo (`0057_rls_initplan.sql`), évite la ré-évaluation par ligne.
- `profile_id` **non nullable**, `on delete cascade` : une to-do n'existe pas sans son porteur.
  (Contrairement à `plannings`, **pas** de contrainte `unique` : plusieurs tâches par personne.)
- `created_by` **nullable** avec `on delete set null` : les insertions de Claude passent par le
  service role et n'ont pas d'auteur applicatif. Effet de bord assumé : une tâche dont l'auteur
  a été supprimé s'affichera comme les siennes (« Claude ») — sans conséquence.
- `priority` est un **rang numérique** (1 haute, 2 moyenne, 3 basse), pas un libellé : le tri se
  fait alors par `order by priority` sans piège. Les libellés FR vivent dans une constante
  `PRIORITIES` de `features/todos/types.ts` (source unique côté affichage).
- `updated_at` et `done_at` sont maintenus par le **trigger** `todos_touch` — pas par les Server
  Actions. C'est indispensable parce que Claude écrit en SQL direct (§4) : un maintien applicatif
  laisserait `done_at` vide sur ses mises à jour et casserait le tri de la colonne Fini. Le
  trigger pose `done_at` au premier passage à `done`, le conserve tant que la carte y reste, et
  le remet à `null` si elle en ressort.

Application : `cd packages/db && supabase db push --db-url "$DATABASE_URL"` (UAT puis prod,
jamais `psql` à la main), puis régénérer `packages/db/src/types.ts`.

### Types de tâche (facultatifs)

| Valeur | Label FR | Couleur | Icône (lucide) |
|---|---|---|---|
| `feature` | Fonctionnalité | vert | `Sparkles` |
| `bug` | Bug | rouge | `Bug` |
| `maintenance` | Maintenance | ardoise | `Wrench` |

Sans type, la carte n'affiche aucun badge — c'est le cas normal d'une tâche opérationnelle.
`maintenance` = « travail qui ne change pas le produit visible » (dette, dépendances, infra,
tests, refacto) — défini **par inclusion**, ce qui en fait un type utile et non un fourre-tout.
Pas de valeur « autre » : un seau défini par exclusion devient un fond de tiroir et rend les
ratios illisibles.

**Pas d'alignement nominal sur les types de Conventional Commits** (`feat`, `fix`, `chore`…) :
la correspondance reste sémantique (une tâche `feature` donnera des commits `feat`), sans règle
automatique « type de tâche ⇒ bump de version ». Répliquer les dix types de la convention
importerait sur le board leur ambiguïté documentée, pour un bénéfice nul à 5 personnes.

## 3. Feature web

Structure (convention `app → feature(template) → composants`, `docs/guidelines-standard-feature.md`) :

```
apps/web/src/features/todos/
  types.ts                    # Todo, constantes STATUSES / TYPES / PRIORITIES, groupByStatus()
  schema.ts                   # Zod partagé client/serveur (création + édition + statut)
  actions.ts                  # 'use server' : createTodo / updateTodo / setTodoStatus / deleteTodo
  services/get-todos.ts       # getTodos(profileId) — client RLS
  TodosTemplate.tsx           # Server Component, zéro fetch, data en props
  components/
    todos-view.tsx            # 'use client' : état PARTAGÉ des deux vues — useOptimistic,
                               #   dialog, filtre par release, préférence d'affichage
    todos-tabs.tsx             # 'use client' : bascule Planning journalier ↔ To-do (`?vue=`)
    todos-list.tsx              # vue liste : 3 sections (À faire / En cours / Fini)
    todo-row.tsx                 # ligne de la vue liste
    todo-quick-add.tsx           # ajout rapide en bas de la section « À faire »
    todos-board.tsx              # 'use client' : DndContext + 3 colonnes
    todo-card.tsx                 # carte draggable (badge type si présent, priorité, release)
    todo-column.tsx               # colonne droppable + compteur
    todo-dialog.tsx                # RHF + zodResolver (création / édition)
    todos-skeleton.tsx             # silhouette de la to-do (fallback du Suspense de page.tsx)

apps/web/src/app/(dash)/chatter/planning/
  page.tsx                    # MODIFIÉ : lit ?vue= , rend l'onglet demandé
  loading.tsx                 # MODIFIÉ : silhouette NEUTRE (titre + sélecteur)
```

Fichiers **modifiés** (pas de nouvelle route) :
- `app/(dash)/chatter/planning/page.tsx` — lecture de `?vue=`, chargement conditionnel
  (`getPlanning(target)` ou `getTodos(target)`), passage aux onglets. Le `<Suspense>` interne
  choisit son fallback selon `?vue=` (`PlanningSkeleton` ou `TodosSkeleton`).
- `app/(dash)/chatter/planning/loading.tsx` — un `loading.tsx` **ne reçoit pas `searchParams`**
  et ne peut donc pas savoir quel onglet s'affiche : il rend désormais une silhouette **neutre**
  (titre + sélecteur + barre d'onglets), au lieu du `PlanningSkeleton` actuel qui montrerait une
  fausse structure de journée en arrivant sur l'onglet To-do.
- `features/todos/components/todos-tabs.tsx` — barre d'onglets Planning journalier / To-do,
  état porté par `?vue=`. Écrit en `router.replace(..., { scroll: false })` dans un
  `startTransition`, en fusionnant les paramètres via `new URLSearchParams(useSearchParams())`,
  conformément à `docs/guidelines-standard-feature.md` §6 (état d'URL partageable : `replace`,
  pas `push`, pour ne pas empiler l'historique à chaque changement d'onglet).
- `features/planning/components/member-select.tsx` — sélecteur de personne, commun aux deux
  onglets, rendu au-dessus de `TodosTabs`. Même idiome `replace` + `startTransition` + fusion
  des paramètres existants, pour préserver `?vue=` en changeant de personne.
- `features/planning/components/planning-header.tsx` — titre rétrogradé de `h1` à `h2` (une
  seule page ne peut avoir qu'un `<h1>`, désormais porté par `page.tsx`) ; DOM sinon inchangé.
- `features/planning/services/get-planning.ts` — `getPlanningMembers` inclut `superadmin` dans
  la liste des rôles quand le viewer est superadmin (`get-planning.ts:93-100`) et remonte
  `pages` (bandeau d'avertissement, §1).

**Lecture** : `getTodos(profileId)` filtre `.eq('profile_id', …)` ; la RLS reste l'enforcement.
Volume attendu très en dessous de la limite de 1000 lignes — pas de RPC ni de `fetchAll`.
**Pas de `use cache`** : lecture cookie-bound (RLS).

**Mutations** : Server Actions via `runAction`. Garde dédiée `requireCanWriteTodo(profileId)`
sur le modèle de `requireCanEdit` (`features/planning/actions.ts:36-57`) : miroir applicatif de
`can_write_todo_of`, appelée dans le `guard` **et** dans le `handler`. `revalidatePath('/chatter/planning')`.
Le changement de statut envoie toujours la **valeur absolue** (`status: 'done'`), jamais un
déplacement relatif — deux drags concurrents convergent au lieu de s'additionner.

**Erreurs** : contrat `ActionResult`, toasts sonner, et **`fieldErrors` mappés champ par champ**
dans le dialog via `setError` (leçon de l'audit Membres du 2026-07-19 : un message global
générique ne dit pas à l'utilisateur quel champ corriger).

## 4. Les deux vues & interactions

### Bascule liste ↔ kanban

Les mêmes tâches, deux présentations. La **liste est la vue par défaut** (scan rapide, saisie
au clavier) ; le **kanban** est la vue de pilotage (déplacer, voir l'état d'ensemble).

Le choix est une **préférence durable, pas un filtre partageable** : il vit dans un cookie
`todos_affichage` (`liste` | `kanban`), écrit côté client et **lu côté serveur** dans
`page.tsx`. C'est le seul support qui évite un flash de la mauvaise vue au premier rendu —
`localStorage` imposerait un script bloquant en tête de page, et un troisième paramètre d'URL
alourdirait une combinatoire qui porte déjà `?vue=` et `?membre=`. Le repo utilise déjà ce
mécanisme pour l'état de la sidebar (`components/ui/sidebar.tsx`).

La bascule est un **`ToggleGroup` à deux icônes** (liste / colonnes), aligné à droite de
l'en-tête de la to-do. Surtout **pas des `Tabs`** : la page porte déjà une barre d'onglets
(Planning journalier / To-do) vingt pixels plus haut — deux barres de même grammaire visuelle
rendent la hiérarchie illisible.

**L'état est hissé** dans un composant `TodosView` commun aux deux vues (état optimiste,
dialog, mutations, releases). Les deux vues deviennent des feuilles de présentation recevant
`todos` déjà optimistes et les callbacks `onEdit` / `onDelete` / `onMove`. Sans ça, tout serait
dupliqué. Rendu **conditionnel** (pas de `forceMount`) : les feuilles n'ont aucun état propre à
préserver.

### Vue liste

Lignes simples groupées par statut — **pas de table** : `DataTable` impose des largeurs de
colonnes qui étranglent le titre (l'information principale, de longueur variable) et embarque
~15 ko de client pour une feature secondaire. Il reste le bon outil pour Membres et Spenders,
pas ici. Seuil de bascule s'il fallait un jour reconsidérer : ≥ 5 colonnes triables + filtrage
multi-critères + sélection de masse.

- 3 sections (À faire / En cours / Fini) avec compteur discret ; **« Fini » repliée par défaut**
  (`ui/collapsible.tsx`) — c'est la seule section qui gonfle indéfiniment.
- Même `groupByStatus` que le kanban : une seule source de tri, aucune divergence possible.
- **Changement de statut** : pastille de statut cliquable → `DropdownMenu` (3 valeurs), qui
  appelle le **même `onMove`** que le kanban. Pas de case à cocher (3 états n'y rentrent pas),
  pas de pastille qui cycle (aucune découvrabilité).
- **Ajout rapide en ligne** en bas de « À faire » : on tape un titre, `Entrée`, la tâche est
  créée avec les défauts (`todo`, priorité moyenne). Le champ est vidé **avant** l'aller-retour
  serveur et garde le focus (saisie en rafale). Priorité, type et release restent dans le dialog.

### Vue kanban

- **dnd-kit** (`@dnd-kit/core`), compatibilité React 19 vérifiée à l'installation.
- **Poignée de glissement dédiée** (icône `GripVertical`, visible au survol et au focus) : la
  carte entière ne doit plus être saisissable, sinon le geste entre en conflit avec le clic
  d'édition — et rien n'indiquait qu'une carte était déplaçable.
- **La carte suit le curseur** pendant le glissement (`transform` de `useDraggable`, ou
  `DragOverlay`) : sans ça on glisse à l'aveugle. Source à opacité réduite, colonne visée
  surlignée discrètement. Pas de rotation, pas d'ombre portée.
- **En-têtes de colonne** : titre + compteur, et un `+` d'ajout rapide qui pré-remplit le statut
  de la colonne. Séparation par un fond très légèrement teinté, **aucune bordure ni bande de
  couleur**.
- **Drop = changement de statut**, en `useOptimistic` : la carte bouge instantanément. L'état
  optimiste doit poser `doneAt` en même temps que le statut, sinon la carte déposée dans « Fini »
  atterrit en bas de colonne puis saute en tête au retour serveur.
- **Repli clavier/tactile obligatoire** : le menu « Déplacer vers » de chaque carte. Le
  `KeyboardSensor` de dnd-kit, non configuré, déplace de 25 px par flèche et annonce en anglais
  avec l'identifiant brut — il n'est **pas** un second chemin clavier crédible : soit on le
  configure (annonces françaises + `coordinateGetter`), soit on ne le monte pas.
- `DndContext` reçoit une prop `id` explicite : sans elle, dnd-kit numérote ses identifiants
  d'accessibilité avec un compteur de module qui dérive entre serveur et client (erreur
  d'hydratation dès la deuxième requête servie par un même process).
- Sur refus du serveur, l'affichage revient à l'état réel ; si le refus est « cette tâche
  n'existe plus », il faut **resynchroniser** (`router.refresh()`), sinon la carte fantôme
  réapparaît dans sa colonne d'origine.

### Commun aux deux vues

- **Ordre dans une colonne / une section** : `order by priority asc, created_at asc` (le rang
  numérique donne haute → moyenne → basse) ; « Fini » trié par `done_at` décroissant. Aucun
  réordonnancement manuel, donc pas de colonne `position` ni de course de curseurs.
- **Carte / ligne** : titre, badge de type **si présent** (seule couleur forte), release en
  pastille discrète, priorité en texte sobre — la priorité ne réutilise pas le rouge/vert du
  type, sinon les deux axes deviennent illisibles. Description tronquée, visible à l'ouverture.
  **L'auteur reste affiché** (« Claude » quand la tâche vient d'une session) : contrairement à
  une to-do strictement personnelle, cette liste a deux écrivains, et savoir d'où vient une
  tâche est utile.
- **Filtre par release** (`Toutes / v1.4 / … / Sans release`) dans l'en-tête, commun aux deux
  vues. Pas de filtre par type en v1 (le type est facultatif et rare hors roadmap de dev).
- **Pas de mode lecture seule** (§1) : toute liste affichable est modifiable. Le seul état
  dégradé est le bandeau « cette personne n'a pas accès à la page Planning ».
- **Toast uniquement sur échec** : une mutation réussie se voit à l'écran (la carte bouge, la
  ligne apparaît), un toast de succès à chaque geste serait du bruit.
- **Section/colonne « Fini »** : tout affiché en v1. Si elle devient trop longue à l'usage, un
  archivage sera ajouté (hors scope).
- **Design** : épuré, pas de séparateurs décoratifs, la couleur de type est le seul accent.

## 5. Écriture par Claude

Claude insère et met à jour des tâches **en SQL direct** via le MCP Supabase (service role, hors
RLS), dans la liste de Benoit : `insert into todos (profile_id, title, description, type,
priority, release) values (…)`. `created_by` **et** `created_by_name` restent `null` → l'UI
affiche « Claude » comme auteur.
Aucun endpoint ni clé supplémentaire à créer, aucune surface d'écriture nouvelle sur le web. Les
colonnes `updated_at` / `done_at` n'ont pas à être écrites à la main : le trigger `todos_touch`
(§2) les tient à jour quelle que soit la voie d'écriture.

Conséquence acceptée : une tâche ajoutée par Claude pendant que la page est ouverte n'apparaît
qu'au prochain chargement (pas de realtime).

## Hors scope / plus tard

- **Face marketing** : la page Planning n'existe que côté chatteurs ; les managers marketing
  (Juba, Taha, Yuci) n'ont pas de to-do en v1. Ajout ultérieur = une route + l'onglet, la table
  n'a pas besoin de changer.
- **Realtime** (Supabase Broadcast) : inutile à ce volume.
- **Deadline**, **archivage** de la colonne Fini, **notifications**, **commentaires**.
- **Ordre manuel** intra-colonne (impliquerait une colonne `position` fractional).
- **Virtualisation** de la liste : inutile sous ~200 lignes, et incompatible avec des en-têtes
  de section collants + le glisser-déposer.
- **Filtres par type/priorité**, limites de WIP, colonnes configurables, multi-sélection.
- **Vue d'équipe** (toutes les to-do de mes rattachés sur un écran) : le sélecteur impose une
  personne à la fois, comme le planning.
- **Couplage automatique tâche ↔ release-please** (pré-remplir les releases depuis les tags git,
  fermer une tâche au merge d'une PR).

## Risques / points d'attention

- **Superadmins dans le sélecteur** : le changement porte sur le sélecteur **partagé**, donc il
  ouvre aussi le planning journalier d'un superadmin à un autre superadmin. Conforme à la RLS
  existante, mais à valider consciemment.
- **dnd-kit sur React 19** : à vérifier dès l'installation (repli documenté ci-dessus).
- **Drag sur mobile** : le tactile impose des contraintes (delay d'activation, scroll) — le menu
  « Déplacer vers » garantit que la fonction reste utilisable sur petit écran.
- **Deux modèles de droit sur la même page** : le planning exclut soi-même (`canEdit`), la to-do
  inclut soi-même. Ne pas réutiliser `canEdit` pour l'onglet To-do, ni l'inverse.
- **Cible sans le slug `planning`** : le sélecteur ne filtre pas dessus, d'où le bandeau
  d'avertissement (§1). Si l'oubli devient fréquent à l'usage, filtrer le sélecteur — mais cela
  changerait aussi l'onglet Journalier, à trancher séparément.
- **Migration `0067`** : appliquer sur UAT puis prod **avant** le déploiement du code (règle
  « migration = dépendance de déploiement »).
- **Divergence board ↔ changelog** : `release` est un texte libre ; une faute de frappe (`v1.4 `)
  crée une valeur de filtre fantôme. Mitigation v1 : les valeurs proposées dans le formulaire
  viennent des releases déjà saisies (datalist), la saisie libre restant possible.
