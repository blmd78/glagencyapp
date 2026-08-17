# Formation — Catalogue (modules, cours, cas) — design

Date : 2026-08-17 · Statut : validé en chat, à relire · Incrément 1 de la face **Formation**.

## 1. Contexte

L'agence fait tourner « Good Luck Agency » (GLA) : une app Python + HTML monolithique
(repo `axel-vrnl/good-luck-agency`, base Supabase séparée) qui sert un **test de
recrutement public** et un **espace formation** des chatters (7 modules pédagogiques,
85 cas de conversation joués contre un fan IA, notation IA sur un barème). Décision :
**reprendre l'espace formation + son admin dans le CRM** (approche « feature native »,
IA en Server Actions), le test public restant sur GLA pour l'instant. On **repart de
zéro** côté données (pas de migration des sessions GLA — comptes = pseudos sans email).

Décisions de structure déjà validées (face `formation`, créée dans `config/workspaces.ts`) :

```
Formation
  Overview        (droit Suivi — encadrement : chiffres + chatters de mon périmètre)
  Ma formation    (droit Entraînement — home du chatter, « Continuer »)
  Modules         (Entraînement OU Suivi — cours + cas)
  ─
  Catalogue       (admin — gérer modules / cours / cas)
  Membres         (admin — déjà là)
```

Deux droits cochables dans Membres : `frm-entrainement`, `frm-suivi`. Une seule boucle
pédagogique : **lire le cours → jouer un cas → être noté sur les axes → cas suivant**.

Plan global (PRs) : 0 face ✅ · **1 Catalogue (ce document)** · statut « en formation » ·
moteur IA · session d'entraînement (solo, puis défis simultanés et boss) · Ma formation ·
Overview encadrement · signalement de notation · test de recrutement. **Pas de « v2 »** :
tout le contenu GLA entre dès le catalogue, le reste suit dans le même chantier.

## 2. Périmètre de cet incrément

Livrables, dans l'ordre (chacun mergeable) :

1. **Schéma** : tables du catalogue, RLS, index — migration `0113`.
2. **Seed** : reprise de **tout** le contenu GLA (7 modules, 10 sections, **85 cas** = 79 solo
   + 5 défis simultanés + 1 boss final, messages d'ouverture, axes de barème, 25 créneaux
   de défi, 5 fans du boss) — migration `0114`, générée par un script.
3. **Onglet admin « Catalogue »** (`/formation/catalogue`) : lister / créer / éditer /
   ordonner / activer-désactiver modules, sections, axes, cas (des 3 sortes), messages
   d'ouverture, créneaux de défi, fans du boss.
4. **Pages « Modules »** (`/formation/modules`, `/formation/modules/[code]`) : lecture
   pour chatters et encadrants — cours + liste des cas par difficulté.

**Hors périmètre** (incréments suivants du même chantier) : « Tester ce cas » (nécessite
le moteur IA), sessions, notation, progression, édition riche (WYSIWYG) du cours.

## 3. Modèle de données

