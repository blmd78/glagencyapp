# Tracker de présence — Incrément 3 : le front

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter les écrans du tracker dans le CRM, **à l'identique visuellement**, sous
`/chatter/presence/*` : board du shift, fiche chatteur, managers, to-do hebdo, récap. Aucun octet
d'ingest dans cet incrément — les écrans de présence se vérifient sur un jeu de démonstration, le
to-do et le récap sont utilisables en vrai dès la mise en ligne.

**Architecture:** `app → feature(template) → composants`. Lectures en RPC SQL `security invoker`
renvoyant du `jsonb` (jamais de `select` nu — troncature à 1000 lignes), calcul dans
`@glagency/core/tracking` (porté et testé à l'incrément 1), mutations en Server Actions.

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind v4, shadcn/ui, Supabase (RLS), `dnd-kit`
(déjà présent), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-tracker-presence-design.md` — §6 (le front), §7
(droits), et §4 réécrit le 2026-08-26 (l'alimentation).

**Sources d'origine** (relevées le 2026-08-26, conservées dans `.tracker-ref/` — dossier **gitignoré** : ce sont des données réelles (205 noms de chatteurs et leur activité), elles ne partent jamais dans le dépôt) :
les sept pages HTML authentifiées du tracker, et son CSS complet (41,8 Ko, 450 règles) extrait de
`https://chatterstracker.duckdns.org/login` — page publique qui embarque tout le design system.

---

## Global Constraints

- **Fidélité visuelle avant élégance de code.** La demande est « pareil esthétiquement, au CSS
  près ». En cas de conflit entre une convention interne et le rendu d'origine, le rendu gagne — et
  l'écart est commenté dans le fichier.
- **Portée `.trk` stricte.** Aucune règle ne fuit hors de `/chatter/presence/*`. Même patron que
  `formation-theme.css` : le thème ne pose QUE des couleurs et une police, jamais de `position` ni
  de fond (bug de la modale en `fixed`, déjà payé sur la Formation).
- **Pas de commit sans accord de Benoit.** Les étapes « Commit » préparent le message ; demander
  avant d'exécuter `git commit`.
- **`pnpm --filter @glagency/web lint && typecheck`** vert avant chaque fin de tâche.
- **Fuseau `Europe/Paris`** partout, via `todayParis()` — jamais `new Date()` nu côté serveur.
- **Aucune donnée réelle en base.** Les tables `tracker_*` sont vides jusqu'à la bascule ; le seed de
  démonstration est explicitement refusé en production (garde sur l'URL Supabase).

---

## Décisions prises avant d'écrire ce plan

Trois écarts assumés par rapport à la spec §6, tous constatés en ouvrant le vrai balisage.

### 1. On porte leur CSS, on ne le réimplémente pas en utilitaires Tailwind

La spec §6.1 disait : « on construit les écrans avec les composants shadcn et ils s'affichent
exactement comme le tracker ». C'est vrai pour les primitives interactives (`Dialog`, `Select`,
`Button`), c'est **faux pour leurs mises en page** : `.dt`/`.row` sont des grilles sur mesure,
`.mpbar`, `.tl`/`.trow`, `.livebar`/`.lv`, `.pill` sont des composants maison. Les refaire en
classes utilitaires serait une réécriture au jugé, donc une source d'écarts — l'inverse de la
demande.

**Donc** : `tracker-theme.css` reçoit leurs classes de contenu, telles quelles, sous `.trk`. Les
composants React posent ces classes. shadcn ne sert que pour l'interactif, thémé par le remap de
tokens déjà en place.

### 2. Les `details/summary` natifs sont conservés

Le board et le to-do reposent sur `<details>` natif pour tout plier/déplier : groupes par modèle,
lignes de chatteur, cartes du récap. **Zéro JavaScript**, état géré par le navigateur, accessible au
clavier. Le remplacer par un `Collapsible` shadcn ajouterait du client pour un résultat identique.
On garde le natif — c'est le meilleur choix de chargement, pas un compromis.

### 3. Le détail d'une ligne est chargé à la demande

Leur board pèse **400 Ko de HTML** parce qu'il inline, pour 97 chatteurs, la liste des sites, les
cinq statistiques et la timeline complète (1144 lignes de timeline dans le document) — que le
lecteur déplie ou non. C'est leur défaut de chargement le plus coûteux.

**Chez nous** : le résumé de ligne est rendu pour tous, le contenu déplié est chargé au premier
`toggle` par une Server Action, puis mémorisé. Payload initial estimé **~40 Ko au lieu de 400**.
C'est le seul endroit de cet incrément où l'on s'écarte du rendu d'origine — et l'écart est
invisible à l'œil.

---

## File Structure

### Créés — thème et navigation

```
apps/web/src/app/tracker-theme.css          (existe déjà — complété tâche 1)
apps/web/src/config/workspaces.ts           (modifié : groupe « Présence », slug `presence`)
```

### Créés — routes

```
apps/web/src/app/(dash)/chatter/presence/page.tsx                 board
apps/web/src/app/(dash)/chatter/presence/loading.tsx
apps/web/src/app/(dash)/chatter/presence/error.tsx
apps/web/src/app/(dash)/chatter/presence/[profileId]/page.tsx     fiche chatteur
apps/web/src/app/(dash)/chatter/presence/[profileId]/loading.tsx
apps/web/src/app/(dash)/chatter/presence/managers/page.tsx
apps/web/src/app/(dash)/chatter/presence/managers/loading.tsx
apps/web/src/app/(dash)/chatter/presence/todo/page.tsx
apps/web/src/app/(dash)/chatter/presence/todo/loading.tsx
apps/web/src/app/(dash)/chatter/presence/recap/page.tsx
apps/web/src/app/(dash)/chatter/presence/recap/loading.tsx
```

### Créés — features

```
apps/web/src/features/tracking-board/
├── BoardTemplate.tsx
├── actions.ts                  # getRowDetail (lecture à la demande)
├── types.ts
├── services/get-shift-board.ts
└── components/ live-bar.tsx · model-group.tsx · chatter-row.tsx · row-detail.tsx
                board-filters.tsx · board-skeleton.tsx · auto-refresh.tsx

apps/web/src/features/tracking-chatter/
├── ChatterTemplate.tsx · types.ts
├── services/get-chatter-periods.ts
└── components/ period-card.tsx · sites-card.tsx · chatter-skeleton.tsx

apps/web/src/features/tracking-managers/
├── ManagersTemplate.tsx
├── services/get-managers-day.ts
└── components/ managers-skeleton.tsx

apps/web/src/features/tracking-todo/
├── TodoTemplate.tsx · actions.ts · schema.ts · types.ts
├── services/get-week.ts · services/get-day-debrief.ts
└── components/ week-grid.tsx · day-column.tsx · task-group.tsx · task-item.tsx
                quick-add.tsx · debrief-card.tsx · week-notes.tsx · links-card.tsx
                todo-skeleton.tsx

apps/web/src/features/tracking-recap/
├── RecapTemplate.tsx
├── services/get-week-recap.ts
└── components/ recap-card.tsx · recap-skeleton.tsx
```

### Créés — base

```
packages/db/supabase/migrations/0126_tracker_todo.sql
packages/db/scripts/seed-tracker-demo.mjs
```

---

## Task 1 : Le socle — navigation, routes, thème complet, jeu de démonstration

**Files:** `config/workspaces.ts`, `app/tracker-theme.css`, les cinq `page.tsx`/`loading.tsx`,
`packages/db/scripts/seed-tracker-demo.mjs`

- [x] Ajouter le groupe **« Présence »** dans la face `chatter` de `config/workspaces.ts` : items
      Board (`/chatter/presence`), Managers, To-Do, Récap. Slug **`presence`** partagé par les
      quatre — un seul droit, comme `police` l'est pour Tracker + Rapport.
- [x] Porter dans `tracker-theme.css`, sous `.trk`, les classes de contenu relevées dans leur
      feuille : `.wrap`/`.wrap.wide`, `.card`, `.blockh`, `.cardpad`, `.cnt`, `.dt`, `.thead`,
      `.item`, `.row`, `.dot`, `.c-name`/`.nm`, `.c-bar`/`.mpbar`/`.lbl`, `.c-val`, `.chev`,
      `.gchev`, `.detail`, `.dlab`, `.sites`/`.pill` (+ `.tool`, `.nt`), `.stats`/`.stat`,
      `.tl`/`.trow` (+ `.t`, `.k`, `.d`, `.s`), `.livebar`/`.lv`, `.moretab`, `.dd`/`.dd-menu`,
      `.btn` (+ `.sm`, `.primary`, `.btn-ghost`, `.btn-danger`), `.field`, `.box`, `.acts`, `.msg`,
      et les modificateurs d'état `.bad`, `.mut`, `.ok`, `.ko`, `.low`, `.part`, `.none`, `.kored`.
      **Recopier les valeurs de la feuille d'origine, ne pas les réinventer.**
- [x] `.trk` NE porte ni `position` ni `background` — le fond va dans `.trk-page` (déjà écrit).
- [x] Créer les cinq routes avec garde `requireAccess(['presence'])`, kickoff sans `await`,
      `<Suspense>` avec squelette dimensionné, `loading.tsx` à la silhouette de la page,
      `error.tsx` sur la racine.
- [x] ~~`seed-tracker-demo.mjs`~~ — **SUPPRIMÉ le 2026-08-26 sur décision de Benoit : « pas de
      fausse donnée ».** Le jeu a servi à vérifier le port des écrans (c'est lui qui a fait
      apparaître les trois défauts corrigés le jour même), puis les tables ont été purgées et le
      script retiré. Les écrans de présence restent vides jusqu'au branchement réel.
- [x] `pnpm --filter @glagency/web lint && typecheck` — vert (4 avertissements PRÉEXISTANTS
      hors de cette tâche : `data-table`, `virtualized-table`, `recruit-admin`).

**Deux écarts constatés à l'exécution :**

1. **Pas de `error.tsx` sur `/chatter/presence`.** Des boundaries existent déjà en
   `(dash)/error.tsx` et `(dash)/chatter/error.tsx` — la plus proche capte, la sidebar reste en
   place. En ajouter une troisième n'apporterait rien (guideline §3 : « workspace ou `(dash)` »).
2. **Les cinq pages rendent un état vide, pas leur Template.** Les Templates arrivent avec leur
   tâche ; d'ici là chaque route est cohérente et affiche l'état vide du tracker (`p.empty`),
   qui fait partie du port.

**Vérifié sur l'UAT avant purge :** 20 chatteurs (noms réels), 5 modèles, 148 événements, 1 240
lignes de focus dont **67 % sur `mypuls.app`**, 6 postes en cours (3 vivants, 3 plantés à 41 min
de silence), **20 timelines distinctes**. Les tables sont depuis **vides** : plus aucune donnée
fabriquée en base.

**Vérification :** les cinq routes répondent, vides, au thème du tracker ; la sidebar montre le
groupe ; le seed remplit l'UAT et ne casse rien.

---

## Task 2 : Le board du shift

**Files:** `features/tracking-board/*`, `app/(dash)/chatter/presence/page.tsx`

L'écran d'origine : `/d/:shift/:date`, relevé dans `.tracker-ref/board.html`.

- [x] **RPC** `tracker_window_events(p_from timestamptz, p_to timestamptz)` → **`jsonb`** (une
      seule ligne : aucune troncature possible), `security invoker`, filtrée par la RLS. Renvoie
      les évènements d'état ET de focus de la fenêtre, plus `tracker_live`, `tracker_settings` et
      la ligne `tracker_rules`.
- [x] `services/get-shift-board.ts` : appelle la RPC, groupe par chatteur, passe chaque lot à
      `computeWindowVerdict` (`@glagency/core`), puis groupe par modèle. Toute erreur destructurée
      et **thrown**.
- [x] **Périmètre applicatif** : réutiliser `lib/services/creator-scope.ts` — manager,
      sous-manager et policier **avec modèles assignés** ne voient que leurs modèles. Même règle que
      le Tracker et le Rapport police, pas une nouvelle.
- [x] `BoardTemplate.tsx` (RSC) : `<LiveBar>` puis un `<ModelGroup>` par modèle
      (`details.card.modelgroup` > `summary.blockh` avec titre, `.cnt` « N chatters · N à
      sanctionner », `.gchev`).
- [x] `<ChatterRow>` : `details.item[data-name]` > `summary.row` — `.dot` (état), `.c-name`,
      `.c-bar` avec `.mpbar` dont la largeur est le ratio temps-MyPuls / `toolMinMinutes`, `.lbl`
      « 5h00 / 5h30 · manque 30min », `.c-val` actif, `.c-val` retard, `.chev`.
- [x] `<RowDetail>` : feuille client, montée sur `onToggle` du `<details>`, appelle
      `getRowDetail(profileId, shift, date)` **une seule fois** puis mémorise. Rend `.sites`
      (pills, `.tool` pour l'outil principal, `.nt` pour « non identifié »), `.stats` (Actif,
      Pause, Inactif, MyPuls, Arrivée) et `.tl` (timeline `.trow` avec plage, nature, durée, sites).
      Squelette pendant le chargement.
- [x] `<BoardFilters>` : leurs trois `details.dd` deviennent des `<Link>` vers
      `?m=`/`?shift=`/`?date=` — **`searchParams`, aucun état client** (guideline §6). La fermeture
      au clic extérieur est native au `<details>`.
- [x] `<AutoRefresh>` : feuille client de ~15 lignes, `setInterval` → `router.refresh()`, arrêtée
      quand l'onglet passe en arrière-plan (`visibilitychange`). Ne re-télécharge que la charge RSC.
- [x] Vérifier côte à côte avec `board.html` : mêmes libellés, mêmes seuils, mêmes couleurs d'état.
- [x] `lint && typecheck`

**Vérification :** sur le seed, le board affiche les mêmes groupes, les mêmes barres et les mêmes
verdicts que le calcul de `@glagency/core` ; le payload initial reste sous 60 Ko.

---

## Task 3 : La fiche chatteur

**Files:** `features/tracking-chatter/*`, `app/(dash)/chatter/presence/[profileId]/page.tsx`

L'écran d'origine : `/c/:id` — trois cartes (`chatter.html`).

- [x] `services/get-chatter-periods.ts` : semaine en cours et mois en cours. **La semaine et le
      mois se lisent dans les tables de faits** (`tracker_shift_rows`, `tracker_focus_shift`,
      `tracker_model_time`), pas en recalculant 30 jours d'évènements — c'est la règle §6.4.
      Tant que le job de fin de shift n'existe pas (incrément 4), le service lit ce qui existe et
      rend zéro proprement.
- [x] `<PeriodCard>` : `.card` > `.blockh` (« Cette semaine » / « Ce mois », `.cnt` « N jours
      travaillés ») > `.detail` > `.stats`.
- [x] `<SitesCard>` : « Sites & apps », `.cnt` « cumul du mois, sur le temps actif », `.dlab`
      « Modèles travaillés (mois) » avec les `.mt`, puis `.dlab` « Sites & apps » avec les `.pill`.
- [x] Le titre de page est le nom du chatteur (leur `h1`), fil d'Ariane vers le board.
- [x] `lint && typecheck`

---

## Task 4 : Les managers

**Files:** `features/tracking-managers/*`, `app/(dash)/chatter/presence/managers/page.tsx`

L'écran d'origine : `/m/:date` — relevé peuplé dans `.tracker-ref/m-2026-08-20.html`
(3 managers en activité) et vide dans `managers.html`.

- [x] `services/get-managers-day.ts` : `managerDay` / `sumManagerDays` (`@glagency/core`), sur les
      évènements des encadrants pour la date.
- [x] `ManagersTemplate.tsx` : `.card` « Présence des managers », `.cnt` « N en activité · clique
      pour le détail », puis une grille **`.dt.mgr`** — variante à 7 colonnes de la grille du
      board. `thead` = ['', Manager, Statut · horaire, Réel (r), Inactif (r), Pause (r), ''].
- [x] Ligne : `details.item[data-name]` > `summary.row` — `.dot` (état), `.c-name`/`.nm`, `.c-bar`
      avec **seulement** un `.lbl` (« terminé · 12:56 → 06:23 +1j » ; noter le `+1j` des postes à
      cheval sur minuit), puis `.c-val` réel, `.c-val.mut` inactif, `.c-val` pause, `.chev`.
- [x] `.detail` : `.stats` à cinq entrées (Début, Fin, Réel travaillé, Inactivité, Pause) puis
      `.dlab` « Timeline » et `.tl`. **Les timelines de managers n'ont pas de sites** : le `.s`
      d'une plage inactive porte le texte « PC pas touché », et reste vide sur une plage active.
- [x] La `.livebar` n'est rendue **que pour aujourd'hui** (`.livebar.none` « Personne en poste
      actuellement. » si vide) ; sur une date passée, elle est absente du document. `p.empty`
      « Aucun manager en poste ce jour-là. » quand la journée n'a rien.
- [x] Sélecteur de date en `searchParams`, comme le board.
- [x] `lint && typecheck`

---

## Task 5 : Le To-Do hebdomadaire

**Files:** `0126_tracker_todo.sql`, `features/tracking-todo/*`,
`app/(dash)/chatter/presence/todo/page.tsx`

L'écran d'origine : `/todo` (`todo.html`). **Décision de Benoit du 2026-08-26 : on assume un second
système de to-do ; celui du CRM (`/chatter/planning?vue=todo`) sera supprimé plus tard.** Cette
décision annule la moitié « aucune suppression » de D5 et doit être reportée dans la spec.

- [x] **Migration `0126`** — `text` + `check`, jamais d'enum ; RLS ; index sur les clés
      étrangères. Tables : sections (`categorie` par jour), tâches (jour, section, ordre, faite),
      modèles récurrents (« habitudes »), jours de repos, notes de la semaine, liens utiles,
      débrief du jour. Écritures **service-role après garde de rôle** dans les Server Actions, RLS
      en lecture — même patron que la Formation.
- [x] `pnpm --filter @glagency/db` : `supabase db push --db-url "$DATABASE_URL_UAT"` puis
      régénération de `types.ts`. **UAT seulement.**
- [x] `schema.ts` : schémas Zod partagés (Zod v4 : `z.uuid()`, `z.flattenError()`).
- [x] `actions.ts` : les 18 mutations de leur runtime deviennent des Server Actions avec
      `runAction` + `revalidatePath` + toast — ajout, suppression, déplacement, fait/pas fait,
      habitudes (créer, renommer, activer, supprimer), sections (créer, renommer, vider,
      supprimer), liens, jour de repos, note de semaine, débrief du jour.
- [x] `<WeekGrid>` / `<DayColumn>` / `<TaskGroup>` / `<TaskItem>` : sept colonnes, `.day` (+ `.now`
      pour aujourd'hui, `.we` le week-end, `.dayoff` en repos), sections `.tgroup` avec `.glab`
      (titre, compteur `0/0`, boutons `+`, `···`, `✕`).
- [x] **Glisser-déposer entre jours et sections** : reprendre le `dnd-kit` déjà installé pour le
      kanban `todos` en pause — ne pas ajouter de dépendance.
- [x] Cartes du bas : « Bilan du jour » (`.card.bilan`), « Bloc-notes de la semaine », « Liens
      utiles ».
- [x] Forms en RHF + `zodResolver`, et **`'use no memo'` sur tout composant RHF** (le React
      Compiler casse `formState` : chargement et erreurs muets).
- [x] `lint && typecheck`

---

## Task 6 : Le récap hebdomadaire

**Files:** `features/tracking-recap/*`, `app/(dash)/chatter/presence/recap/page.tsx`

L'écran d'origine : `/recap` (`recap.html`). **C'est le bilan des to-do et débriefs des
encadrants**, pas un récap de présence — il dépend entièrement de la tâche 5.

- [x] RPC `tracker_todo_week_recap(p_from date, p_to date)` → `jsonb` : par encadrant, tâches
      prévues / faites / non faites, pourcentage, débriefs déposés sur la semaine.
- [x] `RecapTemplate.tsx` : `.wrap.wide` > `.btot.rtot` (totaux), puis un `.rgroup` par palier avec
      `.rglab` (`em` = effectif, libellé), et `.rlist` de `details.rcard`.
- [x] `<RecapCard>` : `summary.rhead` — `.rn` (nom + rôle), `.bstat` avec `.bbar`/`.bv`
      (pourcentage), `.rnums` (prévues / faites / pas faites), `.rdeb` (`N/3 débriefs`, classe
      `.ok`/`.part`/`.ko`) — puis `.rdays` avec un `.rday` par jour et `p.bnone` si pas de débrief.
- [x] Sélecteur de semaine en `searchParams`.
- [x] `lint && typecheck`

---

## Écarts constatés à l'exécution (tâches 2 → 6)

1. **Une migration de plus que prévu.** Le plan plaçait « migration `0126` » dans la tâche 5 ; les
   lectures du board en exigeaient une avant. D'où **`0126_tracker_rpc.sql`** (la RPC
   `tracker_window`) puis **`0127_tracker_todo.sql`** (les sept tables de la to-do et la RPC du
   récap). Les deux sont appliquées sur l'UAT, la prod n'a rien reçu.

2. **`shiftWindowOn` ajouté à `@glagency/core`** (+ 4 tests). Le board choisit une date ;
   `shiftWindow` ne savait calculer que le créneau courant. Dupliquer sa logique de bascule
   d'heure côté web aurait créé exactement la dérive que son commentaire met en garde contre.

3. **La fiche chatteur lit les événements bruts, pas les tables de faits.** Elles sont vides
   jusqu'au job de fin de shift (incrément 4) : un écran affichant zéro en permanence ne se
   vérifie pas. À rebrancher sur les faits dès qu'ils existent.

4. **Les habitudes de la to-do sont VIRTUELLES** jusqu'au premier geste. Les matérialiser à la
   lecture ferait écrire une page en base à chaque affichage — un effet de bord dans un Server
   Component — et créerait des lignes pour des jours que personne ne regarde. Cocher, déplacer ou
   supprimer matérialise l'occurrence.

5. **`/api/todo/weekplan` non porté.** Son gestionnaire existe dans leur JavaScript mais le
   formulaire n'apparaît dans AUCUNE page rendue : ses champs sont inconnus. Les inventer aurait
   été pire que de ne rien faire. Consigné comme leur code mort de rendu d'images (§0.3 de la spec).

6. **Deux règles INFÉRÉES, à confronter à leurs sources si on les récupère un jour :**
   - « à sanctionner » sur le board = sous le minimum d'outil principal (`tool_min_minutes`).
     C'est le seul seuil explicite de leur colonne (« Mypuls · min. 5h30 ») ;
   - le regroupement du récap en trois paliers (« suivi des chatters et 1:1 », « to do seule »,
     « admin et principal ») est reconstruit à partir du rôle et de l'existence de modèles
     assignés — leur règle exacte n'est écrite nulle part dans ce qu'on a relevé.

7. **Docker a dû être démarré** pour régénérer `packages/db/src/types.ts` : `supabase gen types`
   l'exige, même avec `--db-url`.

---

## Self-review

- [ ] Chaque écran comparé côte à côte avec sa page d'origine (`.tracker-ref/*.html`) :
      libellés, seuils, couleurs, ordre des colonnes.
- [ ] Aucune règle `.trk` ne fuit : vérifier qu'une page hors `/chatter/presence` est intacte, en
      thème clair comme en sombre.
- [ ] Aucun `select` nu sur une table de faits ; toutes les agrégations en RPC `jsonb`.
- [ ] Toute lecture destructure l'erreur Supabase et la **throw** (jamais de `data ?? []` silencieux).
- [ ] Aucune feature n'importe une autre feature (ESLint le bloque).
- [ ] Payload initial du board mesuré et consigné, comparé aux 400 Ko d'origine.
- [ ] `pnpm --filter @glagency/web lint && typecheck && test`
- [ ] Reporter dans la spec : la décision « second to-do assumé, celui du CRM sera supprimé »
      (annule la moitié de D5), et les trois écarts de conception de ce plan.
