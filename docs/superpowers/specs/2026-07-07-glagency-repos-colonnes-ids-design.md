# Design — Planning repos : colonnes & cellules par IDs, compo hebdo éditable

> Date : 2026-07-07 · Statut : **design validé** (Benoit) · Feature : `apps/web/src/features/repos`

## 1. Objectif

Aujourd'hui les libellés de colonnes du Planning des repos (« Carla + Alice + Julie »,
« Lena + Jade », …, « Managers », « Policiers ») sont **codés en dur** dans `types.ts`
(`REPOS_COLUMNS`), et les cellules stockent des **prénoms en texte libre**. Quand un manager
change de modèle ou qu'un nouveau arrive, il faut modifier le code.

But : rendre la **compo des colonnes éditable par l'admin** depuis l'interface (crayon), en
**stockant des IDs** plutôt que du texte, sans dupliquer de données et **sans toucher au reste du
CRM**.

**Entités (important)** : une colonne (« Carla + Alice + Julie », « Lena + Jade », …) est un
**groupe de modèles** = des `creators` (créatrices OF), PAS des chatteurs. Le crayon édite donc
les **modèles** de la colonne. Les **cellules** (par jour) listent les **chatteurs au repos** =
des `chatters`. Deux entités distinctes : header = `creator_id[]`, cellules = `chatter_id[]`.

## 2. Décisions actées (brainstorming)

- **Périmètre** : renommer/recomposer les colonnes existantes. Pas d'ajout/suppression de
  colonnes (jeu de colonnes fixe : `g1…g6` + `managers` + `policiers`).
- **Portée temporelle** : « à partir de maintenant » — une modif s'applique à la **semaine
  affichée et aux suivantes** ; les semaines passées gardent leur compo (historique figé).
  L'ancrage est la **semaine sélectionnée dans le menu**, pas la vraie semaine courante.
- **Header dérivé des IDs (modèles)** : le libellé d'une colonne est **calculé** depuis une liste
  de `creator_id` (noms des modèles toujours à jour), pas un texte tapé à la main. Le crayon
  liste les **modèles actifs** (`creators.active`).
- **Cellules en IDs (chatteurs)** : une cellule stocke des `chatter_id[]` (chatteurs au repos),
  avec fallback texte pour l'encadrement hors-liste. **Inchangé** dans son principe.
- **Backfill complet de l'existant** (décision Benoit) : la seule semaine déjà saisie
  (`2026-07-06`) est convertie à **100 % en `chatter_id`** pour partir propre sur la convention.
  Les 129 pseudos des colonnes modèles ont tous été rattachés (auto + validation manuelle,
  cf. §3.3). Les cellules encadrement (managers/policiers) **restent en texte**.
- **Impact local au planning** : la compo des colonnes est propre au planning repos. Elle ne
  modifie **jamais** `chatters.team_id` → aucun effet sur insights / compta / creator_daily,
  et pas de recalcul rétroactif des plannings passés.