Conventions repo : `uuid` `gen_random_uuid()` (tables petites — la fragmentation UUIDv4
est sans objet et le reste du repo est en uuid), `text + check` (jamais d'enum),
`timestamptz`, RLS wrappée `(select …)` (0057), FK indexées (0055), `create policy` simple
(pas de `if not exists`, comme le reste du repo), pas de jsonb là où la structure est
connue.

Un `code` texte stable (`setting`, `trans_01`) sur modules et cas : identifiant lisible
dans les URLs et le seed, unique, **modifiable par personne** (pas de champ dans le
formulaire — généré à la création : slug du titre, dédoublonné).

```sql
create table public.training_modules (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  title          text not null check (length(title) between 1 and 80),
  emoji          text check (emoji is null or length(emoji) <= 8),
  description    text,                       -- une phrase (carte du module)
  objective_label text not null default 'Objectif',  -- libellé du champ « objectif » des cas (GLA cible_label)
  course_md      text,                        -- cours en Markdown (Textarea + rendu react-markdown)
  scoring_notes  text,                        -- consigne de notation transmise à l'IA (GLA consigne_notation)
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);

-- Axes du barème (ce que l'IA note, ce que le chatter voit dans son résultat)
create table public.training_module_axes (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  name        text not null check (length(name) between 1 and 60),
  description text not null,
  position    integer not null default 0,
  unique (module_id, key)
);

-- Sections optionnelles d'un module (GLA sous_categories) — un regroupement des cas, pas un niveau de nav
create table public.training_module_sections (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  code        text not null check (code ~ '^[a-z0-9_-]{2,40}$'),
  title       text not null check (length(title) between 1 and 80),
  emoji       text check (emoji is null or length(emoji) <= 8),
  description text,
  position    integer not null default 0,
  unique (module_id, code)
);

-- Trois sortes de cas (GLA : cas « normal », `arena` = défi simultané, `boss_mode`) :
--   solo  : une conversation contre un fan (79) — fan_name / fan_brief / expected obligatoires
--   arena : 5 conversations en parallèle, chacune = un cas solo du module sous un autre prénom
--           (5, un par module hors boss) — voir training_case_arena_slots
--   boss  : 5 tunnels complets contre 5 fans riches (1) — voir training_case_boss_fans
create table public.training_cases (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.training_modules(id) on delete cascade,
  section_id     uuid references public.training_module_sections(id) on delete set null,
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  kind           text not null default 'solo' check (kind in ('solo', 'arena', 'boss')),
  title          text not null check (length(title) between 1 and 80),
  phase          text not null default '',      -- étiquette libre (« Qualification », « Relance »…)
  difficulty     smallint not null check (difficulty between 1 and 10),
  max_turns      smallint not null check (max_turns between 1 and 50),
                 -- messages max du chatter : par conversation (solo/arena) ou par fan (boss).
                 -- GLA : tours_max (solo), ARENA_CAP=8 (arena), 32 (boss) — constantes du front reprises.
  reaction_max_s smallint check (reaction_max_s between 10 and 600),
                 -- délai de réponse max (arena/boss) — GLA reaction_max_s (120)
  is_sale        boolean not null default false, -- le cas attend une vente (GLA vente)
  context        text not null,                 -- situation de départ (affichée au chatter)
  objective      text not null,                 -- ce que le chatter doit obtenir (affiché)
  target_line    text,                          -- la « ligne cible » (affichée)
  fan_name       text check (fan_name is null or length(fan_name) between 1 and 30),
  fan_brief      text,                          -- consigne du fan pour l'IA (jamais affichée au chatter)
  expected       text,                          -- « ce qui était attendu » — révélé APRÈS la session
  position       integer not null default 0,    -- ordre dans le module (défaut : par difficulté)
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  -- un solo décrit son fan et son attendu ; arena/boss portent ça dans leurs tables filles
  constraint training_cases_solo_fields check (
    case when kind = 'solo'
      then fan_name is not null and fan_brief is not null and expected is not null
      else fan_name is null and fan_brief is null
    end
  ),
  -- le chrono n'a de sens qu'en multi-conversations
  constraint training_cases_reaction_kind check ((kind = 'solo') = (reaction_max_s is null))
);
-- section_id doit appartenir au même module : vérifié CÔTÉ ACTION (Zod + lecture), pas
-- de trigger — une incohérence n'aurait qu'un effet d'affichage.

-- Défi simultané : les conversations jouées en parallèle (GLA `arena` = 5 codes de cas +
-- `fans` = 5 prénoms). Chaque créneau rejoue un cas SOLO du même module (son ouverture, sa
-- consigne de fan) sous un autre prénom. Même module et kind='solo' du cas référencé :
-- vérifiés côté action.
create table public.training_case_arena_slots (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.training_cases(id) on delete cascade,
  position     integer not null,
  ref_case_id  uuid not null references public.training_cases(id) on delete restrict,
                 -- restrict : on ne désactive un solo référencé qu'après avoir retiré le créneau
  display_name text not null check (length(display_name) between 1 and 30),
  unique (case_id, position)
);

-- Boss final : un fan riche par tunnel (GLA `fans[]` objets). Les champs « visibles » sont
-- montrés au chatter (name, age, job, city, color, persona) ; les champs « cachés »
-- pilotent l'IA (budget_cap, nego_*, meet_*, derails) — même partage que GLA fan_pub.
create table public.training_case_boss_fans (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.training_cases(id) on delete cascade,
  position        integer not null,
  code            text not null check (code ~ '^[a-z0-9_-]{2,30}$'),
  name            text not null check (length(name) between 1 and 30),
  age             smallint check (age between 18 and 99),
  job             text,
  city            text,
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),  -- couleur d'onglet dans l'arène
  persona         text not null,             -- visible : caractère en une phrase
  opening_message text not null,             -- son premier message (GLA seed, toujours 1 message du fan)
  budget_cap      integer check (budget_cap >= 0),      -- caché : plafond de dépense (€)
  nego_threshold  integer check (nego_threshold >= 0),  -- caché : palier où il négocie (€)
  nego_where      text,                                 -- caché : comment/quand il négocie
  meet_when       text,                                 -- caché : moment de la demande de rencontre
  meet_where      text,                                 -- caché : formulation de la demande
  derails         text,                                 -- caché : ses déraillements
  unique (case_id, position),
  unique (case_id, code)
);

-- Messages d'ouverture d'un cas (GLA seed) — la conversation « déjà entamée » quand le chatter arrive
create table public.training_case_messages (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.training_cases(id) on delete cascade,
  position  integer not null,
  speaker   text not null check (speaker in ('creator', 'fan')),  -- GLA me/them
  body      text not null check (length(body) between 1 and 1000),
  unique (case_id, position)
);
```

Index (FK non couvertes par un unique en tête) : `training_cases (module_id, position)`,
`training_cases (section_id)`, `training_case_arena_slots (ref_case_id)` ;
`training_module_axes (module_id)`, `training_module_sections (module_id)`,
`training_case_messages (case_id)`, `training_case_arena_slots (case_id)`,
`training_case_boss_fans (case_id)` sont couverts par leur unique en tête.

Ce qu'on **ne** met **pas** : `created_by` (le catalogue est une donnée d'équipe, l'audit
= `updated_by`), colonne `extra jsonb`, versioning (une session future stockera un
**instantané** du cas au moment joué — c'est là que vit l'historique, pas ici).

