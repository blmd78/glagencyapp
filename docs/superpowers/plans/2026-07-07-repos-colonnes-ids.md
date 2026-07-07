# Planning repos — colonnes & cellules par IDs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la compo des colonnes (= **modèles**) du Planning des repos éditable par l'admin (crayon), en stockant des IDs au lieu de texte : header = `creator_id`, cellules = `chatter_id`. Header en chips violets.

**Architecture:** Une table datée `rest_planning_column_members` porte la compo `creator_id[]` (**modèles**) de chaque colonne, résolue « à partir de la semaine affichée » (dernier `effective_from ≤ week`). Les cellules (chatteurs au repos) gagnent une colonne `chatter_ids uuid[]` (fallback `names` texte conservé). Le header dérive ses chips des noms de modèles. Le crayon est admin only (garde serveur `role='admin'` + policy RLS `is_admin()`), local au planning (ne touche jamais `chatters.team_id` ni `creators`).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui (Popover, Checkbox, Input, Button), Supabase (supabase-js + RLS), Zod, Server Actions.

## Global Constraints

- **Mutations = Server Actions** (convention archi-web), jamais d'appel supabase-js client. RLS = garde-fou.
- **Sécu crayon** : édition de compo réservée admin, vérifiée **au front ET au back** (`role='admin'` dans l'action + policy RLS `public.is_admin()`).
- **`public.is_admin()` existe déjà** (migration `0008`) — le réutiliser, ne pas le recréer.
- **Local au planning** : aucune écriture sur `chatters.team_id` ni sur des données globales (insights/compta).
- **Pas de test runner** dans `apps/web` (pas de Vitest). Vérification de chaque tâche = `cd apps/web && pnpm typecheck` + `pnpm lint`, plus exécution réelle via le skill `/verify` pour les tâches UI. Ne PAS ajouter d'infra de test.
- **Design** : header modèles en chips **violet/indigo** (`bg-violet-100 text-violet-800` / dark `bg-violet-950 text-violet-300`), distinct du vert/rouge des cellules. Pas de « + » séparateurs. Managers/Policiers = libellé texte fixe. Rester sobre (pas d'ornement).
- **Colonnes fixes** : `g1…g6` (modèles) + `managers` + `policiers`. Pas d'ajout/suppression/réordonnancement.
- **Migration** : prochain numéro = `0022`. Appliquée via Supabase (MCP `apply_migration` ou CLI) sur projet `cqmfpsnqaxymswijdnfz`.

---

## File Structure

- `packages/db/supabase/migrations/0022_rest_planning_column_members.sql` — **créer** : nouvelle table + RLS + colonne `chatter_ids` sur `rest_planning_cells` + backfill semaine `2026-07-06`.
- `apps/web/src/features/repos/types.ts` — **modifier** : nouvelle forme de `ReposData` (colonnes résolues + `creatorById/creatorOptions`, `chatterById/chatterOptions`, cellules `{chatterIds, names}`).
- `apps/web/src/features/repos/services/get-repos.ts` — **modifier** : charger creators (header) + chatters (cellules) + compo datée, résoudre libellés & noms.
- `apps/web/src/features/repos/actions.ts` — **modifier** : `saveReposCell` accepte `chatterIds` ; ajouter `saveReposColumnMembers` (admin).
- `apps/web/src/app/(dash)/chatter/repos/page.tsx` — **modifier** : passer `isAdmin`.
- `apps/web/src/features/repos/ReposTemplate.tsx` — **modifier** : propager `isAdmin`.
- `apps/web/src/features/repos/components/planning-grid.tsx` — **modifier** : cellules en IDs, header chips violets + crayon admin, règle rouge par ID, export PNG.
- `apps/web/src/features/repos/components/entity-multiselect.tsx` — **créer** : popover multi-select générique `{id,name}` réutilisé par les cellules (chatteurs) ET le crayon header (modèles) (DRY).

---

## Task 1 : Migration DB (table compo + `chatter_ids` cellules + backfill)

**Files:**
- Create: `packages/db/supabase/migrations/0022_rest_planning_column_members.sql`

**Interfaces:**
- Produces (schéma consommé par get-repos/actions) :
  - table `rest_planning_column_members(col text, effective_from date, creator_ids uuid[], updated_at timestamptz, updated_by uuid, pk(col, effective_from))` — **modèles** (creators), pas chatteurs
  - `rest_planning_cells.chatter_ids uuid[] not null default '{}'` — **chatteurs** (cellules)

- [ ] **Step 1 : Écrire la migration**

Créer `packages/db/supabase/migrations/0022_rest_planning_column_members.sql` :

```sql
-- 0022 — Planning repos : compo des colonnes modèles en IDs + cellules en IDs.
-- La compo d'une colonne (g1…g6) est datée (effective_from = lundi) et LOCALE au planning
-- (ne touche jamais chatters.team_id). Édition réservée admin (is_admin, cf. 0008).
-- Les cellules passent en chatter_ids[] (fallback names texte conservé pour l'encadrement).

-- 1) Compo datée des colonnes = MODÈLES (creators), pas chatteurs
create table rest_planning_column_members (
  col            text not null,                 -- g1…g6 (jamais managers/policiers)
  effective_from date not null,                 -- lundi à partir duquel la compo s'applique
  creator_ids    uuid[] not null default '{}',  -- modèles (creators) de la colonne
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id) on delete set null,
  primary key (col, effective_from)
);

alter table rest_planning_column_members enable row level security;

-- Lecture : tous ceux qui voient le planning (admins + page `repos`).
create policy rest_colmembers_read on rest_planning_column_members
  for select to authenticated using (public.has_page('repos'));

-- Écriture : admin uniquement.
create policy rest_colmembers_write on rest_planning_column_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed initial : compo actuelle (codée en dur) parsée en creator_id, effective_from = semaine
-- existante, pour que le header affiche des chips dès la prod. IDs vérifiés (1 creator actif each).
insert into rest_planning_column_members (col, effective_from, creator_ids) values
  ('g1','2026-07-06', array['67996f82-bc4a-5bfc-8dbb-dbb7c8e2d69e','07911c5d-b2cd-5871-9305-e27d2ef33c82','1c16f17e-1361-5212-8ca1-18608a2904ba']::uuid[]),
  ('g2','2026-07-06', array['42b117eb-a6ba-5b1e-9ef9-9f81f9c7bcae','53c0bcf5-75ba-57d3-8176-669a623a938f']::uuid[]),
  ('g3','2026-07-06', array['7d37f916-8691-53af-be62-0f136e6ef7f4','43e41213-bb5a-5d8d-b248-ee8a7a5ad3dd','04bc4ce2-352e-5994-b6ca-5f5c6d6c29d5']::uuid[]),
  ('g4','2026-07-06', array['90522f8b-8b13-58c1-97e9-4bf3ecf312be']::uuid[]),
  ('g5','2026-07-06', array['2dd21463-b8e8-5804-98e6-e45abf3e0d96','c5c04147-2fc7-5878-ace3-0d2eff26602f']::uuid[]),
  ('g6','2026-07-06', array['64a0afb3-a71f-59a9-99e7-bc4a001ed1f6','3b2606d5-d53e-5079-8c6c-10cb79588390']::uuid[]);

-- 2) Cellules : ajout des IDs chatteurs (on garde names pour l'existant / encadrement hors-liste)
alter table rest_planning_cells add column chatter_ids uuid[] not null default '{}';

-- 3) Backfill de la seule semaine existante (2026-07-06), colonnes modèles g1…g6.
--    Résolution par token : override explicite > 1 chatteur actif par display_name >
--    1 chatteur par alias. Couvre 129/129 pseudos. managers/policiers non touchés.
with tokens as (
  select c.week_start, c.day, c.col, trim(t) as tok, ord
  from rest_planning_cells c,
       lateral unnest(string_to_array(c.names, ',')) with ordinality as u(t, ord)
  where c.week_start = date '2026-07-06'
    and c.col in ('g1','g2','g3','g4','g5','g6')
    and coalesce(trim(c.names),'') <> ''
),
override(tok, cid) as (values
  ('Ahmed','e1c47f4a-1bd6-5043-b7f1-148a6b03f5e4'::uuid),
  ('Angela','4e1f8871-935b-5db0-876f-7dbb417c35e3'),
  ('Josaphat','3d8b0f54-edd5-5fed-b338-36e523135efb'),
  ('Lina','bdc34370-bbee-537e-a44f-e3c9c52d08d8'),
  ('Soa Ni','72c4fb05-679a-52f9-b1b3-76545a88ae88'),
  ('Volana Zoely','b4d06da5-2d46-516c-8c2f-ee0a69b192a7'),
  ('Gédeon','c88e3377-47c5-42b3-bfcf-8ede709ed629'),
  ('workhard','a4c2f416-bcba-55bf-a60c-41cbaed680fb'),
  ('Jaureskpd','1f074af5-0994-46c9-86dc-f90071c86995'),
  ('Eriely','68647276-ae2c-5aa7-b3dc-347a0b994916'),
  ('Ornella','51457d88-b78e-5358-ae0f-0985459d100d'),
  ('Rockie','627422c1-e461-4c90-aedd-69faeebe0e3a'),
  ('Leonard','f4b1bbf6-e791-5128-9398-169a7f487644'),
  ('Osirix','26dae017-1a1d-5d6b-9357-39cde06be43f'),
  ('Princy','dbfb3ef7-8122-5c6d-87e1-2f99be217fd5'),
  ('Flo','482fdf30-7fe6-5205-b6be-c6e0ac6b9309'),
  ('Tsilavo','586fec9f-32d9-5c49-a216-a8da4bfd9e26')
),
resolved as (
  select tk.week_start, tk.day, tk.col, tk.ord, tk.tok,
    coalesce(
      (select o.cid from override o where lower(o.tok) = lower(tk.tok)),
      (select ch.id from chatters ch
         where ch.active and lower(trim(ch.display_name)) = lower(tk.tok)
         group by ch.id having count(*) = 1 limit 1),
      (select a.chatter_id from chatter_alias a
         where lower(trim(a.raw_label)) = lower(tk.tok)
            or a.raw_label_norm = lower(regexp_replace(tk.tok,'[^[:alnum:]]','','g'))
         group by a.chatter_id limit 1)
    ) as cid
  from tokens tk
),
agg as (
  select week_start, day, col,
         array_agg(cid order by ord) filter (where cid is not null) as ids,
         string_agg(tok, ', ' order by ord) filter (where cid is null) as leftover
  from resolved
  group by week_start, day, col
)
update rest_planning_cells c
set chatter_ids = coalesce(a.ids, '{}'),
    names       = coalesce(a.leftover, '')
from agg a
where c.week_start = a.week_start and c.day = a.day and c.col = a.col;
```

- [ ] **Step 2 : Appliquer la migration**

Via MCP Supabase `apply_migration` (name `0022_rest_planning_column_members`, project `cqmfpsnqaxymswijdnfz`) OU `supabase db push` si CLI liée.

- [ ] **Step 3 : Vérifier le backfill (aucun leftover attendu sur g1…g6)**

Exécuter (MCP `execute_sql`) :

```sql
select
  count(*) filter (where col in ('g1','g2','g3','g4','g5','g6')
                     and coalesce(trim(names),'') <> '') as g_leftover_cells,
  sum(cardinality(chatter_ids)) filter (where col in ('g1','g2','g3','g4','g5','g6')) as g_ids
from rest_planning_cells where week_start = date '2026-07-06';
```

Expected : `g_leftover_cells = 0` (tous les tokens g1…g6 résolus en IDs), `g_ids` ≈ 129+ (total des repos modèles). Les cellules `managers`/`policiers` conservent leur `names` (non comptées ici).

Vérifier aussi le seed des modèles :

```sql
select col, cardinality(creator_ids) as n from rest_planning_column_members
where effective_from = date '2026-07-06' order by col;
```

Expected : g1=3, g2=2, g3=3, g4=1, g5=2, g6=2.

- [ ] **Step 4 : Régénérer les types DB (si le repo publie des types générés)**

Vérifier `packages/db` pour un fichier de types généré (`grep -rl "rest_planning_cells" packages/db/src 2>/dev/null`). S'il existe, régénérer via `supabase gen types` (ou MCP `generate_typescript_types`) et remplacer le fichier. Sinon, ignorer cette étape.

- [ ] **Step 5 : Commit**

```bash
git add packages/db/supabase/migrations/0022_rest_planning_column_members.sql
git commit -m "feat(repos): table compo colonnes + chatter_ids cellules + backfill semaine 2026-07-06"
```

---

## Task 2 : Types de la feature (`types.ts`)

**Files:**
- Modify: `apps/web/src/features/repos/types.ts`

**Interfaces:**
- Produces :
  - `interface ReposColumn { key: ReposColKey; label: string; encadrement: boolean; creatorIds: string[] }` (compo = **modèles**)
  - `interface ReposCell { chatterIds: string[]; names: string }` (cellule = **chatteurs**)
  - `ReposData.columns: ReposColumn[]` (résolu serveur)
  - `ReposData.cells: Record<number, Record<string, ReposCell>>`
  - `ReposData.creatorById: Record<string, string>` (id → nom modèle) + `ReposData.creatorOptions: { id: string; name: string }[]` (modèles actifs, options du crayon header)
  - `ReposData.chatterById: Record<string, string>` (id → display_name, inclut inactifs référencés) + `ReposData.chatterOptions: { id: string; name: string }[]` (chatteurs actifs, options des cellules)
  - conserve `REPOS_COLUMNS` (clés + label défaut + encadrement) comme structure fixe / fallback.

- [ ] **Step 1 : Mettre à jour `types.ts`**

Garder `REPOS_COLUMNS`, `ReposColKey`, `JOURS`, `WeekChoice`. Remplacer les champs de `ReposData` liés aux cellules/noms :

```ts
export interface EntityOption { id: string; name: string }

/** Colonne résolue côté serveur : label = compo MODÈLES effective (chips) ou défaut du code. */
export interface ReposColumn {
  key: ReposColKey
  label: string           // fallback affichage (managers/policiers, ou compo vide)
  encadrement: boolean
  creatorIds: string[]    // modèles composant la colonne (vide pour managers/policiers)
}

/** Contenu d'une cellule : chatteurs en IDs + texte libre (encadrement / legacy non résolu). */
export interface ReposCell {
  chatterIds: string[]
  names: string
}

export interface ReposData {
  weekStart: string
  weekLabel: string
  columns: ReposColumn[]                        // remplace l'usage direct de REPOS_COLUMNS pour le rendu
  cells: Record<number, Record<string, ReposCell>>
  creatorById: Record<string, string>           // id -> nom modèle (résolution chips header)
  creatorOptions: EntityOption[]                // modèles actifs (options du crayon)
  chatterById: Record<string, string>           // id -> nom chatteur (affichage cellules, inclut inactifs)
  chatterOptions: EntityOption[]                // chatteurs actifs (options de saisie cellules)
  sentTelegram: boolean
  weeks: WeekChoice[]
}
```

Supprimer les anciens champs `chatterNames` / `chatterTeams` (remplacés par `chatterOptions` / la colonne).

- [ ] **Step 2 : Vérifier**

Run: `cd apps/web && pnpm typecheck`
Expected : des erreurs UNIQUEMENT dans `get-repos.ts` et `planning-grid.tsx` (consommateurs pas encore mis à jour) — c'est normal, corrigées aux tâches suivantes. Aucune erreur dans `types.ts` lui-même.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/repos/types.ts
git commit -m "feat(repos): types colonnes/cellules par IDs"
```

---

## Task 3 : Service `get-repos.ts`

**Files:**
- Modify: `apps/web/src/features/repos/services/get-repos.ts`

**Interfaces:**
- Consumes : schéma Task 1 (`rest_planning_column_members`, `rest_planning_cells.chatter_ids`), types Task 2.
- Produces : `getRepos(week)` retourne un `ReposData` complet (colonnes résolues + `chatterById` + `chatterOptions`).

- [ ] **Step 1 : Réécrire le corps de `getRepos`**

Remplacer les requêtes/parsing par :

```ts
const [
  { data: cellRows }, { data: weekRow },
  { data: chatterRows }, { data: creatorRows }, { data: memberRows },
] = await Promise.all([
  supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
  supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
  supabase.from('chatters').select('id, display_name, active'),
  supabase.from('creators').select('id, name, active'),
  supabase
    .from('rest_planning_column_members')
    .select('col, effective_from, creator_ids')
    .lte('effective_from', weekStart)
    .order('effective_from', { ascending: true }),
])

// --- chatteurs (cellules) : id -> nom (tous, inactifs inclus) + options actifs
const chatterById: Record<string, string> = {}
for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterById[c.id] = c.display_name
const chatterOptions = (chatterRows ?? [])
  .filter((c) => c.active && c.display_name)
  .map((c) => ({ id: c.id as string, name: c.display_name as string }))
  .sort((a, b) => a.name.localeCompare(b.name))

// --- modèles (header) : id -> nom + options actifs
const creatorById: Record<string, string> = {}
for (const c of creatorRows ?? []) if (c.id && c.name) creatorById[c.id] = c.name
const creatorOptions = (creatorRows ?? [])
  .filter((c) => c.active && c.name)
  .map((c) => ({ id: c.id as string, name: c.name as string }))
  .sort((a, b) => a.name.localeCompare(b.name))

// compo effective par colonne = dernier effective_from <= weekStart (rows triées asc → dernier gagne)
const memberByCol: Record<string, string[]> = {}
for (const m of memberRows ?? []) memberByCol[m.col] = (m.creator_ids as string[]) ?? []

// colonnes résolues : label = noms des MODÈLES (join) sinon défaut du code
const columns = REPOS_COLUMNS.map((c) => {
  const ids = memberByCol[c.key] ?? []
  const label = ids.length ? ids.map((id) => creatorById[id] ?? '?').join(' + ') : c.label
  return { key: c.key, label, encadrement: c.encadrement, creatorIds: ids }
})

// cellules { chatterIds, names }
const cells: Record<number, Record<string, ReposCell>> = {}
for (const r of cellRows ?? []) {
  cells[r.day] = {
    ...(cells[r.day] ?? {}),
    [r.col]: { chatterIds: (r.chatter_ids as string[]) ?? [], names: r.names ?? '' },
  }
}

return {
  weekStart,
  weekLabel: weekLabel(weekStart),
  columns,
  cells,
  creatorById,
  creatorOptions,
  chatterById,
  chatterOptions,
  sentTelegram: weekRow?.sent_telegram ?? false,
  weeks,
}
```

Ajouter l'import du type `ReposCell` depuis `../types`. Note : `.order('effective_from', asc)` garantit que la dernière écriture dans `memberByCol` = plus grand `effective_from ≤ weekStart` (bon override).

- [ ] **Step 2 : Vérifier**

Run: `cd apps/web && pnpm typecheck`
Expected : erreurs restantes uniquement dans `planning-grid.tsx` (Task 7). `get-repos.ts` compile.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/repos/services/get-repos.ts
git commit -m "feat(repos): get-repos résout colonnes datées + cellules en IDs"
```

---

## Task 4 : Server Actions (`actions.ts`)

**Files:**
- Modify: `apps/web/src/features/repos/actions.ts`

**Interfaces:**
- Consumes : schéma Task 1.
- Produces :
  - `saveReposCell({ weekStart, day, col, chatterIds: string[], names: string }): Promise<Result>`
  - `saveReposColumnMembers({ col, effectiveFrom, creatorIds: string[] }): Promise<Result>` (admin only, **modèles**)

- [ ] **Step 1 : Mettre à jour `saveReposCell`**

Remplacer `cellInput` et le corps d'upsert :

```ts
const cellInput = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6),
  col: z.string().min(1).max(30),
  chatterIds: z.array(z.string().uuid()).max(200),
  names: z.string().max(1000),
})
// ... dans saveReposCell, après parse :
const { weekStart, day, col, chatterIds, names } = parsed.data
const { error } = await supabase.from('rest_planning_cells').upsert(
  {
    week_start: weekStart, day, col,
    chatter_ids: chatterIds,
    names: names.trim(),
    updated_at: new Date().toISOString(),
    updated_by: profile.id,
  },
  { onConflict: 'week_start,day,col' },
)
```

- [ ] **Step 2 : Ajouter `saveReposColumnMembers` (admin only)**

```ts
const colMembersInput = z.object({
  col: z.enum(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']),   // colonnes modèles uniquement
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creatorIds: z.array(z.string().uuid()).max(50),
})

export async function saveReposColumnMembers(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Accès refusé' }
  const parsed = colMembersInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { col, effectiveFrom, creatorIds } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('rest_planning_column_members').upsert(
    {
      col, effective_from: effectiveFrom, creator_ids: creatorIds,
      updated_at: new Date().toISOString(), updated_by: profile.id,
    },
    { onConflict: 'col,effective_from' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/repos')
  return { success: true }
}
```

Vérifier que `getProfile` est déjà importé (il l'est). Note sécu : garde `role==='admin'` **au back** en plus de la policy RLS `is_admin()` — double barrière.

- [ ] **Step 3 : Vérifier**

Run: `cd apps/web && pnpm typecheck`
Expected : `actions.ts` compile (erreurs restantes seulement `planning-grid.tsx`).

- [ ] **Step 4 : Commit**

```bash
git add apps/web/src/features/repos/actions.ts
git commit -m "feat(repos): actions cellules en IDs + saveReposColumnMembers (admin)"
```

---

## Task 5 : Propager `isAdmin` (page + template)

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/repos/page.tsx`
- Modify: `apps/web/src/features/repos/ReposTemplate.tsx`

**Interfaces:**
- Produces : `ReposTemplate({ data, isAdmin })` puis `<PlanningGrid data isAdmin />`.

- [ ] **Step 1 : `page.tsx` — récupérer et passer `isAdmin`**

`requireAccess('repos')` retourne déjà le profil. Modifier :

```tsx
const profile = await requireAccess('repos')
const { week } = await searchParams
const data = await getRepos(week ?? null)
return <ReposTemplate data={data} isAdmin={profile.role === 'admin'} />
```

- [ ] **Step 2 : `ReposTemplate.tsx` — accepter et transmettre `isAdmin`**

```tsx
export function ReposTemplate({ data, isAdmin }: { data: ReposData; isAdmin: boolean }) {
  // ...
  <PlanningGrid key={data.weekStart} data={data} isAdmin={isAdmin} />
}
```

- [ ] **Step 3 : Vérifier**

Run: `cd apps/web && pnpm typecheck`
Expected : `page.tsx` + `ReposTemplate.tsx` compilent ; `PlanningGrid` signale `isAdmin` inconnu → corrigé Task 7/8.

- [ ] **Step 4 : Commit**

```bash
git add "apps/web/src/app/(dash)/chatter/repos/page.tsx" apps/web/src/features/repos/ReposTemplate.tsx
git commit -m "feat(repos): propage isAdmin page -> template -> grid"
```

---

## Task 6 : Composant multi-select générique (`entity-multiselect.tsx`)

**Files:**
- Create: `apps/web/src/features/repos/components/entity-multiselect.tsx`

**Interfaces:**
- Consumes : options `{id,name}` + `nameById` (Task 2/3) — générique (modèles OU chatteurs).
- Produces : composant `EntityMultiSelect` réutilisé par cellules (chatteurs) ET crayon header (modèles).

```ts
export interface EntityMultiSelectProps {
  /** Élément rendu (déclencheur : chips + éventuel crayon). */
  trigger: React.ReactNode
  /** Valeur courante = IDs sélectionnés. */
  value: string[]
  /** Options sélectionnables (actifs). */
  options: { id: string; name: string }[]
  /** id -> nom, pour afficher des IDs hors options (ex. inactifs déjà présents). */
  nameById: Record<string, string>
  /** Autoriser l'ajout de texte libre (encadrement) — sinon champ masqué. */
  allowCustom?: boolean
  /** Texte libre courant (cellules encadrement). */
  customValue?: string
  /** Placeholder du champ recherche (ex. « Rechercher un chatteur… » / « … un modèle… »). */
  searchPlaceholder?: string
  /** Commit à la fermeture : IDs sélectionnés + texte libre (vide si !allowCustom). */
  onCommit: (next: { ids: string[]; names: string }) => void
}
export function EntityMultiSelect(props: EntityMultiSelectProps): React.JSX.Element
```

- [ ] **Step 1 : Écrire le composant**

Reprendre la logique du `CellEditor` actuel (`planning-grid.tsx`) mais en travaillant sur des **IDs** : Popover + Input recherche + liste `Checkbox` sur `options` (label = `name`), + (si `allowCustom`) champ « Autre » alimentant `names`. Les options affichées incluent aussi les IDs déjà dans `value` absents de `options` (résolus via `nameById`, décochables). `onCommit({ ids, names })` renvoyé à la fermeture du popover. Le `trigger` est fourni par l'appelant (chips de cellule, ou chips de header + crayon).

- [ ] **Step 2 : Vérifier**

Run: `cd apps/web && pnpm typecheck`
Expected : le fichier compile (pas encore importé ailleurs).

- [ ] **Step 3 : Commit**

```bash
git add apps/web/src/features/repos/components/entity-multiselect.tsx
git commit -m "feat(repos): EntityMultiSelect générique (IDs + texte libre)"
```

---

## Task 7 : Grille — cellules en IDs (`planning-grid.tsx`)

**Files:**
- Modify: `apps/web/src/features/repos/components/planning-grid.tsx`

**Interfaces:**
- Consumes : `ReposData` (Task 2), `EntityMultiSelect` (Task 6), `saveReposCell` (Task 4).

- [ ] **Step 1 : Adapter l'état et les helpers aux `ReposCell`**

- Signature : `PlanningGrid({ data, isAdmin }: { data: ReposData; isAdmin: boolean })`.
- `overrides` devient `Record<string, ReposCell>` ; `cellValue(day,col): ReposCell` retourne `overrides[k] ?? data.cells[day]?.[col] ?? { chatterIds: [], names: '' }`.
- Affichage des noms d'une cellule : `cell.chatterIds.map((id) => data.chatterById[id] ?? '?')` **concaténé** aux tokens de `cell.names` (split virgule) pour le fallback encadrement.
- Remplacer `CellEditor` par `EntityMultiSelect` (trigger = chips verts/rouges existants ; `value = cell.chatterIds` ; `options = data.chatterOptions` ; `nameById = data.chatterById` ; `allowCustom` = true ; `customValue = cell.names` ; `searchPlaceholder = 'Rechercher un chatteur…'`).
- `commitCell(day, col, next: { ids, names })` : maj override + `saveReposCell({ weekStart, day, col, chatterIds: next.ids, names: next.names })`.

- [ ] **Step 2 : Règle rouge par ID**

`overNamesByCol` → `overIdsByCol: Map<colKey, Set<string>>` : compter par `(col, chatter_id)` sur les 7 jours ; `> 2` ⇒ rouge. Pour les tokens texte (encadrement/legacy), conserver le comptage par nom normalisé existant en fallback (clé = `txt:<normName>`), afin de ne pas régresser sur les cellules encore en texte. Le chip rouge s'applique si l'id (ou le nom normalisé) est dans le sur-repos.

- [ ] **Step 3 : Compteurs & PNG**

- `countFor(col)` = `cardinality(chatterIds) + nb tokens names` par jour, sommé.
- Boucles `REPOS_COLUMNS.map`/`.forEach` de rendu **et** de l'export PNG → utiliser `data.columns` (label résolu). Le contenu texte des cellules dans le PNG = noms résolus (`chatterById`) + tokens `names`.

- [ ] **Step 4 : Vérifier (typecheck + lint)**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected : PASS (0 erreur).

- [ ] **Step 5 : Vérifier en réel**

Lancer l'app (skill `/verify` ou `cd apps/web && pnpm dev`), ouvrir `/chatter/repos` : les cellules de la semaine `2026-07-06` affichent les mêmes noms qu'avant (résolus depuis les IDs), le vert/rouge est cohérent, l'édition d'une cellule enregistre (recharger → persiste), l'export PNG est correct.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/src/features/repos/components/planning-grid.tsx
git commit -m "feat(repos): cellules éditées/affichées en IDs + règle rouge par ID"
```

---

## Task 8 : Header en chips violets + crayon admin

**Files:**
- Modify: `apps/web/src/features/repos/components/planning-grid.tsx`

**Interfaces:**
- Consumes : `data.columns`, `data.creatorById`, `data.creatorOptions`, `EntityMultiSelect`, `saveReposColumnMembers` (Task 4), `isAdmin`.

- [ ] **Step 1 : Rendu des en-têtes modèles en chips**

Dans la 2e ligne de `<thead>`, pour chaque colonne de `data.columns` :
- **Managers/Policiers** (`encadrement`) : garder le libellé texte fixe (`c.label`).
- **Modèles** (`g1…g6`) : afficher `c.creatorIds` (noms via `data.creatorById`) en **chips violets** (`bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 rounded px-1.5 py-0.5 text-xs`). Si `creatorIds` vide → afficher `c.label` (libellé défaut) en texte discret. **Pas de « + »**.

- [ ] **Step 2 : Crayon admin + éditeur de compo**

Si `isAdmin` et colonne modèle : afficher une icône crayon (`Pencil` de `lucide-react`) au survol de l'en-tête (`opacity-0 group-hover:opacity-70`), déclenchant un `EntityMultiSelect` :
- `value = c.creatorIds` ; `options = data.creatorOptions` ; `nameById = data.creatorById` ; `allowCustom = false` ; `searchPlaceholder = 'Rechercher un modèle…'`.
- `onCommit({ ids })` → état local optimiste `columnOverrides: Record<colKey, string[]>` (le header lit `columnOverrides[c.key] ?? c.creatorIds`) + `startTransition(saveReposColumnMembers({ col: c.key, effectiveFrom: data.weekStart, creatorIds: ids }))`.
- Le libellé/chips du header se recalculent depuis `columnOverrides` (noms via `data.creatorById`, en fusionnant avec `creatorOptions` pour les nouveaux ids sélectionnés).

- [ ] **Step 3 : Vérifier (typecheck + lint)**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected : PASS.

- [ ] **Step 4 : Vérifier en réel (les 2 rôles)**

Via `/verify` : (a) **admin** — crayon visible au survol des en-têtes g1…g6, pas sur managers/policiers ; éditer une compo, chips violets mis à jour, recharger → persiste ; changer de semaine passée → l'ancienne compo est figée. (b) **compte `user` avec page `repos`** — header en chips mais **aucun crayon** ; tenter l'action serveur (devtools) doit être refusée (RLS + garde `role`).

- [ ] **Step 5 : Commit**

```bash
git add apps/web/src/features/repos/components/planning-grid.tsx
git commit -m "feat(repos): header en chips violets + crayon compo admin (front+back)"
```

---

## Self-Review (rempli à l'écriture)

**Spec coverage :**
- §3.1 table compo datée → Task 1. §3.2 cellules `chatter_ids` + résolution inactifs → Task 1/3. §3.3 backfill 100 % + table override → Task 1. §3.4 RLS (read `has_page`, write `is_admin`) → Task 1. §4 serveur → Task 3/4. §5.1 isAdmin → Task 5. §5.2 header chips violets + crayon → Task 8. §5.3 CellEditor IDs + rouge par ID → Task 6/7. §6 hors périmètre respecté (aucune écriture team_id). ✅
- Encadrement (managers/policiers) libellés fixes + cellules texte → Task 7/8. ✅

**Placeholder scan :** aucun TBD/TODO ; chaque step montre le code ou la commande. ✅

**Type consistency :** `ReposCell {chatterIds, names}`, `ReposColumn {key,label,encadrement,creatorIds}`, `saveReposColumnMembers({col,effectiveFrom,creatorIds})`, `EntityMultiSelect` props `onCommit({ids,names})` — cohérents entre Tasks 2/3/4/6/7/8. Header = **modèles** (`creator_id`, `creatorById/creatorOptions`), cellules = **chatteurs** (`chatter_id`, `chatterById/chatterOptions`). ✅

**Note test :** pas de TDD (aucun runner dans `apps/web`, cf. Global Constraints) ; vérification par `typecheck`/`lint` + exécution réelle. Écart assumé vs granularité TDD du skill, justifié par les conventions du repo.