- **Sécu** : le crayon (édition de compo) est **admin only**, vérifié **au front ET au back**
  (garde `role='admin'` dans l'action + policy RLS admin en écriture).
- **Encadrement** : « Managers » / « Policiers » restent des **libellés de rôle fixes**. Leurs
  cellules restent éditables comme aujourd'hui (chatteurs cochés + « Autre » en texte libre).
  Pas de crayon de compo dessus.

## 3. Modèle de données (migration `0022_rest_planning_column_members.sql`)

### 3.1 Nouvelle table — compo datée des colonnes (modèles)

```sql
create table rest_planning_column_members (
  col            text not null,           -- clé de colonne modèle : g1…g6
  effective_from date not null,           -- lundi à partir duquel cette compo s'applique
  creator_ids    uuid[] not null default '{}',  -- MODÈLES (creators) composant la colonne
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id) on delete set null,
  primary key (col, effective_from)
);
```

**Résolution du libellé** d'une colonne `C` pour la semaine `W` :
la ligne `(col=C)` au plus grand `effective_from ≤ W`. Si aucune → **libellé par défaut** du code
(`REPOS_COLUMNS[C].label`). Les noms affichés sont résolus en direct depuis `creators` (`name`),
donc toujours à jour même si `creator_ids` est figé.

`managers` / `policiers` ne sont **jamais** stockés ici (libellés fixes).

**Seed initial** (dans la migration `0022`) — la compo actuelle codée en dur, parsée en
`creator_id`, `effective_from = '2026-07-06'` (semaine existante), pour que le header affiche des
chips dès la mise en prod. Tous les modèles résolvent vers **1 seul creator actif** (vérifié) :

| Col | Modèles (creator_id) |
|---|---|
| g1 | Carla `67996f82-bc4a-5bfc-8dbb-dbb7c8e2d69e`, Alice `07911c5d-b2cd-5871-9305-e27d2ef33c82`, Julie `1c16f17e-1361-5212-8ca1-18608a2904ba` |
| g2 | Lena `42b117eb-a6ba-5b1e-9ef9-9f81f9c7bcae`, Jade `53c0bcf5-75ba-57d3-8176-669a623a938f` |
| g3 | Sarah `7d37f916-8691-53af-be62-0f136e6ef7f4`, Emma `43e41213-bb5a-5d8d-b248-ee8a7a5ad3dd`, Claire `04bc4ce2-352e-5994-b6ca-5f5c6d6c29d5` |
| g4 | Lucie `90522f8b-8b13-58c1-97e9-4bf3ecf312be` |
| g5 | Lola `2dd21463-b8e8-5804-98e6-e45abf3e0d96`, Mathilde `c5c04147-2fc7-5878-ace3-0d2eff26602f` |
| g6 | Manon `64a0afb3-a71f-59a9-99e7-bc4a001ed1f6`, Maeva `3b2606d5-d53e-5079-8c6c-10cb79588390` |

### 3.2 Cellules — passage texte → IDs

`rest_planning_cells` : ajout d'une colonne `chatter_ids uuid[] not null default '{}'`.
On **conserve `names text`** pour :
- la rétro-compat (données texte existantes affichées telles quelles),
- l'encadrement hors-liste (managers/policiers non chatteurs) via le champ « Autre ».

Affichage d'une cellule : si `chatter_ids` non vide → noms résolus depuis `chatters`
(**y compris chatteurs inactifs**, pour les cellules historiques), sinon → `names`.

**Résolution des noms → `chatterById`** : `get-repos` doit résoudre les IDs référencés par les
cellules ET les colonnes, ce qui inclut potentiellement des chatteurs `active = false`
(ex. Tsilavo). Charger les noms depuis **tous** les chatteurs référencés, pas seulement les
actifs (les actifs restent la source des *options* de saisie).

### 3.3 Backfill de la semaine existante (`2026-07-06`)

Conversion des cellules `g1…g6` de `names` (texte) vers `chatter_ids`. Règle de résolution par
token (split sur `,`, trim, insensible à la casse) :

1. **Override explicite** (table ci-dessous) — prioritaire.
2. Sinon **1 seul chatteur actif** dont `display_name` = token (106 tokens).
3. Sinon **1 seul chatteur via `chatter_alias`** (exact/normalisé) (6 tokens : `kwasi`, `Kwasi`,
   `Big Joe`, `SOS'GOD`, `Tagwalter`, `Yann`).

Les 3 règles couvrent **129/129** pseudos. Les cellules `managers`/`policiers` ne sont **pas**
converties (restent en `names`). Le champ `names` des cellules converties peut être vidé
(l'affichage privilégie `chatter_ids`).

**Table d'override (17 mappings validés — pseudo saisi → chatter_id) :**

| Pseudo | Chatteur | chatter_id | Note |
|---|---|---|---|
| Ahmed | Ahmedkoriko | `e1c47f4a-1bd6-5043-b7f1-148a6b03f5e4` | pseudo raccourci |
| Angela | Angelachat | `4e1f8871-935b-5db0-876f-7dbb417c35e3` | pseudo raccourci |
| Josaphat | Josaphat (Ghost) | `3d8b0f54-edd5-5fed-b338-36e523135efb` | suffixe |
| Lina | Linah | `bdc34370-bbee-537e-a44f-e3c9c52d08d8` | variante |
| Soa Ni | Soa Nii | `72c4fb05-679a-52f9-b1b3-76545a88ae88` | variante |
| Volana Zoely | Volana | `b4d06da5-2d46-516c-8c2f-ee0a69b192a7` | raccourci |
| Gédeon | Gedeon | `c88e3377-47c5-42b3-bfcf-8ede709ed629` | accent |
| workhard | Work hard | `a4c2f416-bcba-55bf-a60c-41cbaed680fb` | espace |
| Jaureskpd | Jaurekpd | `1f074af5-0994-46c9-86dc-f90071c86995` | 1 lettre |
| Eriely | Erlelly | `68647276-ae2c-5aa7-b3dc-347a0b994916` | alias « Erielly » |
| Ornella | Ornela | `51457d88-b78e-5358-ae0f-0985459d100d` | 1 L |
| Rockie | Rocky | `627422c1-e461-4c90-aedd-69faeebe0e3a` | faute de frappe |
| Leonard | Lebon | `f4b1bbf6-e791-5128-9398-169a7f487644` | validé Benoit |
| Osirix | Glorieux | `26dae017-1a1d-5d6b-9357-39cde06be43f` | validé Benoit |
| Princy | Primus | `dbfb3ef7-8122-5c6d-87e1-2f99be217fd5` | validé Benoit |
| Flo | André | `482fdf30-7fe6-5205-b6be-c6e0ac6b9309` | validé Benoit (alias « Florent ») |
| Tsilavo | *(inactif)* | `586fec9f-32d9-5c49-a216-a8da4bfd9e26` | **inactif**, `display_name` = email → cellule affichera l'email (nettoyage `display_name` possible plus tard) |

Le backfill se fait dans la migration `0022` (une seule semaine, déterministe). Chaque token est
mappé ci-dessus vers un `chatter_id` **unique et vérifié** (aucune ambiguïté résiduelle).

### 3.4 RLS

```sql
alter table rest_planning_column_members enable row level security;

-- Lecture : tous ceux qui voient le planning (admins + sous-managers page `repos`).
create policy rest_colmembers_read on rest_planning_column_members
  for select to authenticated using (public.has_page('repos'));

-- Écriture : admin uniquement.
create policy rest_colmembers_write on rest_planning_column_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

Helper `public.is_admin()` (créé s'il n'existe pas, même forme `security definer` que
`has_page`) : `exists(select 1 from profiles where id = auth.uid() and role = 'admin')`.

La colonne `chatter_ids` de `rest_planning_cells` reste sous les policies `repos` existantes
(les sous-managers éditent les cellules ; seule la **compo des colonnes** est réservée admin).

## 4. Serveur (`features/repos`)

### 4.1 `services/get-repos.ts`
- Requête additionnelle : `rest_planning_column_members` filtrée `effective_from ≤ weekStart`,
  on garde par `col` la ligne au plus grand `effective_from`.
- Charge **`creators` actifs** (`id, name`) → `creatorById` (id→nom) + `creatorOptions` (options
  du crayon) ; résout `creator_ids` → `name` pour le label des colonnes.
- Charge **`chatters`** (`id, display_name, active`) → `chatterById` (tous, inactifs inclus, pour
  l'affichage des cellules historiques) + `chatterOptions` (actifs, options de saisie cellules).
- Construit `columns: { key, label, encadrement, creatorIds }[]` : label = compo modèles résolue,
  sinon défaut code.
- `ReposData` gagne : `columns`, `creatorById`, `creatorOptions`, `chatterById`, `chatterOptions`.

### 4.2 `actions.ts`
- `saveReposCell` : accepte désormais `chatterIds: uuid[]` (+ `names` pour le libre). Zod adapté.
- **Nouvelle action `saveReposColumnMembers({ col, effectiveFrom, creatorIds })`** :
  - garde `role='admin'` strict (pas `has_page`),
  - `col` ∈ `g1…g6` uniquement (rejette managers/policiers),
  - upsert sur `(col, effective_from)` de `creator_ids`. Vidé → surcharge vide de cette semaine
    (le header retombe sur son libellé par défaut si aucune compo antérieure).
  - `revalidatePath('/chatter/repos')`.

## 5. Client

### 5.1 Propagation `isAdmin`
`page.tsx` (a déjà `profile` via `requireAccess('repos')`) passe `isAdmin = profile.role==='admin'`
→ `ReposTemplate` → `PlanningGrid`.

### 5.2 En-têtes
La grille et l'export PNG mappent sur `data.columns` (au lieu de `REPOS_COLUMNS`) pour les
**libellés** ; les clés et le flag `encadrement` restent la structure fixe du code.

**Rendu du header (colonnes modèles)** : la compo est affichée en **chips** (un chip par
**modèle**), pas en texte « A + B + C » — on retire les séparateurs « + ». Couleur des chips :
**violet/indigo** (`bg-violet-100 text-violet-800` / dark `bg-violet-950 text-violet-300`),
volontairement **distincte** du vert (repos posé) et du rouge (>2 repos) utilisés dans les
cellules — le violet = « quels modèles dans la colonne », vert/rouge = « quel chatteur au repos ».
Managers / Policiers gardent leur libellé texte fixe (pas de chips).

Sur chaque en-tête de **colonne modèle**, si `isAdmin` : **crayon au survol** (à côté des chips).
Clic → popover sélecteur de **modèles** (même composant de multi-select que les cellules, alimenté
par `creatorOptions`) = la compo de la colonne. À la validation : `saveReposColumnMembers({ col,
effectiveFrom: data.weekStart, creatorIds })`, mise à jour optimiste locale. Pas de crayon sur
managers/policiers.

### 5.3 Cellules (`CellEditor`)
- Les coches renvoient des `chatter_id` (le composant travaille en `{id, name}` au lieu de nom nu).
- Le champ « Autre (manager/policier…) » alimente toujours `names` (texte libre).
- Affichage des chips : nom résolu depuis `chatterById` pour les IDs, sinon texte `names`.
- Rouge « >2 repos même colonne » : comparaison par `chatter_id` (exact), plus par prénom
  normalisé.

## 6. Hors périmètre
- Ajout / suppression / réordonnancement de colonnes.
- Édition de la compo des colonnes encadrement (managers/policiers).
- Toute modification de `chatters.team_id` ou des données globales (insights/compta).
- Migration de masse des cellules texte existantes vers des IDs.

## 7. Fichiers touchés
- `packages/db/supabase/migrations/0022_rest_planning_column_members.sql` (nouveau)
- `apps/web/src/features/repos/types.ts`
- `apps/web/src/features/repos/services/get-repos.ts`
- `apps/web/src/features/repos/actions.ts`
- `apps/web/src/features/repos/ReposTemplate.tsx`
- `apps/web/src/features/repos/components/planning-grid.tsx`
- `apps/web/src/app/(dash)/chatter/repos/page.tsx`