`updated_at`/`updated_by` sont posés par les actions (convention repo : pas de trigger).

### RLS

```sql
-- Lecture : quiconque a le droit de face `formation` (posé par mergePages dès qu'un frm-*
-- est coché) ou admin. has_page exige left_at is null (0102).
create policy training_modules_read on public.training_modules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
-- Écriture : admin uniquement (le Catalogue est adminOnly).
create policy training_modules_admin_write on public.training_modules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Idem pour axes, sections, cases, case_messages, arena_slots, boss_fans (lecture face,
-- écriture admin).
```

Les lignes **inactives** restent lisibles par la RLS ; le **filtrage `active`** est fait
dans les services de lecture chatter (une page Modules ne montre que l'actif), le
Catalogue admin voit tout.

## 4. Seed (migration `0114_training_catalog_seed.sql`)

Généré par `packages/db/scripts/gen-training-seed.mjs <chemin/formation.json>` (stdout →
fichier de migration ; script commité, ré-exécutable, **jamais** appelé en prod — la
migration est l'artefact). Règles de conversion :

| GLA (`formation.json`) | CRM |
|---|---|
| `modules[].id/titre/emoji/description/cible_label/consigne_notation/actif` | `training_modules.code/title/emoji/description/objective_label/scoring_notes/active` (les 7 actifs, `boss` compris) |
| `modules[].bareme.axes[] {cle,nom,desc}` | `training_module_axes {key,name,description,position}` |
| `modules[].sous_categories[] {id,titre,emoji,desc}` | `training_module_sections` |
| `modules[].cours` (HTML : h4/p/b/i/u/br/ul/ol/li/table) | `course_md` (Markdown : `## `, `**`, `*`, listes, table GFM) — conversion dans le script, vérifiée à la main sur les 6 cours |
| `cas[]` sans `arena` (79) : `id/module/sous_cat/titre/phase/difficulte/tours_max/vente/contexte/objectif/ligne_cible/fan_name/consigne_fan/attendu` | `training_cases` `kind='solo'` (`position` = ordre d'apparition dans le JSON) |
| `cas[].seed[] {who: me\|them, t}` | `training_case_messages` (`me→creator`, `them→fan`) |
| `cas[]` avec `arena` sans `boss_mode` (5) : `arena[]` (codes de cas), `fans[]` (prénoms), `reaction_max_s` | `training_cases` `kind='arena'`, `max_turns=8` (ARENA_CAP), `reaction_max_s`, + 5 `training_case_arena_slots` (`ref_case_id` = cas du code, `display_name` = prénom) |
| `cas[]` avec `boss_mode` (1) : `fans[]` objets `{id,name,age,job,city,color,persona,cap,nego,negoWhere,rencontre,rencontreWhere,derails,seed}`, `reaction_max_s` | `training_cases` `kind='boss'`, `max_turns=32`, + 5 `training_case_boss_fans` (`seed[0].t` → `opening_message` ; `cap→budget_cap`, `nego→nego_threshold`, `rencontre→meet_when`, `rencontreWhere→meet_where`) ; le champ `arena[]` du boss n'est **pas** repris (GLA ne s'en sert qu'en secours si les fans manquent) |

Contraintes vérifiées par le script avant d'émettre : codes uniques, `sous_cat` connu du
module, difficulté 1-10, `tours_max ≥ 1` pour les solos, chaque code référencé par un défi
existe dans le même module et est un solo, 5 fans par défi/boss avec un seed d'un seul
message, aucun HTML résiduel dans `course_md`. Comptages attendus : 7 modules, 10 sections,
85 cas (79/5/1), 25 créneaux, 5 fans, ~229 messages, ~30 axes. Le SQL est
en `insert … values` explicites, uuid **déterministes** (v5 calculés dans le script à partir
du `code` — re-génération = mêmes ids, aucune extension Postgres requise), pas de
`on conflict` (migration one-shot).

## 5. Web — features

### `features/training-catalog/` (admin)

```
CatalogTemplate.tsx          RSC : liste des modules (cartes) + module sélectionné (?module=code)
actions.ts                   'use server' — runAction + adminGuard-équivalent (requireAdminProfile)
schema.ts                    Zod partagé client/serveur (moduleInput, caseInput, reorderInput…)
types.ts                     CatalogModule, CatalogCase, CatalogSection, CatalogAxis, CatalogMessage
services/get-catalog.ts      admin : tout, actif ou non, ordonné (fetchAll inutile : < 200 lignes)
components/
  modules-list.tsx           colonne gauche : modules ordonnables (↑↓), badge inactif, compteur de cas
  module-dialog.tsx          form module : titre, emoji, description, libellé objectif, consigne de notation,
                             axes (field array), sections (field array), cours (Textarea Markdown + aperçu)
  module-form-*.tsx          split si > 300 lignes (axes / sections / cours)
  cases-table.tsx            cas du module : ordre, sorte (solo/défi/boss), difficulté, titre, phase, section,
                             vente, actif, actions
  case-dialog.tsx            form cas : champs communs + partie propre à la sorte (choisie à la création,
                             non modifiable ensuite)
  case-form-messages.tsx     solo : messages d'ouverture (field array speaker/body)
  case-form-arena.tsx        défi : chrono + 5 créneaux (select d'un cas solo du module + prénom)
  case-form-boss.tsx         boss : chrono + fans (field array : visibles / cachés / message d'ouverture)
  catalog-skeleton.tsx
```

Actions (toutes admin, `runAction` + `BusinessError` métier, refus en impersonation
comme Membres) : `createModule`, `updateModule`, `toggleModule`, `reorderModules`,
`createCase`, `updateCase`, `toggleCase`, `duplicateCase` (« copie de … », inactif),
`reorderCases`. Un cas solo référencé par un défi ne peut pas être désactivé tant que le
créneau existe (`BusinessError` : « Ce cas est joué dans le défi “…” — retire-le d'abord »). Sections et axes sont éditées **dans** le module (upsert diff dans
`updateModule` : ajout / modif / suppression ; supprimer une section remet `section_id`
des cas à null via la FK ; supprimer un axe est autorisé en v1 — les sessions futures
stockeront leur instantané). **Pas de suppression** de module ni de cas : on désactive
(un module inactif cache ses cas).

Slugs : le Catalogue est `adminOnly` (comme Membres) → pas de `PageSlug`, item
`{ href: '/formation/catalogue', label: 'Catalogue', icon: BookOpen, adminOnly: true, bottom: true }`.

### `features/training-modules/` (lecture)

```
ModulesTemplate.tsx          liste des modules actifs : emoji, titre, description, n cas
ModuleTemplate.tsx           un module : onglets Cours (Markdown rendu) / Cas (liste par section puis
                             difficulté : titre, phase, difficulté, vente, tours ; le défi simultané en
                             dernier, à part ; le module Boss final = son unique cas boss avec ses 5 fans
                             côté « visible ») — sans état de progression pour l'instant (arrive avec les
                             sessions)
services/get-modules.ts, services/get-module.ts (par code, actifs seulement)
components/course-view.tsx (react-markdown + remark-gfm, classes prose sobres), cases-list.tsx
```

Droit : nav item Modules `slug: 'frm-entrainement'` + **`anyOf: ['frm-entrainement','frm-suivi']`**
(petit ajout `NavItem.anyOf?: PageSlug[]` — `canAccessNav` : `pages` contient l'un des slugs ;
`requireAccess` accepte un tableau). Un seul item, un seul href, deux droits.

Rendu Markdown : dépendances `react-markdown` + `remark-gfm` (nouvelles, légères, pas de
HTML brut rendu → pas de vecteur XSS). Le cours GLA est HTML → converti une fois au seed.

### Routes

```
app/(dash)/formation/catalogue/page.tsx        requireAdmin ; ?module=<code>
app/(dash)/formation/modules/page.tsx          requireAccess(['frm-entrainement','frm-suivi'])
app/(dash)/formation/modules/[code]/page.tsx   idem ; notFound() si code inconnu/inactif
+ loading.tsx par route (RouteLoading + skeleton), error.tsx hérité de /formation
```

`config/workspaces.ts` : remplacer `frm-overview` par `frm-entrainement` / `frm-suivi`
(rien n'est commité), items : Overview (`frm-suivi`, placeholder), Ma formation
(`frm-entrainement`, placeholder), Modules (anyOf), Catalogue (adminOnly, bottom), Membres.
`PAGE_SLUGS` : `formation`, `frm-entrainement`, `frm-suivi`.

## 6. UI (DA du CRM, sobre)

- **Catalogue** : 2 colonnes — modules à gauche (ordre ↑↓, badge « inactif »), à droite l'en-tête
  du module sélectionné (titre, description, boutons Éditer / Désactiver) et la **table des cas**
  triée par `position` (défaut par difficulté), actions par ligne (Éditer, Dupliquer,
  Activer/Désactiver, ↑↓). Bouton « Nouveau cas » ; « Nouveau module » en tête de colonne.
- **Dialog cas** : la sorte se choisit à la création (solo / défi simultané / boss final), puis
  les sections dans l'ordre où le chatter les rencontre — *Identité* (titre, phase, difficulté,
  messages max, vente, section) · *Ce que voit le chatter* (contexte, objectif, ligne cible) ·
  puis selon la sorte : solo → *Le fan* (prénom, consigne IA) · *Ouverture* (messages : qui /
  texte, ordonnables) · *Après coup* (attendu) ; défi → *Chrono* + *5 conversations* (cas solo
  du module + prénom) ; boss → *Chrono* + *Fans* (par fan : visibles, message d'ouverture,
  cachés). Un texte d'aide sous chaque champ « caché » rappelle qu'il pilote l'IA et n'est
  jamais montré.
- **Dialog module** : identité, cours (Textarea large + onglet Aperçu), axes du barème
  (lignes clé / nom / description), sections.
- **Modules (lecture)** : cartes → page module à 2 onglets, cours en typographie lisible
  (`max-w-prose`), cas listés « à faire » (pas d'état). Zéro badge, zéro médaille.
- Code couleur : la face Formation n'a pas encore de couleur attitrée ; **on n'en introduit
  pas** ici (neutre), à décider avec Ma formation.

## 7. Validation & erreurs

- Zod v4 partagé (`schema.ts`) : union discriminée sur `kind` ; longueurs alignées sur les
  `check` SQL, `speaker` enum, `difficulty` int 1-10, `max_turns` int 1-50, `reaction_max_s`
  10-600 (obligatoire hors solo), solo : `messages` min 0 (un cas peut démarrer à vide),
  défi : exactement 5 créneaux, boss : 1 à 5 fans, `axes` min 1 (un module sans axe n'est pas
  notable — refus métier), `code` jamais saisi.
- Actions : autorisation en tête (`requireAdminProfile`), garde impersonation, `BusinessError`
  français pour les refus métier (ex. « Un module doit avoir au moins un axe de notation »).
  Créer un cas dans un module inactif est autorisé (il apparaîtra à la réactivation).
- Services : erreurs Supabase thrown → `error.tsx` de la face.
- `revalidatePath('/formation/catalogue')`, `/formation/modules` (+ `[code]`) après mutation.

## 8. Tests

- `packages/core` n'est pas concerné (pas de logique de domaine ici).
- Vitest ad hoc côté web (comme la vérif de la face) sur : `canAccessNav` avec `anyOf`,
  `mergePages` avec les nouveaux slugs, le générateur de seed (`gen-training-seed.mjs` :
  conversion HTML→Markdown sur des fragments, comptages 7/10/85/25/5/229/30, refus d'un défi
  dont un créneau référence un cas d'un autre module).
- Vérif manuelle : `supabase db push --dry-run` puis push UAT ; ouvrir Catalogue, éditer un
  cas, dupliquer, réordonner ; ouvrir Modules en tant qu'un membre avec `frm-entrainement`
  seul (« en tant que »).

## 9. Découpage en PRs (détail dans le plan)

1. `0113` schéma + RLS + types générés + slugs (`frm-entrainement`/`frm-suivi`, `anyOf`).
2. Script de seed + `0114` (revue du Markdown des 6 cours).
3. Catalogue admin — lecture (Template, liste modules, table cas, squelettes, route).
4. Catalogue admin — écriture modules (dialog + actions + reorder/toggle).
5. Catalogue admin — écriture cas (dialog des 3 sortes + messages / créneaux / fans + actions
   + duplicate).
6. Modules (lecture) — liste + page module (cours + cas) + `react-markdown`.

Ordre pensé pour que chaque PR soit visible dans l'app ; 3 → 6 peuvent se relire en une
seule revue si on préfère.
