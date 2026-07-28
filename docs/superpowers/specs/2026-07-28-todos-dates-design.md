# To-do — dates de vie d'une tâche et transitions verrouillées (design)

## 1. État des lieux

La to-do (spec 2026-07-20, pile de noms 2026-07-28) affiche trois sections par statut —
À faire, En cours, Terminé. Ce qui existe déjà côté dates, dans la migration `0067` :

- `created_at` — posé à l'insert, **épinglé** par le trigger `todos_touch` (jamais réécrivable,
  même par un admin) ;
- `done_at` — posé/effacé par le même trigger au gré du statut (sert déjà au tri de « Terminé »
  et à l'état optimiste de `todos-view`) ;
- `updated_at` — touché à chaque écriture.

Aucune date n'est affichée sur les lignes ; seul l'œil (popover `todo-peek`) montre
« Auteur · date de création ». Points vérifiés qui bornent le chantier :

- le **dialog n'a pas de champ statut** — une création par le dialog naît déjà en « À faire »
  (`todoCreateInput` : `status.default('todo')`) ;
- **`updateTodo` ne peut pas changer le statut** (absent de `todoUpdateInput`) — le seul chemin
  de déplacement est `setTodoStatus` ;
- le **seul endroit où une création naît hors « À faire »** est l'ajout rapide, présent dans
  chacune des trois sections (`TodosList` : `<TodoQuickAdd status={s.value} …>`) ;
- le kanban est **en pause** (blocs commentés depuis 2026-07-20) — il ne rend rien.

## 2. Décisions

| Question | Décision |
|---|---|
| Quand démarre le chrono ? | **Au passage en « En cours », jamais avant.** « À faire » = la tâche est juste posée là, aucun chrono ; sa date d'ajout est purement informative. |
| Retour en « À faire » ? | **Interdit** dès que la tâche en est sortie — c'est l'anti-triche : revenir en « À faire » remettrait le chrono à zéro. L'interdiction couvre AUSSI « Terminé → À faire » (sinon le détour par Terminé rouvre la triche). |
| Création | **Toujours en « À faire »** : l'ajout rapide disparaît des sections « En cours » et « Terminé ». |
| Qu'affiche-t-on ? | La date adaptée au statut, **ajoutée** à la zone méta de la ligne, avant l'auteur. **Rien n'est retiré** (décision Benoit : l'auteur reste sur la ligne, l'œil garde sa ligne méta). |
| Champs | **Une seule colonne nouvelle : `started_at`**. `created_at` = date « À faire », `done_at` (existant) = date de fin. |

## 3. Transitions

| Depuis \ Vers | À faire | En cours | Terminé |
|---|---|---|---|
| À faire | — | ✅ chrono démarre (`started_at` posé) | ✅ finie sans passer par « En cours » (aucun chrono) |
| En cours | ❌ interdit | — | ✅ (`done_at` posé) |
| Terminé | ❌ interdit | ✅ rouvrir — le chrono d'origine **reprend** (`started_at` conservé), `done_at` effacé | — |

`started_at` est donc **monotone** : posé une fois, jamais effacé ni réécrit.

**Enforcement en trois couches**, du plus doux au plus dur :

1. **UI** — le menu de la pastille de statut n'offre plus « À faire » quand la tâche n'y est
   pas (filtre de `STATUSES` dans `todo-row`) ; l'ajout rapide n'existe plus que dans la
   section « À faire ».
2. **Action serveur** — `setTodoStatus` lit le statut actuel de la ligne et refuse le retour
   avec une `BusinessError` en français : « Une tâche commencée ne revient pas dans "À faire". »
3. **Trigger** — `todos_touch` lève une exception sur `old.status <> 'todo' and
   new.status = 'todo'` : même un accès direct à la base ne peut pas tricher. Conséquence
   assumée : une correction manuelle en SQL devra désactiver le trigger le temps du fix —
   c'est le prix de l'étanchéité, documenté dans la migration.

Le kanban en pause n'est pas modifié ; une note dans ses blocs commentés rappelle qu'à la
réactivation, le drag devra filtrer les cibles selon la même matrice.

## 4. Modèle de données — migration `0086_todos_dates.sql` (unique pour tout le chantier)

- `alter table todos add column started_at timestamptz;` — pas de backfill : les tâches
  déjà en cours ou terminées n'ont pas d'historique, on n'invente pas de dates.
- `todos_touch` étendu :
  - INSERT : `started_at := case when new.status = 'in_progress' then now() end` — défensif :
    l'UI ne crée qu'en « À faire », mais une insertion SQL directe (Claude) reste cohérente ;
  - UPDATE : transition interdite → `raise exception` ; sinon
    `new.started_at := coalesce(old.started_at, case when new.status = 'in_progress' then now() end)`
    — posé à la première entrée en « En cours », conservé ensuite quoi qu'il arrive ;
  - la logique `done_at`/`created_at`/`updated_at` existante ne change pas.
- Le client ne peut **jamais** écrire ces dates : le trigger recalcule tout, comme aujourd'hui.
- Aucune RLS à toucher. `packages/db/src/types.ts` à mettre à jour (colonne ajoutée).

**Durcissement issu de la revue de branche finale** (deux failles trouvées dans la formule
ci-dessus — corrigées puis **fusionnées dans `0086` avant toute application en prod**, une seule
migration par chantier, même pratique que `0085_compta_paie`) :
- `started_at` — la règle devient GATÉE sur l'entrée réelle en « En cours », pas sur toute
  écriture d'une ligne déjà `in_progress` (sinon corriger le TITRE d'une tâche héritée
  d'avant 0086, encore en cours et sans `started_at`, lui fabriquait un chrono ancré sur
  l'édition) :
  ```sql
  new.started_at := coalesce(
    case when tg_op = 'UPDATE' then old.started_at end,
    case
      when new.status = 'in_progress'
       and (tg_op = 'INSERT' or old.status <> 'in_progress')
      then now()
    end
  );
  ```
- `done_at` — le coalesce perd `new.done_at` (`old.done_at` est toujours null à
  l'entrée en « done », donc le `new.done_at` fourni par le client passait systématiquement :
  un `done_at` antidaté via PostgREST direct restait possible). Après ce durcissement, le client
  ne peut plus écrire AUCUNE des dates de vie de la tâche — le trigger les recalcule toutes.

## 5. Affichage — zone méta de `todo-row`, avant l'auteur

| Section | Affiché | Donnée absente (tâches d'avant la migration) |
|---|---|---|
| À faire | `ajouté le 12/07` | — (`created_at` existe toujours) |
| En cours | `depuis 3 j` · à J0 : `depuis aujourd'hui` | rien (pas de `started_at`) |
| Terminé | `12/07 → 15/07 · 3 j` (début → fin · jours en cours) ; même jour Paris : durée en **heures** (`fini le 12/07 · 3 h`, arrondies ; sous l'heure : `moins d'1 h` — décision Benoit à la livraison) | sans `started_at` : `fini le 15/07` ; sans `done_at` (impossible en pratique, le trigger le pose) : rien |

- Les « 3 j » comptent **uniquement le temps passé en « En cours »** (`started_at → done_at`) —
  jamais l'attente en « À faire ».
- **Jours calendaires Europe/Paris**, pas des blocs de 24 h : deux nouveaux helpers dans
  `packages/core/src/domain/dates.ts`, **testés** à côté des existants —
  `frDayMonthParis(iso)` → « 12/07 » (timestamptz → jour/mois, fuseau Paris, même précaution
  que `frDateTimeParis` : jamais la TZ serveur) et `daysBetweenParis(isoA, isoB)` → entier de
  jours calendaires Paris. Le fuseau a déjà mordu ce projet (chantier « dates-paris ») ;
  autour de minuit, jours Paris ≠ jours UTC.
- L'œil (`todo-peek`) ne change pas.

## 6. Réactivité — l'optimiste suit

`move()` (`todos-view`) pose déjà `doneAt` en optimiste ; il posera aussi `startedAt`
(passage en « En cours » → `now()` si vide ; jamais effacé — miroir exact du trigger). Sans ça,
la ligne afficherait la méta d'avant pendant l'aller-retour serveur. Le rechargement du
panneau (`onChanged`, mode pile) ramène ensuite les valeurs réelles du serveur.

Le type `Todo` gagne `startedAt: string | null` ; `getTodos` sélectionne la colonne.

## 7. Environnements

1. Appliquer `0086` sur l'**UAT** (`supabase db push --db-url` avec l'URL UAT) → test sur la
   préprod develop.
2. **Prod au moment de la release, avec précaution** : `db push` applique TOUT le pending —
   si `0085_compta_paie` n'est pas encore appliquée en prod, elle partirait avec. `--dry-run`
   d'abord, et coordination avec le chantier compta avant d'y toucher.

## 8. Hors périmètre

- Le kanban et le champ `release` restent en pause (note de réactivation ajoutée, rien d'autre).
- Pas de backfill des dates, pas d'historique des transitions (une seule paire start/fin —
  rouvrir une tâche ne crée pas de « sessions » multiples).
- L'œil, le dialog, `updateTodo`, la RLS : inchangés.

## 9. Risques et cas limites

| Cas | Comportement |
|---|---|
| Tâche en cours d'avant la migration (`started_at` null) | « En cours » sans méta ; si on la termine : `fini le …` sans durée |
| Tâche finie sans passer par « En cours » | `fini le …` sans durée — c'est exact, elle n'a jamais été en cours |
| Rouvrir puis re-terminer | le chrono d'origine reprend ; `done_at` est reposé à la nouvelle fin — la durée s'allonge d'autant |
| Deux changements de statut qui se croisent | inchangé : valeur absolue du statut + jeton de course du panneau ; les dates viennent du serveur au settle |
| Correctif manuel en SQL nécessitant un retour en « À faire » | impossible trigger actif — le désactiver le temps du fix (documenté dans la migration) |

## 10. Vérification

- `daysBetweenParis` et `frDayMonthParis` : tests Vitest dans `packages/core` (cas limites :
  minuit Paris, changement d'heure, J0, ordre inversé).
- Le trigger n'est pas testable dans le repo (pas d'infra de test DB) : vérification manuelle
  sur l'UAT — matrice des 6 transitions (4 permises, 2 refusées), et le refus doit remonter le
  message français, pas une erreur brute.
- `typecheck` + `lint` + `pnpm --filter @glagency/web build`, puis passe navigateur sur la
  préprod : créer (naît en À faire), démarrer (méta « depuis aujourd'hui »), terminer
  (`début → fin · durée`), rouvrir (chrono repris), et vérifier que la pastille n'offre plus
  « À faire ».
