# Formation — Catalogue (modules, cours, cas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter le catalogue pédagogique de Good Luck Agency (7 modules, 10 sections, 85 cas, 25 créneaux de défi, 5 fans du boss, 229 messages, 24 axes) dans le CRM : schéma + seed, onglet admin « Catalogue » (CRUD), pages « Modules » en lecture pour chatters/encadrants.

**Architecture:** Face `formation` (déjà en arbre de travail, non commitée — PR 0). Tables `training_*` sous RLS (lecture = droit de face `formation`, écriture = admin), seed SQL déterministe généré par script depuis `~/Documents/good-luck-agency/formation.json`. Deux features web : `training-catalog` (admin, Server Actions `runAction`, RHF + Zod) et `training-modules` (lecture, projection **publique** des cas — jamais `fan_brief`/`expected`/champs cachés du boss côté chatter). Rendu du cours en Markdown (`react-markdown`).

**Tech Stack:** Next.js 16 (App Router, RSC, typedRoutes), Supabase (Postgres + RLS, `@supabase/ssr`), Zod v4, react-hook-form + `@hookform/resolvers`, shadcn/ui, `react-markdown` + `remark-gfm` + `remark-breaks` (nouveaux), Vitest (nouveau dans `apps/web`), `node:test` (script de seed).

**Spec:** `docs/superpowers/specs/2026-08-17-formation-catalogue-design.md`

## Global Constraints

- Migrations : `packages/db/supabase/migrations/NNNN_slug.sql`, séquence contiguë — **0113** schéma, **0114** seed. `text + check`, jamais `create type … enum`. Appliquer avec `cd packages/db && supabase db push --db-url "$DB"` (jamais `supabase link`, jamais `psql -f` sans enregistrement). Pousser sur **UAT** (`DATABASE_URL_UAT`) ; la prod reçoit avec la release. Extraire l'URL avec `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`, jamais `source .env`.
- RLS : appels wrappés `(select public.is_admin())` / `(select public.has_page('formation'))` (0057) ; `create policy` simple ; FK indexées sauf couvertes par un `unique` en tête (0055).
- Web : `docs/guidelines-standard-feature.md` — `page.tsx` = garde + kickoff sans await + `<Suspense>` ; `loading.tsx` par route ; Template = RSC sans fetch ; services : `const { data, error } = …; if (error) throw new Error(error.message)` ; actions : `runAction` + `noGuard`/`requireAdminProfile()` en tête de handler, `BusinessError` pour tout message français, `revalidatePath` ; forms : RHF + `zodResolver` + `schema.ts` partagé, **`'use no memo'`** dans tout composant qui lit `formState` (React Compiler), Zod v4 (`z.uuid()`, `z.flattenError`), `ActionButton` pour le submit, toasts `sonner`.
- Frontières ESLint : `lib → features → app`, cross-feature interdit, pas de barrel `index.ts`. Fichiers > 300 lignes → split.
- Impersonation : toute mutation refuse en mode « en tant que » : `if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')` (`@/lib/impersonation/session`, cf. `features/members/actions.ts`).
- Design : DA du CRM, sobre, **aucune couleur attitrée** à la face Formation, zéro badge/médaille de progression, pas de nouvelles classes globales (pas de plugin typography — styles Markdown par le prop `components` de react-markdown).
- Un `code` (slug) n'est **jamais saisi** : généré serveur (`slugify(title)`, dédoublonné), immuable ensuite.
- Aucun commit sans accord de Benoit — les étapes « Commit » ci-dessous = *demander* puis committer.
- Vérification avant chaque commit : `pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck` (+ `pnpm --filter @glagency/web test` dès la Task 2, `pnpm --filter @glagency/db test` dès la Task 3).

**Écarts avec la spec, tranchés ici (à confirmer par Benoit à la revue) :**
1. GLA : le module `boss` a **0 axe** (il est noté par étape — `formation_boss_score_system`, `serveur.py:550`) et pas de cours. La règle « axes min 1 » de la spec §7 est donc **abandonnée** (le seed la violerait, et l'édition du module Boss serait impossible). Un module sans axe est simplement affiché « Aucun axe de notation » dans le Catalogue.
2. `~30 axes` → **24** (comptage réel).
3. Item de nav **Modules** : `anyOf: ['frm-entrainement','frm-suivi']` **sans** `slug` (la spec disait slug + anyOf) — un `slug` en plus créerait une 2ᵉ case « Modules » dans `/formation/members` (`facePageChoices` ne déduplique pas). Les deux droits sont cochables via Overview (`frm-suivi`, case libellée « Suivi ») et Ma formation (`frm-entrainement`, case « Entraînement ») grâce à un nouveau `NavItem.choiceLabel`.
4. Actions : `saveModule` / `saveCase` (id null = création) au lieu de `create*`/`update*` séparés — précédent repo `features/scripts/actions.ts` (`saveScriptItem`).
5. Sur `saveCase` en édition, les enfants (messages / créneaux / fans) sont **remplacés en bloc** (delete + insert) — rien ne les référence encore (les sessions stockeront un instantané).

---

## Carte des fichiers

```
packages/db/supabase/migrations/0113_training_catalog.sql       (Task 1)  tables + RLS + index
packages/db/supabase/migrations/0114_training_catalog_seed.sql  (Task 4)  généré, ne pas éditer à la main
packages/db/scripts/gen-training-seed.mjs                       (Task 3)  formation.json → SQL (CLI + fonctions exportées)
packages/db/scripts/gen-training-seed.test.mjs                  (Task 3)  node:test
packages/db/src/types.ts                                        (Task 1)  régénéré

apps/web/vitest.config.ts                                       (Task 2)  Vitest web (alias @ → src)
apps/web/src/config/workspaces.ts                               (Task 2)  slugs frm-*, NavItem.anyOf/choiceLabel, nav Formation
apps/web/src/config/workspaces.test.ts                          (Task 2)
apps/web/src/lib/auth/index.ts                                  (Task 2)  requireAccess(slug | slug[])
apps/web/src/app/(dash)/formation/overview/page.tsx             (Task 2)  slug frm-suivi
apps/web/src/app/(dash)/formation/ma-formation/{page,loading}.tsx (Task 2) placeholder frm-entrainement

apps/web/src/lib/types/training.ts                              (Task 5)  CaseKind, Speaker + libellés (partagés par les 2 features)
apps/web/src/lib/slug.ts (+ .test.ts)                           (Task 5)  slugify
apps/web/src/components/markdown-view.tsx                       (Task 5)  react-markdown + gfm + breaks, styles inline

apps/web/src/features/training-catalog/
  types.ts                                                      (Task 6)  CatalogModule/CatalogCase/… (modèle admin COMPLET)
  services/get-catalog.ts                                       (Task 6)
  CatalogTemplate.tsx                                           (Task 6)
  components/catalog-skeleton.tsx                               (Task 6)
  components/modules-list.tsx                                   (Task 6, boutons branchés Task 7)
  components/module-panel.tsx                                   (Task 6, boutons branchés Task 7/9)
  components/cases-table.tsx                                    (Task 6, actions Task 9)
  schema.ts                                                     (Task 7 module, Task 8 cas)
  actions.ts                                                    (Task 7 modules, Task 8 cas)
  components/module-dialog.tsx                                  (Task 7)
  components/module-form-axes.tsx                               (Task 7)
  components/module-form-sections.tsx                           (Task 7)
  components/module-form-course.tsx                             (Task 7)
  components/case-dialog.tsx                                    (Task 9)
  components/case-form-solo.tsx                                 (Task 9)
  components/case-form-arena.tsx                                (Task 9)
  components/case-form-boss.tsx                                 (Task 9)
apps/web/src/app/(dash)/formation/catalogue/{page,loading}.tsx  (Task 6)

apps/web/src/features/training-modules/
  types.ts                                                      (Task 10) projection PUBLIQUE
  services/get-modules.ts, services/get-module.ts               (Task 10)
  ModulesTemplate.tsx, ModuleTemplate.tsx                       (Task 10)
  components/course-view.tsx, components/cases-list.tsx, components/modules-skeleton.tsx (Task 10)
apps/web/src/app/(dash)/formation/modules/{page,loading}.tsx    (Task 10)
apps/web/src/app/(dash)/formation/modules/[code]/{page,loading}.tsx (Task 10)

CLAUDE.md                                                       (Task 11) ligne « 3 faces » → face Formation remplie
```

---

### Task 1: Migration `0113_training_catalog.sql` (schéma + RLS + index) + types

**Files:**
- Create: `packages/db/supabase/migrations/0113_training_catalog.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces: tables `training_modules`, `training_module_axes`, `training_module_sections`, `training_cases`, `training_case_messages`, `training_case_arena_slots`, `training_case_boss_fans` — colonnes exactement comme la spec §3 ; policies `<table>_read` (`is_admin() or has_page('formation')`) et `<table>_admin_write` (`is_admin()`).

- [ ] **Step 1: Écrire la migration**

```sql
-- 0113 — Catalogue de formation (reprise de Good Luck Agency) : modules, axes du barème,
-- sections, cas (solo / défi simultané / boss), messages d'ouverture, créneaux de défi, fans
-- du boss. Spec : docs/superpowers/specs/2026-08-17-formation-catalogue-design.md §3.
--
-- Lecture : quiconque a le droit de face `formation` (posé par mergePages dès qu'une page
-- frm-* est cochée) ou admin ; `has_page` exige left_at is null (0102). Écriture : admin
-- uniquement (le Catalogue est adminOnly). Les lignes inactives restent lisibles : le filtre
-- `active` est applicatif (pages Modules) — le Catalogue admin voit tout.
-- Pas de trigger updated_at (convention repo : posé par les actions) ; pas de created_by
-- (donnée d'équipe, l'audit = updated_by) ; pas de jsonb (structure connue) ; pas d'enum.

create table public.training_modules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  title           text not null check (length(title) between 1 and 80),
  emoji           text check (emoji is null or length(emoji) <= 8),
  description     text,
  objective_label text not null default 'Objectif',
  course_md       text,
  scoring_notes   text,
  position        integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);

create table public.training_module_axes (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  name        text not null check (length(name) between 1 and 60),
  description text not null,
  position    integer not null default 0,
  unique (module_id, key)
);

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
--   solo  : une conversation contre un fan — fan_name / fan_brief / expected obligatoires
--   arena : 5 conversations en parallèle, chacune rejoue un cas SOLO du module sous un autre
--           prénom (training_case_arena_slots)
--   boss  : 5 tunnels complets contre 5 fans riches (training_case_boss_fans)
create table public.training_cases (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.training_modules(id) on delete cascade,
  section_id     uuid references public.training_module_sections(id) on delete set null,
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  kind           text not null default 'solo' check (kind in ('solo', 'arena', 'boss')),
  title          text not null check (length(title) between 1 and 80),
  phase          text not null default '',
  difficulty     smallint not null check (difficulty between 1 and 10),
  -- messages max du chatter : par conversation (solo/arena) ou par fan (boss).
  -- GLA : tours_max (solo), ARENA_CAP=8 (arena), 32 (boss).
  max_turns      smallint not null check (max_turns between 1 and 50),
  -- délai de réponse max en secondes (arena/boss) — GLA reaction_max_s
  reaction_max_s smallint check (reaction_max_s between 10 and 600),
  is_sale        boolean not null default false,
  context        text not null,
  objective      text not null,
  target_line    text,
  fan_name       text check (fan_name is null or length(fan_name) between 1 and 30),
  fan_brief      text,        -- consigne du fan pour l'IA (jamais affichée au chatter)
  expected       text,        -- « ce qui était attendu » — révélé APRÈS la session
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  constraint training_cases_solo_fields check (
    case when kind = 'solo'
      then fan_name is not null and fan_brief is not null and expected is not null
      else fan_name is null and fan_brief is null
    end
  ),
  constraint training_cases_reaction_kind check ((kind = 'solo') = (reaction_max_s is null))
);
-- section_id du même module : vérifié CÔTÉ ACTION (une incohérence n'aurait qu'un effet d'affichage).

-- Défi simultané : chaque créneau rejoue un cas SOLO du même module (vérifié côté action).
create table public.training_case_arena_slots (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.training_cases(id) on delete cascade,
  position     integer not null,
  -- restrict : on ne supprime pas un solo référencé (on ne supprime d'ailleurs jamais de cas)
  ref_case_id  uuid not null references public.training_cases(id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 30),
  unique (case_id, position)
);

-- Boss final : un fan riche par tunnel. Visibles du chatter : name, age, job, city, color,
-- persona. Cachés (pilotent l'IA) : budget_cap, nego_*, meet_*, derails.
create table public.training_case_boss_fans (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.training_cases(id) on delete cascade,
  position        integer not null,
  code            text not null check (code ~ '^[a-z0-9_-]{2,30}$'),
  name            text not null check (length(name) between 1 and 30),
  age             smallint check (age between 18 and 99),
  job             text,
  city            text,
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),
  persona         text not null,
  opening_message text not null,
  budget_cap      integer check (budget_cap >= 0),
  nego_threshold  integer check (nego_threshold >= 0),
  nego_where      text,
  meet_when       text,
  meet_where      text,
  derails         text,
  unique (case_id, position),
  unique (case_id, code)
);

-- Messages d'ouverture (GLA seed) — la conversation « déjà entamée » à l'arrivée du chatter.
create table public.training_case_messages (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.training_cases(id) on delete cascade,
  position  integer not null,
  speaker   text not null check (speaker in ('creator', 'fan')),
  body      text not null check (length(body) between 1 and 1000),
  unique (case_id, position)
);

-- Index (FK non couvertes par un unique en tête).
create index training_cases_module_position_idx on public.training_cases (module_id, position);
create index training_cases_section_idx on public.training_cases (section_id);
create index training_case_arena_slots_ref_idx on public.training_case_arena_slots (ref_case_id);
-- axes/sections (module_id, …), messages/slots/fans (case_id, …) : couverts par leur unique.

alter table public.training_modules enable row level security;
alter table public.training_module_axes enable row level security;
alter table public.training_module_sections enable row level security;
alter table public.training_cases enable row level security;
alter table public.training_case_messages enable row level security;
alter table public.training_case_arena_slots enable row level security;
alter table public.training_case_boss_fans enable row level security;

create policy training_modules_read on public.training_modules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_modules_admin_write on public.training_modules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_axes_read on public.training_module_axes for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_axes_admin_write on public.training_module_axes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_sections_read on public.training_module_sections for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_sections_admin_write on public.training_module_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_cases_read on public.training_cases for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_cases_admin_write on public.training_cases for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_messages_read on public.training_case_messages for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_messages_admin_write on public.training_case_messages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_arena_slots_read on public.training_case_arena_slots for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_arena_slots_admin_write on public.training_case_arena_slots for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_boss_fans_read on public.training_case_boss_fans for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_boss_fans_admin_write on public.training_case_boss_fans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
```

- [ ] **Step 2: Dry-run puis push sur l'UAT**

```bash
DB="$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')"
cd packages/db && supabase db push --db-url "$DB" --dry-run
```
Attendu : la 0113 listée comme « à appliquer » (et rien d'autre en attente). Puis sans `--dry-run`. Re-lancer `--dry-run` : « Remote database is up to date ».

- [ ] **Step 3: Vérifier RLS + contraintes en base**

```bash
psql "$DB" -c "select relname, relrowsecurity from pg_class where relname like 'training_%' and relkind='r' order by 1;"
psql "$DB" -c "select count(*) from pg_policies where tablename like 'training_%';"
```
Attendu : 7 tables `relrowsecurity = t`, `14` policies.

- [ ] **Step 4: Régénérer les types**

```bash
supabase gen types typescript --db-url "$DB" > packages/db/src/types.ts
grep -c "training_" packages/db/src/types.ts   # > 0
pnpm --filter @glagency/db typecheck && pnpm --filter @glagency/web typecheck
```

- [ ] **Step 5: Commit** (demander) — `feat(db): 0113 catalogue de formation — tables, RLS, index + types`

---

### Task 2: Slugs `frm-entrainement` / `frm-suivi`, `NavItem.anyOf` + `choiceLabel`, `requireAccess([...])`, placeholders, Vitest web

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (interface `NavItem`, face `formation`, `PAGE_SLUGS`, `facePageChoices`, `canAccessNav`)
- Modify: `apps/web/src/lib/auth/index.ts:107-116` (`requireAccess`)
- Modify: `apps/web/src/app/(dash)/formation/overview/page.tsx` (slug)
- Create: `apps/web/src/app/(dash)/formation/ma-formation/page.tsx`, `apps/web/src/app/(dash)/formation/ma-formation/loading.tsx`
- Create: `apps/web/vitest.config.ts`, `apps/web/src/config/workspaces.test.ts`
- Modify: `apps/web/package.json` (devDep `vitest`, script `test`)

**Interfaces:**
- Produces: `PageSlug` inclut `'formation' | 'frm-entrainement' | 'frm-suivi'` (plus de `frm-overview`) ; `NavItem.anyOf?: PageSlug[]` ; `NavItem.choiceLabel?: string` ; `requireAccess(slug: PageSlug | PageSlug[])`.

- [ ] **Step 1: Installer Vitest dans `apps/web` et écrire le test qui échoue**

```bash
pnpm --filter @glagency/web add -D vitest
```
`apps/web/package.json` scripts : ajouter `"test": "vitest run"`.

`apps/web/vitest.config.ts` :
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests unitaires des modules PURS de apps/web (config, lib/slug…). Rien qui touche
// next/headers ou Supabase — ces modules-là se testent en intégration (UAT).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

`apps/web/src/config/workspaces.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import {
  canAccessNav,
  landingHref,
  pageChoicesFor,
  PAGE_SLUGS,
  slugFace,
  WORKSPACES,
  type NavAccess,
} from './workspaces'

const user = (pages: string[]): NavAccess => ({
  isAdmin: false,
  isSuperadmin: false,
  isManager: false,
  pages: new Set(pages),
})
const formation = WORKSPACES.find((w) => w.id === 'formation')!
const item = (href: string) => formation.nav.find((n) => n.href === href)!

describe('face Formation — droits', () => {
  it('expose les slugs frm-entrainement / frm-suivi (et plus frm-overview)', () => {
    expect(PAGE_SLUGS).toContain('frm-entrainement')
    expect(PAGE_SLUGS).toContain('frm-suivi')
    expect(PAGE_SLUGS).not.toContain('frm-overview')
    expect(slugFace('frm-entrainement')).toBe('formation')
    expect(slugFace('frm-suivi')).toBe('formation')
  })

  it('Modules est visible avec l’un OU l’autre des deux droits (anyOf)', () => {
    const modules = item('/formation/modules')
    expect(canAccessNav(modules, user(['frm-entrainement']))).toBe(true)
    expect(canAccessNav(modules, user(['frm-suivi']))).toBe(true)
    expect(canAccessNav(modules, user(['mkt-overview']))).toBe(false)
    expect(canAccessNav(modules, user([]))).toBe(false)
  })

  it('Overview = frm-suivi seul, Ma formation = frm-entrainement seul', () => {
    expect(canAccessNav(item('/formation/overview'), user(['frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/overview'), user(['frm-suivi']))).toBe(true)
    expect(canAccessNav(item('/formation/ma-formation'), user(['frm-entrainement']))).toBe(true)
    expect(canAccessNav(item('/formation/ma-formation'), user(['frm-suivi']))).toBe(false)
  })

  it('Catalogue est adminOnly', () => {
    expect(canAccessNav(item('/formation/catalogue'), user(['frm-suivi', 'frm-entrainement']))).toBe(false)
    expect(canAccessNav(item('/formation/catalogue'), { ...user([]), isAdmin: true })).toBe(true)
  })

  it('les cases cochables de la face = 2 droits, libellés Suivi / Entraînement, sans doublon', () => {
    const choices = pageChoicesFor('formation')
    expect(choices.map((c) => c.slug)).toEqual(['frm-suivi', 'frm-entrainement'])
    expect(choices.map((c) => c.label)).toEqual(['Suivi', 'Entraînement'])
  })

  it('un chatter avec le seul droit Entraînement atterrit sur Ma formation', () => {
    expect(
      landingHref({ role: 'chatteur', superadmin: false, manager: false, pages: ['frm-entrainement', 'formation'] }),
    ).toBe('/formation/ma-formation')
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `pnpm --filter @glagency/web test`
Expected: FAIL (`frm-entrainement` absent de `PAGE_SLUGS`, `/formation/modules` introuvable → `item()` undefined).

- [ ] **Step 3: Modifier `workspaces.ts`**

Ajouter les imports d'icônes `BookOpen`, `Library`, `PlayCircle` à la liste lucide (`GraduationCap` y est déjà).

`NavItem` — ajouter après `slug` :
```ts
  /**
   * Item visible dès qu'UN de ces slugs est possédé (ex. Modules : Entraînement OU Suivi).
   * Prend le pas sur `slug`/href dans `canAccessNav`. Sans `slug` → l'item n'est PAS une case
   * cochable dans Membres (les droits se cochent via les items qui les portent).
   */
  anyOf?: PageSlug[]
  /** Libellé de la CASE à cocher dans Membres quand il diffère du libellé de nav (ex. « Suivi »). */
  choiceLabel?: string
```
(`PageSlug` est déclaré plus bas dans le même fichier — un type peut être référencé avant sa déclaration.)

Face `formation` — remplacer le bloc `nav` :
```ts
    // Même patron que Marketing : droit de face UNIQUE `formation` (posé par mergePages dès
    // qu'une page frm-* est cochée depuis /formation/members), slugs préfixés `frm-`.
    // Deux droits : `frm-suivi` (encadrement — Overview) et `frm-entrainement` (chatter — Ma
    // formation). Modules est ouvert aux deux (anyOf). Catalogue = admin (comme Membres).
    // Overview et Ma formation sont des placeholders jusqu'aux incréments suivants.
    nav: [
      { href: '/formation/overview', label: 'Overview', icon: LayoutDashboard, slug: 'frm-suivi', choiceLabel: 'Suivi' },
      { href: '/formation/ma-formation', label: 'Ma formation', icon: PlayCircle, slug: 'frm-entrainement', choiceLabel: 'Entraînement' },
      { href: '/formation/modules', label: 'Modules', icon: Library, anyOf: ['frm-entrainement', 'frm-suivi'] },
      { href: '/formation/catalogue', label: 'Catalogue', icon: BookOpen, adminOnly: true, bottom: true },
      { href: '/formation/members', label: 'Membres', icon: UserCog, adminOnly: true, bottom: true },
    ],
```

`PAGE_SLUGS` : remplacer `'formation', 'frm-overview'` par `'formation', 'frm-entrainement', 'frm-suivi'`.

`facePageChoices` : `label: n.choiceLabel ?? n.label`.

`canAccessNav` :
```ts
export function canAccessNav(item: NavItem, a: NavAccess): boolean {
  if (item.superadminOnly && !a.isSuperadmin) return false
  if (a.isAdmin) return true
  if (item.adminOnly) return !!item.managerAccess && a.isManager
  if (item.anyOf) return item.anyOf.some((s) => a.pages.has(s))
  return a.pages.has(navSlug(item))
}
```

- [ ] **Step 4: `requireAccess` accepte un tableau** (`apps/web/src/lib/auth/index.ts`)

```ts
/**
 * Garde de page : admin passe toujours ; `user` doit avoir le slug dans profiles.pages —
 * ou L'UN des slugs si on passe un tableau (ex. Modules : Entraînement OU Suivi, miroir de
 * `NavItem.anyOf`). Sans aucune page → /no-access (PAS /login : rebond infini sinon).
 */
export async function requireAccess(slug: PageSlug | PageSlug[]): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  const slugs = Array.isArray(slug) ? slug : [slug]
  if (profile.role !== 'admin' && !slugs.some((s) => profile.pages.includes(s))) {
    redirect(landingHref(profile))
  }
  return profile
}
```

- [ ] **Step 5: Routes placeholders**

`apps/web/src/app/(dash)/formation/overview/page.tsx` : `await requireAccess('frm-overview')` → `await requireAccess('frm-suivi')` ; commentaire : « page COCHABLE (`frm-suivi`, droit Suivi — encadrement) ». Texte du bloc : « Overview encadrement — arrive avec les sessions d'entraînement. »

`apps/web/src/app/(dash)/formation/ma-formation/page.tsx` :
```tsx
import { requireAccess } from '@/lib/auth'

// Placeholder « Ma formation » (droit `frm-entrainement`, home du chatter) : garantit la page
// COCHABLE dans /formation/members et l'atterrissage d'un chatter formation, tant que les
// sessions d'entraînement (moteur IA) ne sont pas construites. Les cours et cas se lisent
// déjà dans Modules.
export default async function MaFormationPage() {
  await requireAccess('frm-entrainement')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ma formation</h1>
        <p className="text-sm text-muted-foreground">Entraînement</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Ton entraînement arrive ici — en attendant, les cours et les cas sont dans Modules.
      </div>
    </div>
  )
}
```
`ma-formation/loading.tsx` : copie de `overview/loading.tsx` (`PageSkeleton`).

- [ ] **Step 6: Tests + typecheck + lint**

Run: `pnpm --filter @glagency/web test && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected: 6 tests PASS ; 0 erreur TS (le `grep -rn "frm-overview" apps/web/src` doit être vide).

- [ ] **Step 7: Vérif manuelle rapide** — `pnpm dev`, `/formation/members` : les cases « Suivi » et « Entraînement » apparaissent ; cocher « Entraînement » sur un membre test, « en tant que » lui → sidebar = Ma formation + Modules (Modules 404 pour l'instant : normal, Task 10).

- [ ] **Step 8: Commit** (demander) — inclure aussi PR 0 si elle n'est pas encore commitée (les fichiers modifiés de la face). Message : `feat(formation): droits Suivi / Entraînement, nav Modules (anyOf), Catalogue, placeholders + Vitest web`

---

### Task 3: Générateur de seed `gen-training-seed.mjs` (+ tests `node:test`)

**Files:**
- Create: `packages/db/scripts/gen-training-seed.mjs`
- Create: `packages/db/scripts/gen-training-seed.test.mjs`
- Modify: `packages/db/package.json` (script `"test": "node --test"`)

**Interfaces:**
- Produces (exports ESM) : `uuidV5(name: string): string`, `sqlLit(v): string`, `htmlToMarkdown(html: string | null): string | null`, `validate(json): void` (throw), `buildSeed(json): { modules, axes, sections, cases, messages, slots, fans, counts }`, `renderSql(seed): string`. CLI : `node gen-training-seed.mjs <formation.json>` → SQL sur stdout, comptages sur stderr.
- Consumes : `~/Documents/good-luck-agency/formation.json` (`{ modules: [...], cas: [...] }`, clés GLA de la spec §4).

- [ ] **Step 1: Écrire les tests (échouent : module absent)**

`packages/db/scripts/gen-training-seed.test.mjs` :
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildSeed, htmlToMarkdown, renderSql, sqlLit, uuidV5, validate } from './gen-training-seed.mjs'

test('uuidV5 : déterministe, format v5', () => {
  const a = uuidV5('module:setting')
  assert.equal(a, uuidV5('module:setting'))
  assert.notEqual(a, uuidV5('module:relance'))
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('sqlLit : null / booléens / nombres / quotes doublées', () => {
  assert.equal(sqlLit(null), 'null')
  assert.equal(sqlLit(undefined), 'null')
  assert.equal(sqlLit(true), 'true')
  assert.equal(sqlLit(12), '12')
  assert.equal(sqlLit("c'est"), "'c''est'")
})

test('htmlToMarkdown : titres, gras/italique, br, listes, table, entités', () => {
  assert.equal(htmlToMarkdown('<h4>Le principe</h4><p>Un <b>mot</b> et <i>autre</i>.</p>'), '## Le principe\n\nUn **mot** et *autre*.')
  assert.equal(htmlToMarkdown('<p>Fan : cc<br>Toi : hey</p>'), 'Fan : cc\nToi : hey')
  assert.equal(htmlToMarkdown('<ul><li>a</li><li><b>b</b> — c</li></ul>'), '- a\n- **b** — c')
  assert.equal(htmlToMarkdown('<ol><li>un</li><li>deux</li></ol>'), '1. un\n2. deux')
  assert.equal(
    htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x | y</td></tr></table>'),
    '| A | B |\n| --- | --- |\n| 1 | x \\| y |',
  )
  assert.equal(htmlToMarkdown('<p>R &amp; D</p>'), 'R & D')
  assert.equal(htmlToMarkdown(''), null)
  assert.equal(htmlToMarkdown(null), null)
})

test('htmlToMarkdown : espaces aux bords d’un <b> sortent des ** (sinon Markdown ne ferme pas)', () => {
  assert.equal(htmlToMarkdown('<p>a<b> b </b>c</p>'), 'a **b** c')
  assert.equal(htmlToMarkdown('<p><u>QUE</u> ça</p>'), '*QUE* ça')
})

test('htmlToMarkdown : texte brut échappé, début de ligne neutralisé, balise inconnue refusée', () => {
  assert.equal(htmlToMarkdown('<p>2*3 et a_b</p>'), '2\\*3 et a\\_b')
  assert.equal(htmlToMarkdown('<p>Fan<br>- pas une liste</p>'), 'Fan\n\\- pas une liste')
  assert.throws(() => htmlToMarkdown('<p><span>x</span></p>'), /balise non gérée/)
  assert.throws(() => htmlToMarkdown('<ul><li>a<ul><li>b</li></ul></li></ul>'), /imbriqu/)
})

// Fixture minimale mais complète : 1 module (2 axes, 1 section, 5 solos, 1 défi), 1 module boss (1 fan).
const solo = (id, module, extra = {}) => ({
  id, module, titre: `Cas ${id}`, phase: 'Qualification', difficulte: 2, tours_max: 6, vente: false,
  contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc', fan_name: 'Tony', consigne_fan: 'brief', attendu: 'att',
  seed: [{ who: 'me', t: 'coucou' }, { who: 'them', t: 'cc' }], ...extra,
})
const fixture = () => ({
  modules: [
    { id: 'setting', titre: 'Setting', emoji: '🧲', actif: true, cible_label: 'Objectif', description: 'd', consigne_notation: 'cn',
      sous_categories: [{ id: 'kyc', titre: 'KYC', emoji: '📇', desc: 'sd' }],
      bareme: { axes: [{ cle: 'naturel', nom: 'Naturel', desc: 'a1' }, { cle: 'lecture', nom: 'Lecture', desc: 'a2' }] },
      cours: '<h4>T</h4><p>x</p>' },
    { id: 'boss', titre: 'Boss final', emoji: '🏆', actif: true, cible_label: 'Objectif', description: 'b', consigne_notation: '',
      sous_categories: [], bareme: { axes: [] }, cours: '' },
  ],
  cas: [
    solo('s1', 'setting', { sous_cat: 'kyc' }), solo('s2', 'setting'), solo('s3', 'setting'), solo('s4', 'setting'), solo('s5', 'setting'),
    { id: 'set_arena', module: 'setting', titre: 'Défi', phase: 'Défi simultané', difficulte: 5, tours_max: 0, vente: false,
      arena: ['s1', 's2', 's3', 's4', 's5'], fans: ['A', 'B', 'C', 'D', 'E'], reaction_max_s: 120,
      contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc' },
    { id: 'boss_final', module: 'boss', titre: 'Boss', phase: 'Boss final', difficulte: 5, tours_max: 0, vente: false, boss_mode: true,
      reaction_max_s: 120, contexte: 'ctx', objectif: 'obj', ligne_cible: 'lc', arena: ['s1'],
      fans: [{ id: 'kevin', name: 'Kevin', age: 34, job: 'plombier', city: 'Lyon', color: '#ff6b9d', persona: 'p', cap: 60, nego: 6,
        negoWhere: 'nw', rencontre: 'r', rencontreWhere: 'rw', derails: 'd', seed: [{ who: 'them', t: 'salut' }] }] },
  ],
})

test('buildSeed : comptages, sortes, valeurs converties', () => {
  const s = buildSeed(fixture())
  assert.deepEqual(s.counts, { modules: 2, axes: 2, sections: 1, cases: 7, solo: 5, arena: 1, boss: 1, messages: 10, slots: 5, fans: 1 })
  const m = s.modules[0]
  assert.equal(m.code, 'setting'); assert.equal(m.course_md, '## T\n\nx'); assert.equal(m.position, 0); assert.equal(m.objective_label, 'Objectif')
  assert.equal(s.modules[1].course_md, null); assert.equal(s.modules[1].scoring_notes, null)
  const s1 = s.cases.find((c) => c.code === 's1')
  assert.equal(s1.kind, 'solo'); assert.equal(s1.max_turns, 6); assert.equal(s1.reaction_max_s, null); assert.equal(s1.section_id, s.sections[0].id)
  assert.equal(s.cases.find((c) => c.code === 's2').section_id, null)
  const arena = s.cases.find((c) => c.code === 'set_arena')
  assert.equal(arena.kind, 'arena'); assert.equal(arena.max_turns, 8); assert.equal(arena.reaction_max_s, 120); assert.equal(arena.fan_name, null)
  assert.deepEqual(s.slots.map((x) => x.display_name), ['A', 'B', 'C', 'D', 'E'])
  assert.equal(s.slots[0].ref_case_id, s1.id)
  const boss = s.cases.find((c) => c.code === 'boss_final')
  assert.equal(boss.kind, 'boss'); assert.equal(boss.max_turns, 32)
  assert.equal(s.fans[0].opening_message, 'salut'); assert.equal(s.fans[0].budget_cap, 60); assert.equal(s.fans[0].nego_threshold, 6); assert.equal(s.fans[0].meet_when, 'r')
  assert.deepEqual(s.messages.filter((x) => x.case_id === s1.id).map((x) => x.speaker), ['creator', 'fan'])
  // Ordre dans le module : position 0, 10, 20… selon l'ordre du JSON.
  assert.deepEqual(s.cases.filter((c) => c.module_id === m.id).map((c) => c.position), [0, 10, 20, 30, 40, 50])
})

test('validate : refuse un défi qui référence un cas d’un autre module ou non solo, un solo sans fan', () => {
  const bad = fixture(); bad.cas[5].arena[0] = 'boss_final'
  assert.throws(() => validate(bad), /set_arena/)
  const bad2 = fixture(); delete bad2.cas[0].fan_name
  assert.throws(() => validate(bad2), /s1.*fan_name/)
  const bad3 = fixture(); bad3.cas[0].sous_cat = 'nope'
  assert.throws(() => validate(bad3), /sous_cat/)
})

test('renderSql : un insert par table, dans l’ordre des FK, quotes échappées', () => {
  const sql = renderSql(buildSeed(fixture()))
  const order = ['training_modules', 'training_module_axes', 'training_module_sections', 'training_cases', 'training_case_messages', 'training_case_arena_slots', 'training_case_boss_fans']
    .map((t) => sql.indexOf(`insert into public.${t} (`))
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `ordre : ${order}`)
  assert.match(sql, /^-- 0114/)
  assert.doesNotMatch(sql, /on conflict/)
})

const REAL = join(homedir(), 'Documents/good-luck-agency/formation.json')
test('formation.json réel : comptages attendus, aucun HTML résiduel', { skip: !existsSync(REAL) && 'formation.json absent' }, () => {
  const s = buildSeed(JSON.parse(readFileSync(REAL, 'utf8')))
  assert.deepEqual(s.counts, { modules: 7, axes: 24, sections: 10, cases: 85, solo: 79, arena: 5, boss: 1, messages: 229, slots: 25, fans: 5 })
  for (const m of s.modules) if (m.course_md) assert.doesNotMatch(m.course_md, /<\/?[a-z]/, `HTML résiduel dans ${m.code}`)
  const ids = new Set(s.cases.map((c) => c.id))
  assert.ok(s.slots.every((x) => ids.has(x.ref_case_id)))
})
```

- [ ] **Step 2: Lancer — doit échouer**

`packages/db/package.json` : ajouter `"test": "node --test"` aux scripts.
Run: `pnpm --filter @glagency/db test`
Expected: FAIL (`Cannot find module './gen-training-seed.mjs'`).

- [ ] **Step 3: Écrire le générateur**

`packages/db/scripts/gen-training-seed.mjs` :
```js
// Génère la migration de SEED du catalogue de formation depuis le formation.json de Good Luck
// Agency (repo axel-vrnl/good-luck-agency). Le SQL émis est L'ARTEFACT (migration 0114) ; ce
// script est commité, ré-exécutable, JAMAIS appelé en prod.
//   node packages/db/scripts/gen-training-seed.mjs ~/Documents/good-luck-agency/formation.json \
//     > packages/db/supabase/migrations/0114_training_catalog_seed.sql
// Règles de conversion : spec 2026-08-17-formation-catalogue-design.md §4. Tests : node --test.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/** Namespace UUID v5 du seed — arbitraire et FIXE (le changer changerait tous les ids). */
const NAMESPACE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
/** GLA : ARENA_CAP (front) et plafond du boss — constantes reprises telles quelles. */
const ARENA_MAX_TURNS = 8
const BOSS_MAX_TURNS = 32
const CODE_RE = /^[a-z0-9_-]{2,40}$/
const KEY_RE = /^[a-z0-9_]{2,30}$/

/** UUID v5 (SHA-1) déterministe : même `name` ⇒ même id à chaque génération, sans extension Postgres. */
export function uuidV5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // variante RFC 4122
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** Littéral SQL : null / booléen / nombre / texte (quotes doublées ; pas de E'' — standard_conforming_strings). */
export function sqlLit(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`nombre invalide : ${v}`)
    return String(v)
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

// ---------- HTML des cours GLA → Markdown GFM ----------
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
/** Texte brut : ce que Markdown interpréterait est échappé. */
const escapeText = (s) => s.replace(/[\\*_`]/g, (c) => `\\${c}`)
/** Une ligne de paragraphe qui commencerait comme une liste / un titre / une citation est neutralisée. */
const escapeLineStart = (line) =>
  line.replace(/^([-+*#>])(\s)/, '\\$1$2').replace(/^(\d+)([.)])(\s)/, '$1\\$2$3')
const INLINE = { b: '**', strong: '**', i: '*', em: '*', u: '*' }

/**
 * Convertit le HTML PLAT des cours GLA (h4 / p / b / i / u / br / ul / ol / li / table / tr /
 * th / td — sans attribut, sans imbrication de listes) en Markdown GFM. `<br>` → saut de ligne
 * simple (rendu par remark-breaks côté web). Balise inconnue ou structure imprévue ⇒ throw.
 */
export function htmlToMarkdown(html) {
  if (!html) return null
  const blocks = []
  let buf = ''         // texte inline du bloc courant (paragraphe, titre, item)
  let cell = null      // texte de la cellule courante (th/td) — prioritaire sur `buf`
  const inline = []    // pile { mark, start } des balises inline ouvertes
  let list = null      // { type: 'ul' | 'ol', items: [] }
  let table = null     // { rows: [{ header, cells }], row: null }
  let heading = false

  const cur = () => (cell !== null ? cell : buf)
  const set = (v) => { if (cell !== null) cell = v; else buf = v }
  const append = (t) => set(cur() + t)
  const openInline = (mark) => inline.push({ mark, start: cur().length })
  const closeInline = (mark) => {
    const open = inline.pop()
    if (!open || open.mark !== mark) throw new Error(`balise inline mal imbriquée (${mark})`)
    const text = cur()
    const inner = text.slice(open.start)
    const core = inner.trim()
    const lead = inner.slice(0, inner.length - inner.trimStart().length)
    const trail = inner.slice(inner.trimEnd().length)
    set(text.slice(0, open.start) + (core ? `${lead}${mark}${core}${mark}${trail}` : inner))
  }
  const takeBuf = (escapeStarts) => {
    const lines = buf.split('\n').map((l) => l.trim())
    buf = ''
    return (escapeStarts ? lines.map(escapeLineStart) : lines).join('\n').trim()
  }
  const flushPara = () => {
    if (inline.length) throw new Error('balise inline non fermée en fin de bloc')
    const text = takeBuf(true)
    if (text) blocks.push(text)
  }

  const tokens = html.match(/<\/?[a-z0-9]+[^>]*>|[^<]+/gi) ?? []
  for (const tok of tokens) {
    if (tok[0] !== '<') { append(escapeText(decode(tok))); continue }
    const m = /^<(\/?)([a-z0-9]+)/i.exec(tok)
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (tag in INLINE) { closing ? closeInline(INLINE[tag]) : openInline(INLINE[tag]); continue }
    switch (tag) {
      case 'h4':
        if (!closing) { flushPara(); heading = true }
        else { const t = takeBuf(false); if (t) blocks.push(`## ${t}`); heading = false }
        break
      case 'p':
        if (list || table) throw new Error(`<p> à l'intérieur d'une ${list ? 'liste' : 'table'} non géré`)
        flushPara()
        break
      case 'br':
        // Dans une cellule ou un titre, un <br> devient un espace (une table GFM / un titre tiennent sur une ligne).
        append(cell !== null || heading ? ' ' : '\n')
        break
      case 'ul': case 'ol':
        if (!closing) { if (list) throw new Error('listes imbriquées non gérées'); flushPara(); list = { type: tag, items: [] } }
        else {
          if (!list) throw new Error(`</${tag}> sans ouverture`)
          if (buf.trim()) throw new Error('texte hors <li> dans une liste')
          blocks.push(list.items.map((it, i) => (list.type === 'ol' ? `${i + 1}. ${it}` : `- ${it}`)).join('\n'))
          list = null
        }
        break
      case 'li':
        if (!list) throw new Error('<li> hors liste')
        if (!closing) buf = ''
        else list.items.push(takeBuf(true).replace(/\n/g, '\n  '))
        break
      case 'table':
        if (!closing) { flushPara(); table = { rows: [], row: null } }
        else {
          const [head, ...body] = table.rows
          if (!head?.header) throw new Error('table sans ligne d’en-tête (th)')
          const w = head.cells.length
          const line = (cells) => `| ${[...cells, ...Array(Math.max(0, w - cells.length)).fill('')].slice(0, w).join(' | ')} |`
          blocks.push([line(head.cells), `| ${Array(w).fill('---').join(' | ')} |`, ...body.map((r) => line(r.cells))].join('\n'))
          table = null
        }
        break
      case 'tr':
        if (!table) throw new Error('<tr> hors table')
        if (!closing) table.row = { header: false, cells: [] }
        else { table.rows.push(table.row); table.row = null }
        break
      case 'th': case 'td':
        if (!table?.row) throw new Error(`<${tag}> hors ligne de table`)
        if (!closing) { cell = ''; if (tag === 'th') table.row.header = true }
        else { table.row.cells.push(cell.trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')); cell = null }
        break
      default:
        throw new Error(`balise non gérée : <${tag}>`)
    }
  }
  flushPara()
  if (heading || list || table || inline.length) throw new Error('structure HTML non refermée')
  return blocks.join('\n\n')
}

// ---------- Validation du JSON GLA (avant d'émettre quoi que ce soit) ----------
export function validate(json) {
  const errors = []
  const err = (m) => errors.push(m)
  const modules = Array.isArray(json?.modules) ? json.modules : []
  const cas = Array.isArray(json?.cas) ? json.cas : []
  if (!modules.length) err('aucun module')
  const modCodes = new Set()
  const sectionsByModule = new Map()
  for (const m of modules) {
    if (!CODE_RE.test(m.id ?? '')) err(`module ${m.id} : id invalide`)
    if (modCodes.has(m.id)) err(`module ${m.id} : id en double`)
    modCodes.add(m.id)
    if (!m.titre || m.titre.length > 80) err(`module ${m.id} : titre manquant ou > 80`)
    if (m.emoji && [...m.emoji].length > 8) err(`module ${m.id} : emoji > 8`)
    const keys = new Set()
    for (const a of m.bareme?.axes ?? []) {
      if (!KEY_RE.test(a.cle ?? '')) err(`module ${m.id} : axe ${a.cle} clé invalide`)
      if (keys.has(a.cle)) err(`module ${m.id} : axe ${a.cle} en double`)
      keys.add(a.cle)
      if (!a.nom || a.nom.length > 60) err(`module ${m.id} : axe ${a.cle} nom manquant ou > 60`)
      if (!a.desc) err(`module ${m.id} : axe ${a.cle} sans desc`)
    }
    const secs = new Set()
    for (const s of m.sous_categories ?? []) {
      if (!CODE_RE.test(s.id ?? '')) err(`module ${m.id} : sous_cat ${s.id} id invalide`)
      if (secs.has(s.id)) err(`module ${m.id} : sous_cat ${s.id} en double`)
      secs.add(s.id)
      if (!s.titre || s.titre.length > 80) err(`module ${m.id} : sous_cat ${s.id} titre manquant ou > 80`)
    }
    sectionsByModule.set(m.id, secs)
    try { const md = htmlToMarkdown(m.cours); if (md && /<\/?[a-z]/.test(md)) err(`module ${m.id} : HTML résiduel dans le cours`) }
    catch (e) { err(`module ${m.id} : cours — ${e.message}`) }
  }
  const byId = new Map()
  for (const c of cas) {
    if (!CODE_RE.test(c.id ?? '')) err(`cas ${c.id} : id invalide`)
    if (byId.has(c.id)) err(`cas ${c.id} : id en double`)
    byId.set(c.id, c)
  }
  for (const c of cas) {
    const kind = c.boss_mode ? 'boss' : c.arena ? 'arena' : 'solo'
    if (!modCodes.has(c.module)) err(`cas ${c.id} : module ${c.module} inconnu`)
    if (c.sous_cat && !sectionsByModule.get(c.module)?.has(c.sous_cat)) err(`cas ${c.id} : sous_cat ${c.sous_cat} inconnue du module ${c.module}`)
    if (!c.titre || c.titre.length > 80) err(`cas ${c.id} : titre manquant ou > 80`)
    if (!Number.isInteger(c.difficulte) || c.difficulte < 1 || c.difficulte > 10) err(`cas ${c.id} : difficulte hors 1-10`)
    if (!c.contexte || !c.objectif) err(`cas ${c.id} : contexte/objectif manquant`)
    for (const [i, s] of (c.seed ?? []).entries()) {
      if (s.who !== 'me' && s.who !== 'them') err(`cas ${c.id} : seed[${i}] who=${s.who}`)
      if (!s.t || s.t.length > 1000) err(`cas ${c.id} : seed[${i}] texte vide ou > 1000`)
    }
    if (kind === 'solo') {
      for (const k of ['fan_name', 'consigne_fan', 'attendu']) if (!c[k]) err(`cas ${c.id} : ${k} manquant (solo)`)
      if (c.fan_name && c.fan_name.length > 30) err(`cas ${c.id} : fan_name > 30`)
      if (!Number.isInteger(c.tours_max) || c.tours_max < 1 || c.tours_max > 50) err(`cas ${c.id} : tours_max hors 1-50`)
    } else {
      if (!Number.isInteger(c.reaction_max_s) || c.reaction_max_s < 10 || c.reaction_max_s > 600) err(`cas ${c.id} : reaction_max_s hors 10-600`)
    }
    if (kind === 'arena') {
      if (!Array.isArray(c.arena) || c.arena.length !== 5 || !Array.isArray(c.fans) || c.fans.length !== 5) err(`cas ${c.id} : défi sans 5 codes + 5 prénoms`)
      for (const code of c.arena ?? []) {
        const ref = byId.get(code)
        if (!ref) err(`cas ${c.id} : référence ${code} inconnue`)
        else if (ref.module !== c.module || ref.arena || ref.boss_mode) err(`cas ${c.id} : ${code} n'est pas un solo du module ${c.module}`)
      }
      for (const n of c.fans ?? []) if (typeof n !== 'string' || !n || n.length > 30) err(`cas ${c.id} : prénom de défi invalide`)
    }
    if (kind === 'boss') {
      if (!Array.isArray(c.fans) || c.fans.length < 1 || c.fans.length > 5) err(`cas ${c.id} : boss sans 1-5 fans`)
      for (const f of c.fans ?? []) {
        if (typeof f !== 'object' || !/^[a-z0-9_-]{2,30}$/.test(f.id ?? '')) err(`cas ${c.id} : fan ${f?.id} id invalide`)
        if (!f.name || f.name.length > 30 || !f.persona) err(`cas ${c.id} : fan ${f.id} name/persona`)
        if (!Array.isArray(f.seed) || f.seed.length !== 1 || !f.seed[0]?.t) err(`cas ${c.id} : fan ${f.id} doit avoir exactement 1 message d'ouverture`)
        if (f.color && !/^#[0-9a-fA-F]{6}$/.test(f.color)) err(`cas ${c.id} : fan ${f.id} couleur`)
      }
    }
  }
  if (errors.length) throw new Error(`formation.json invalide :\n- ${errors.join('\n- ')}`)
}

// ---------- Construction des lignes ----------
export function buildSeed(json) {
  validate(json)
  const moduleId = (code) => uuidV5(`module:${code}`)
  const caseId = (code) => uuidV5(`case:${code}`)
  const sectionId = (m, code) => uuidV5(`section:${m}:${code}`)
  const modules = [], axes = [], sections = [], cases = [], messages = [], slots = [], fans = []

  json.modules.forEach((m, mi) => {
    modules.push({
      id: moduleId(m.id), code: m.id, title: m.titre, emoji: m.emoji || null, description: m.description || null,
      objective_label: m.cible_label || 'Objectif', course_md: htmlToMarkdown(m.cours), scoring_notes: m.consigne_notation || null,
      position: mi * 10, active: m.actif !== false,
    })
    ;(m.bareme?.axes ?? []).forEach((a, i) => axes.push({
      id: uuidV5(`axis:${m.id}:${a.cle}`), module_id: moduleId(m.id), key: a.cle, name: a.nom, description: a.desc, position: i * 10,
    }))
    ;(m.sous_categories ?? []).forEach((s, i) => sections.push({
      id: sectionId(m.id, s.id), module_id: moduleId(m.id), code: s.id, title: s.titre, emoji: s.emoji || null, description: s.desc || null, position: i * 10,
    }))
  })

  const nextPos = new Map()
  for (const c of json.cas) {
    const kind = c.boss_mode ? 'boss' : c.arena ? 'arena' : 'solo'
    const solo = kind === 'solo'
    const position = nextPos.get(c.module) ?? 0
    nextPos.set(c.module, position + 10)
    const row = {
      id: caseId(c.id), module_id: moduleId(c.module), section_id: c.sous_cat ? sectionId(c.module, c.sous_cat) : null,
      code: c.id, kind, title: c.titre, phase: c.phase ?? '', difficulty: c.difficulte,
      max_turns: solo ? c.tours_max : kind === 'arena' ? ARENA_MAX_TURNS : BOSS_MAX_TURNS,
      reaction_max_s: solo ? null : c.reaction_max_s, is_sale: !!c.vente,
      context: c.contexte, objective: c.objectif, target_line: c.ligne_cible || null,
      fan_name: solo ? c.fan_name : null, fan_brief: solo ? c.consigne_fan : null, expected: solo ? c.attendu : null,
      position, active: true,
    }
    cases.push(row)
    ;(c.seed ?? []).forEach((s, i) => messages.push({
      id: uuidV5(`msg:${c.id}:${i}`), case_id: row.id, position: i * 10, speaker: s.who === 'me' ? 'creator' : 'fan', body: s.t,
    }))
    if (kind === 'arena') c.arena.forEach((code, i) => slots.push({
      id: uuidV5(`slot:${c.id}:${i}`), case_id: row.id, position: i * 10, ref_case_id: caseId(code), display_name: c.fans[i],
    }))
    if (kind === 'boss') c.fans.forEach((f, i) => fans.push({
      id: uuidV5(`fan:${c.id}:${f.id}`), case_id: row.id, position: i * 10, code: f.id, name: f.name,
      age: f.age ?? null, job: f.job || null, city: f.city || null, color: f.color || null, persona: f.persona,
      opening_message: f.seed[0].t, budget_cap: f.cap ?? null, nego_threshold: f.nego ?? null,
      nego_where: f.negoWhere || null, meet_when: f.rencontre || null, meet_where: f.rencontreWhere || null, derails: f.derails || null,
    }))
  }
  const counts = {
    modules: modules.length, axes: axes.length, sections: sections.length, cases: cases.length,
    solo: cases.filter((c) => c.kind === 'solo').length, arena: cases.filter((c) => c.kind === 'arena').length,
    boss: cases.filter((c) => c.kind === 'boss').length, messages: messages.length, slots: slots.length, fans: fans.length,
  }
  return { modules, axes, sections, cases, messages, slots, fans, counts }
}

// ---------- SQL ----------
function insertSql(table, rows) {
  if (!rows.length) return `-- ${table} : aucune ligne\n`
  const cols = Object.keys(rows[0])
  const values = rows.map((r) => `  (${cols.map((c) => sqlLit(r[c])).join(', ')})`).join(',\n')
  return `insert into public.${table} (${cols.join(', ')}) values\n${values};\n`
}

export function renderSql(seed) {
  const c = seed.counts
  return [
    '-- 0114 — Seed du catalogue de formation (reprise de Good Luck Agency).',
    '-- GÉNÉRÉ par packages/db/scripts/gen-training-seed.mjs depuis formation.json — NE PAS ÉDITER À LA MAIN',
    '-- (relancer le script). uuid v5 déterministes (namespace fixe) : re-génération = mêmes ids.',
    `-- Comptages : ${c.modules} modules, ${c.axes} axes, ${c.sections} sections, ${c.cases} cas (${c.solo} solo / ${c.arena} défis / ${c.boss} boss),`,
    `--             ${c.messages} messages d'ouverture, ${c.slots} créneaux de défi, ${c.fans} fans du boss. Migration one-shot (pas de on conflict).`,
    '',
    insertSql('training_modules', seed.modules),
    insertSql('training_module_axes', seed.axes),
    insertSql('training_module_sections', seed.sections),
    insertSql('training_cases', seed.cases),
    insertSql('training_case_messages', seed.messages),
    insertSql('training_case_arena_slots', seed.slots),
    insertSql('training_case_boss_fans', seed.fans),
  ].join('\n')
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage : node gen-training-seed.mjs <formation.json> > 0114_training_catalog_seed.sql')
    process.exit(1)
  }
  const seed = buildSeed(JSON.parse(readFileSync(file, 'utf8')))
  process.stdout.write(renderSql(seed))
  console.error('seed généré :', JSON.stringify(seed.counts))
}
```

- [ ] **Step 4: Lancer les tests**

Run: `pnpm --filter @glagency/db test`
Expected: tous PASS, y compris le test sur le `formation.json` réel (`{ modules: 7, axes: 24, sections: 10, cases: 85, solo: 79, arena: 5, boss: 1, messages: 229, slots: 25, fans: 5 }`). Si un test de conversion échoue sur un détail d'espacement, corriger le convertisseur (pas le test) — sauf si le test est manifestement faux.

- [ ] **Step 5: Commit** (demander) — `feat(db): générateur du seed formation (GLA formation.json → SQL) + tests`

---

### Task 4: Migration `0114_training_catalog_seed.sql` — génération, relecture des cours, push UAT

**Files:**
- Create: `packages/db/supabase/migrations/0114_training_catalog_seed.sql` (généré)

- [ ] **Step 1: Générer**

```bash
node packages/db/scripts/gen-training-seed.mjs ~/Documents/good-luck-agency/formation.json \
  > packages/db/supabase/migrations/0114_training_catalog_seed.sql
head -8 packages/db/supabase/migrations/0114_training_catalog_seed.sql
grep -c "^  (" packages/db/supabase/migrations/0114_training_catalog_seed.sql   # 7+24+10+85+229+25+5 = 385
```

- [ ] **Step 2: Relire le Markdown des 6 cours**

Extraire les `course_md` pour relecture visuelle (le SQL est peu lisible) :
```bash
node -e '
import("./packages/db/scripts/gen-training-seed.mjs").then(({ buildSeed }) => {
  const j = JSON.parse(require("fs").readFileSync(process.env.HOME + "/Documents/good-luck-agency/formation.json", "utf8"))
  for (const m of buildSeed(j).modules) if (m.course_md) console.log("\n\n===== " + m.code + " =====\n" + m.course_md)
})' > /private/tmp/claude-501/-Users-benoitgasnier-Documents-glagencyapp/33245346-6d87-4297-82bf-a36a8bc15d3e/scratchpad/cours.md
```
Ouvrir le fichier et vérifier pour chacun des 6 cours : titres `## `, gras `**` bien fermés (pas de `** mot**`), listes `- ` / `1. `, tables GFM (ligne `| --- |`), aucun `<…>`. Un défaut = corriger `htmlToMarkdown` (+ test), régénérer.

- [ ] **Step 3: Push UAT + contrôle des comptages**

```bash
DB="$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')"
cd packages/db && supabase db push --db-url "$DB" --dry-run && supabase db push --db-url "$DB"
psql "$DB" -c "select (select count(*) from training_modules) m, (select count(*) from training_module_axes) ax, (select count(*) from training_module_sections) s, (select count(*) from training_cases) c, (select count(*) from training_case_messages) msg, (select count(*) from training_case_arena_slots) sl, (select count(*) from training_case_boss_fans) f;"
psql "$DB" -c "select kind, count(*) from training_cases group by 1 order by 1;"
psql "$DB" -c "select code, left(course_md, 60) from training_modules order by position;"
```
Attendu : `7 | 24 | 10 | 85 | 229 | 25 | 5` ; `arena 5 / boss 1 / solo 79` ; 6 cours non nuls (`boss` null).

- [ ] **Step 4: Commit** (demander) — `feat(db): 0114 seed du catalogue de formation (7 modules, 85 cas)`

---

### Task 5: Briques partagées web — `lib/types/training.ts`, `lib/slug.ts`, `components/markdown-view.tsx`

**Files:**
- Create: `apps/web/src/lib/types/training.ts`
- Create: `apps/web/src/lib/slug.ts`, `apps/web/src/lib/slug.test.ts`
- Create: `apps/web/src/components/markdown-view.tsx`
- Modify: `apps/web/package.json` (deps `react-markdown`, `remark-gfm`, `remark-breaks`)

**Interfaces:**
- Produces: `CaseKind`, `CASE_KINDS`, `CASE_KIND_LABELS`, `Speaker`, `SPEAKERS`, `SPEAKER_LABELS` ; `slugify(input: string, max = 32): string`, `uniqueSlug(base: string, taken: ReadonlySet<string>): string` ; `<MarkdownView source className? />`.

- [ ] **Step 1: Test de `slugify` (échoue)**

`apps/web/src/lib/slug.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('ASCII minuscule, accents retirés, séparateurs → _', () => {
    expect(slugify('Setting & Qualification')).toBe('setting_qualification')
    expect(slugify('Élan — Négo (v2)')).toBe('elan_nego_v2')
    expect(slugify('  Relance   spender  ')).toBe('relance_spender')
  })
  it('borne la longueur sans finir par _ et garantit 2 caractères', () => {
    expect(slugify('a'.repeat(50)).length).toBe(32)
    expect(slugify('abcdefghij_klmnopqrst_uvwxyz_abcd_ef')).toBe('abcdefghij_klmnopqrst_uvwxyz_abc')
    expect(slugify('!!')).toBe('xx')
    expect(slugify('é')).toBe('ex')
  })
  it('respecte le check SQL ^[a-z0-9_-]{2,40}$', () => {
    for (const s of ['Boss final', '5 transitions en simultané', 'Tenir le 6€', '📲 Relance']) {
      expect(slugify(s)).toMatch(/^[a-z0-9_]{2,32}$/)
    }
  })
})

describe('uniqueSlug', () => {
  it('suffixe _2, _3… quand le slug est pris', () => {
    expect(uniqueSlug('a', new Set())).toBe('a')
    expect(uniqueSlug('a', new Set(['a']))).toBe('a_2')
    expect(uniqueSlug('a', new Set(['a', 'a_2']))).toBe('a_3')
  })
})
```
Run: `pnpm --filter @glagency/web test` → FAIL (module `./slug` absent).

- [ ] **Step 2: `lib/slug.ts`**

```ts
/**
 * Slug technique d'un libellé — les `code` du catalogue de formation (modules, sections, cas,
 * fans du boss) : minuscules ASCII, accents retirés, tout le reste → `_`, 2 à `max` caractères
 * (32 par défaut : + `_999` reste sous les 40 du check SQL). Jamais saisi par l'utilisateur,
 * généré à la création, immuable ensuite.
 */
export function slugify(input: string, max = 32): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '')
  return base.length >= 2 ? base : `${base}xx`.slice(0, 2)
}

/** Dédoublonne contre un ensemble de slugs pris : `base`, puis `base_2`, `base_3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const s = `${base}_${i}`
    if (!taken.has(s)) return s
  }
  throw new Error('slug : impossible de dédoublonner')
}
```
Run: `pnpm --filter @glagency/web test` → PASS.

- [ ] **Step 3: `lib/types/training.ts`**

```ts
/**
 * Vocabulaire PARTAGÉ du catalogue de formation (features `training-catalog` — admin — et
 * `training-modules` — lecture) : les sortes de cas et les locuteurs des messages d'ouverture.
 * Miroir des `check` SQL de 0113 (`kind in ('solo','arena','boss')`, `speaker in ('creator','fan')`).
 */
export const CASE_KINDS = ['solo', 'arena', 'boss'] as const
export type CaseKind = (typeof CASE_KINDS)[number]
export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  solo: 'Solo',
  arena: 'Défi simultané',
  boss: 'Boss final',
}

export const SPEAKERS = ['creator', 'fan'] as const
export type Speaker = (typeof SPEAKERS)[number]
export const SPEAKER_LABELS: Record<Speaker, string> = { creator: 'Créatrice', fan: 'Fan' }
```

- [ ] **Step 4: Dépendances Markdown + `MarkdownView`**

```bash
pnpm --filter @glagency/web add react-markdown remark-gfm remark-breaks
```

`apps/web/src/components/markdown-view.tsx` :
```tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/lib/utils'

/**
 * Rendu Markdown des cours de formation (page Modules) et de l'aperçu du Catalogue. GFM
 * (tables) + sauts de ligne simples respectés (remark-breaks : ce que l'admin tape dans le
 * Textarea = ce que le chatter voit). Aucun HTML brut rendu (react-markdown l'échappe par
 * défaut → pas de vecteur XSS). Styles posés élément par élément via `components` — pas de
 * plugin typography, rien de global. Utilisable en RSC comme dans un composant client.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed', className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-3 py-2 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
        }}
      >
        {source}
      </Markdown>
    </div>
  )
}
```

- [ ] **Step 5: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web test`
Expected: OK (le `import-x` résout `react-markdown` ; si `remark-breaks` n'a pas de types, ajouter `declare module 'remark-breaks'` dans `apps/web/src/types/remark-breaks.d.ts` — vérifier d'abord `ls node_modules/remark-breaks/index.d.ts` depuis `apps/web`).

- [ ] **Step 6: Commit** (demander) — `feat(web): briques formation — slugify, vocabulaire des cas, rendu Markdown`

---

### Task 6: `training-catalog` — types, schémas Zod, Server Actions (modules + cas)

**Files:**
- Create: `apps/web/src/features/training-catalog/types.ts`
- Create: `apps/web/src/features/training-catalog/schema.ts`, `apps/web/src/features/training-catalog/schema.test.ts`
- Create: `apps/web/src/features/training-catalog/actions.ts`

**Interfaces:**
- Produces (types) : `CatalogAxis`, `CatalogSection`, `CatalogMessage`, `CatalogArenaSlot`, `CatalogBossFan`, `CatalogCase`, `CatalogModule`, `CatalogData`.
- Produces (schema) : `moduleForm` (`ModuleFormValues` = `z.input`, `ModuleInput` = `z.infer`), `caseForm` (`CaseFormValues`, `CaseInput`), `axisInput`, `sectionInput`, `messageInput`, `arenaSlotInput`, `bossFanInput`, `toggleInput`, `moveInput`, `idInput`.
- Produces (actions) : `saveModule(raw): Promise<ActionResult<{ code: string }>>`, `toggleModule`, `moveModule`, `saveCase(raw): Promise<ActionResult>`, `toggleCase`, `moveCase`, `duplicateCase` — toutes `Promise<ActionResult>` sauf mention.
- Consumes : `slugify`/`uniqueSlug` (`@/lib/slug`), `CASE_KINDS`/`SPEAKERS` (`@/lib/types/training`), `runAction`/`noGuard`/`requireAdminProfile`/`BusinessError` (`@/lib/actions`), `readStateCookie` (`@/lib/impersonation/session`), `createClient` (`@/lib/supabase/server`).

- [ ] **Step 1: `types.ts`**

```ts
import type { CaseKind, Speaker } from '@/lib/types/training'

/**
 * Contrat du Catalogue (ADMIN) : le modèle COMPLET — y compris ce qui pilote l'IA (fan_brief,
 * champs cachés des fans du boss) et ce qui se révèle après coup (expected). Ne JAMAIS servir ces
 * types à une page vue par un chatter : la face lecture (`features/training-modules`) a sa
 * projection publique. Ordonné par `position` partout.
 */
export interface CatalogAxis {
  id: string
  key: string
  name: string
  description: string
  position: number
}

export interface CatalogSection {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  position: number
}

export interface CatalogMessage {
  id: string
  position: number
  speaker: Speaker
  body: string
}

export interface CatalogArenaSlot {
  id: string
  position: number
  refCaseId: string
  displayName: string
}

export interface CatalogBossFan {
  id: string
  position: number
  code: string
  name: string
  age: number | null
  job: string | null
  city: string | null
  color: string | null
  persona: string
  openingMessage: string
  budgetCap: number | null
  negoThreshold: number | null
  negoWhere: string | null
  meetWhen: string | null
  meetWhere: string | null
  derails: string | null
}

export interface CatalogCase {
  id: string
  moduleId: string
  sectionId: string | null
  code: string
  kind: CaseKind
  title: string
  phase: string
  difficulty: number
  maxTurns: number
  reactionMaxS: number | null
  isSale: boolean
  context: string
  objective: string
  targetLine: string | null
  fanName: string | null
  fanBrief: string | null
  expected: string | null
  position: number
  active: boolean
  messages: CatalogMessage[]
  arenaSlots: CatalogArenaSlot[]
  bossFans: CatalogBossFan[]
}

export interface CatalogModule {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  objectiveLabel: string
  courseMd: string | null
  scoringNotes: string | null
  position: number
  active: boolean
  axes: CatalogAxis[]
  sections: CatalogSection[]
  cases: CatalogCase[]
}

export interface CatalogData {
  modules: CatalogModule[]
}
```

- [ ] **Step 2: Test du schéma (échoue)**

`apps/web/src/features/training-catalog/schema.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { caseForm, moduleForm } from './schema'

const base = {
  id: null, moduleId: '11111111-1111-4111-8111-111111111111', kind: 'solo', sectionId: null,
  title: 'Cas', phase: 'Qualification', difficulty: '3', maxTurns: '6', isSale: false,
  context: 'ctx', objective: 'obj', targetLine: '',
  fanName: 'Tony', fanBrief: 'brief', expected: 'att', messages: [{ speaker: 'fan', body: 'cc' }],
  reactionMaxS: '', slots: [], fans: [],
}
const fieldErrors = (r: z.ZodSafeParseResult<unknown>) =>
  r.success ? {} : z.flattenError(r.error).fieldErrors

describe('caseForm', () => {
  it('solo valide : nombres coercés, chaînes vides → null', () => {
    const r = caseForm.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.difficulty).toBe(3)
      expect(r.data.maxTurns).toBe(6)
      expect(r.data.targetLine).toBeNull()
      expect(r.data.reactionMaxS).toBeNull()
    }
  })
  it('solo : prénom / consigne / attendu obligatoires', () => {
    const r = caseForm.safeParse({ ...base, fanName: '', fanBrief: '', expected: '' })
    expect(Object.keys(fieldErrors(r)).sort()).toEqual(['expected', 'fanBrief', 'fanName'])
  })
  it('défi : délai obligatoire, exactement 5 conversations, pas de champs fan', () => {
    const slot = { refCaseId: '22222222-2222-4222-8222-222222222222', displayName: 'A' }
    const r = caseForm.safeParse({ ...base, kind: 'arena', fanName: '', fanBrief: '', expected: '', slots: [slot, slot, slot, slot] })
    expect(Object.keys(fieldErrors(r)).sort()).toEqual(['reactionMaxS', 'slots'])
    const ok = caseForm.safeParse({ ...base, kind: 'arena', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', slots: [slot, slot, slot, slot, slot] })
    expect(ok.success).toBe(true)
  })
  it('boss : au moins un fan, âge/couleur facultatifs mais bornés', () => {
    const fan = { name: 'Kevin', age: '', job: '', city: '', color: '', persona: 'p', openingMessage: 'salut', budgetCap: '60', negoThreshold: '', negoWhere: '', meetWhen: '', meetWhere: '', derails: '' }
    expect(fieldErrors(caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [] }))).toHaveProperty('fans')
    const ok = caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [fan] })
    expect(ok.success).toBe(true)
    if (ok.success) { expect(ok.data.fans[0].age).toBeNull(); expect(ok.data.fans[0].budgetCap).toBe(60); expect(ok.data.fans[0].color).toBeNull() }
    const bad = caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [{ ...fan, age: '12', color: 'rouge' }] })
    expect(bad.success).toBe(false)
  })
  it('difficulté hors 1-10 refusée', () => {
    expect(caseForm.safeParse({ ...base, difficulty: '11' }).success).toBe(false)
  })
})

describe('moduleForm', () => {
  const mod = { id: null, title: 'Setting', emoji: '', description: '', objectiveLabel: 'Objectif', courseMd: '', scoringNotes: '', axes: [], sections: [] }
  it('accepte un module SANS axe (Boss final) et normalise la clé d’axe', () => {
    expect(moduleForm.safeParse(mod).success).toBe(true)
    const r = moduleForm.safeParse({ ...mod, axes: [{ existingId: null, key: ' Naturel ', name: 'N', description: 'd' }] })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.axes[0].key).toBe('naturel')
  })
  it('refuse deux axes de même clé et une clé hors format', () => {
    const a = { existingId: null, key: 'k1', name: 'N', description: 'd' }
    expect(moduleForm.safeParse({ ...mod, axes: [a, a] }).success).toBe(false)
    expect(moduleForm.safeParse({ ...mod, axes: [{ ...a, key: 'Clé accentuée' }] }).success).toBe(false)
  })
})
```
Run: `pnpm --filter @glagency/web test` → FAIL (`./schema` absent).

- [ ] **Step 3: `schema.ts`**

```ts
import { z } from 'zod'
import { CASE_KINDS, SPEAKERS } from '@/lib/types/training'

// Schémas PARTAGÉS dialogs (RHF + zodResolver) / Server Actions (runAction). Longueurs alignées
// sur les `check` SQL de 0113. Zod v4. Les `code` (slugs) ne sont JAMAIS saisis : générés côté
// action à la création (slugify), immuables ensuite. `id: null` = création (patron scripts).

const text = (max: number) => z.string().trim().max(max, `${max} caractères max`)
const required = (max: number, msg: string) => text(max).min(1, msg)
/** Champ texte facultatif : '' → null (colonne nullable). */
const optionalText = (max: number) => text(max).transform((v) => (v === '' ? null : v)).nullable()
/** Entier saisi dans un <input type="number"> : '' / NaN / null → null quand facultatif. */
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? null : v),
    z.coerce.number({ error: 'Nombre invalide' }).int('Nombre entier').min(min, `Minimum ${min}`).max(max, `Maximum ${max}`).nullable(),
  )
const requiredInt = (min: number, max: number) =>
  z.coerce.number({ error: 'Nombre requis' }).int('Nombre entier').min(min, `Minimum ${min}`).max(max, `Maximum ${max}`)

// ---------- Module ----------
export const axisInput = z.object({
  existingId: z.uuid().nullable(), // null = nouvel axe (diff par id côté action). Pas `id` : useFieldArray réserve cette clé
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,30}$/, 'Clé : 2 à 30 caractères, minuscules / chiffres / _'),
  name: required(60, 'Nom requis'),
  description: required(2000, 'Description requise'),
})
export const sectionInput = z.object({
  existingId: z.uuid().nullable(), // null = nouvelle section (code généré du titre)
  title: required(80, 'Titre requis'),
  emoji: optionalText(8),
  description: optionalText(500),
})
export const moduleForm = z.object({
  id: z.uuid().nullable(), // null = création
  title: required(80, 'Titre requis'),
  emoji: optionalText(8),
  description: optionalText(500),
  objectiveLabel: required(40, 'Libellé requis'),
  courseMd: optionalText(50_000),
  scoringNotes: optionalText(5_000),
  // Pas de minimum : le module Boss final (GLA) n'a AUCUN axe — il est noté par étape.
  axes: z
    .array(axisInput)
    .max(20, '20 axes max')
    .refine((a) => new Set(a.map((x) => x.key)).size === a.length, 'Deux axes ont la même clé'),
  sections: z.array(sectionInput).max(20, '20 sections max'),
})
export type ModuleFormValues = z.input<typeof moduleForm>
export type ModuleInput = z.infer<typeof moduleForm>

// ---------- Cas ----------
export const messageInput = z.object({
  speaker: z.enum(SPEAKERS),
  body: required(1000, 'Message vide'),
})
export const arenaSlotInput = z.object({
  refCaseId: z.uuid('Choisis un cas'),
  displayName: required(30, 'Prénom requis'),
})
export const bossFanInput = z.object({
  name: required(30, 'Prénom requis'),
  age: optionalInt(18, 99),
  job: optionalText(60),
  city: optionalText(60),
  color: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, 'Couleur au format #rrggbb')
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  persona: required(500, 'Caractère requis'),
  openingMessage: required(1000, 'Message d’ouverture requis'),
  budgetCap: optionalInt(0, 100_000),
  negoThreshold: optionalInt(0, 100_000),
  negoWhere: optionalText(500),
  meetWhen: optionalText(500),
  meetWhere: optionalText(500),
  derails: optionalText(1000),
})

/**
 * UN objet PLAT pour les trois sortes (une union discriminée est pénible à typer avec RHF) ; les
 * règles propres à chaque sorte vivent dans le superRefine ci-dessous, avec un `path` par champ.
 * Les champs des autres sortes voyagent vides et sont IGNORÉS côté action (colonnes à null).
 */
const caseFields = z.object({
  id: z.uuid().nullable(), // null = création
  moduleId: z.uuid(),
  kind: z.enum(CASE_KINDS), // choisie à la création, immuable ensuite (vérifié côté action)
  sectionId: z.uuid().nullable(),
  title: required(80, 'Titre requis'),
  phase: text(60),
  difficulty: requiredInt(1, 10),
  maxTurns: requiredInt(1, 50),
  isSale: z.boolean(),
  context: required(4000, 'Contexte requis'),
  objective: required(2000, 'Objectif requis'),
  targetLine: optionalText(1000),
  // solo
  fanName: text(30),
  fanBrief: text(4000),
  expected: text(4000),
  messages: z.array(messageInput).max(30, '30 messages max'),
  // défi / boss
  reactionMaxS: optionalInt(10, 600),
  slots: z.array(arenaSlotInput).max(5, '5 conversations max'),
  fans: z.array(bossFanInput).max(5, '5 fans max'),
})
export const caseForm = caseFields.superRefine((v, ctx) => {
  const need = (path: string, ok: boolean, message: string) => {
    if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
  }
  if (v.kind === 'solo') {
    need('fanName', v.fanName.length > 0, 'Prénom du fan requis')
    need('fanBrief', v.fanBrief.length > 0, 'Consigne du fan requise')
    need('expected', v.expected.length > 0, '« Attendu » requis')
  } else {
    need('reactionMaxS', v.reactionMaxS !== null, 'Délai de réponse requis')
  }
  if (v.kind === 'arena') need('slots', v.slots.length === 5, 'Exactement 5 conversations')
  if (v.kind === 'boss') need('fans', v.fans.length >= 1, 'Au moins un fan')
})
export type CaseFormValues = z.input<typeof caseForm>
export type CaseInput = z.infer<typeof caseForm>

// ---------- Commandes simples (appelées hors form RHF — schémas partagés quand même : idInput
// sert au dialog de duplication, toggle/move aux boutons de la table) ----------
export const idInput = z.object({ id: z.uuid() })
export const toggleInput = z.object({ id: z.uuid(), active: z.boolean() })
export const moveInput = z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) })
```
Run: `pnpm --filter @glagency/web test` → PASS.

- [ ] **Step 4: `actions.ts`**

```ts
'use server'

// Server Actions du Catalogue de formation — ADMIN uniquement (contrôle en tête de handler,
// patron §4 des guidelines : `requireAdminProfile()` UNE fois, refus = BusinessError, jamais de
// redirect). Client SESSION (`createClient`) : la RLS `*_admin_write` (0113) reste le rempart.
// Pas de suppression de module ni de cas : on DÉSACTIVE. Refus en impersonation, comme Membres.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requireAdminProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { slugify, uniqueSlug } from '@/lib/slug'
import { caseForm, idInput, moduleForm, moveInput, toggleInput, type CaseInput, type ModuleInput } from './schema'

type Db = Awaited<ReturnType<typeof createClient>>

const revalidateCatalog = () => {
  revalidatePath('/formation/catalogue')
  // Les pages Modules (liste + [code]) lisent les mêmes tables : 'layout' couvre tout le segment.
  revalidatePath('/formation/modules', 'layout')
}

/** Admin + pas en « en tant que » — une seule requête profil. */
async function requireCatalogAdmin() {
  const admin = await requireAdminProfile()
  if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')
  return admin
}

const stampBy = (adminId: string) => ({ updated_at: new Date().toISOString(), updated_by: adminId })

// ======================= MODULES =======================

/**
 * Crée (id null) ou modifie un module ET ses axes / sections (diff par id : ajout, modif,
 * suppression — ajouts/modifs d'abord, suppressions ensuite). Retourne le `code` (le dialog
 * navigue dessus après création).
 */
export async function saveModule(raw: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction({
    schema: moduleForm,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const row = {
        title: d.title,
        emoji: d.emoji,
        description: d.description,
        objective_label: d.objectiveLabel,
        course_md: d.courseMd,
        scoring_notes: d.scoringNotes,
        ...stampBy(admin.id),
      }
      let moduleId: string
      let code: string
      if (d.id) {
        const { data: cur, error } = await supabase.from('training_modules').select('id, code').eq('id', d.id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!cur) throw new BusinessError('Module introuvable')
        const { error: uErr } = await supabase.from('training_modules').update(row).eq('id', d.id)
        if (uErr) throw new Error(uErr.message)
        moduleId = cur.id
        code = cur.code
      } else {
        const { data: existing, error: cErr } = await supabase
          .from('training_modules')
          .select('code, position')
          .order('position', { ascending: false })
        if (cErr) throw new Error(cErr.message)
        code = uniqueSlug(slugify(d.title), new Set((existing ?? []).map((m) => m.code)))
        const position = (existing?.[0]?.position ?? -10) + 10
        const { data: created, error: iErr } = await supabase
          .from('training_modules')
          .insert({ ...row, code, position })
          .select('id')
          .single()
        if (iErr) throw new Error(iErr.message)
        moduleId = created.id
      }
      await syncAxes(supabase, moduleId, d.axes)
      await syncSections(supabase, moduleId, d.sections)
      revalidateCatalog()
      return { code }
    },
  })
}

/** Axes : diff par id. Une clé en double dans le module = refus métier (unique (module_id, key)). */
async function syncAxes(supabase: Db, moduleId: string, axes: ModuleInput['axes']) {
  const { data: current, error } = await supabase.from('training_module_axes').select('id').eq('module_id', moduleId)
  if (error) throw new Error(error.message)
  const keep = new Set(axes.map((a) => a.existingId).filter((id): id is string => !!id))
  const dup = (e: { code?: string; message: string }) =>
    e.code === '23505' ? new BusinessError('Deux axes ont la même clé', { axes: ['Clé déjà utilisée'] }) : new Error(e.message)
  for (const [i, a] of axes.entries()) {
    const values = { module_id: moduleId, key: a.key, name: a.name, description: a.description, position: i * 10 }
    if (a.existingId) {
      const { error: e } = await supabase.from('training_module_axes').update(values).eq('id', a.existingId).eq('module_id', moduleId)
      if (e) throw dup(e)
    } else {
      const { error: e } = await supabase.from('training_module_axes').insert(values)
      if (e) throw dup(e)
    }
  }
  const toDelete = (current ?? []).map((a) => a.id).filter((id) => !keep.has(id))
  if (toDelete.length) {
    const { error: e } = await supabase.from('training_module_axes').delete().in('id', toDelete)
    if (e) throw new Error(e.message)
  }
}

/** Sections : diff par id ; une nouvelle section reçoit un code slug unique dans le module.
 *  Supprimer une section remet `section_id` des cas à null (FK on delete set null). */
async function syncSections(supabase: Db, moduleId: string, sections: ModuleInput['sections']) {
  const { data: current, error } = await supabase.from('training_module_sections').select('id, code').eq('module_id', moduleId)
  if (error) throw new Error(error.message)
  const keep = new Set(sections.map((s) => s.existingId).filter((id): id is string => !!id))
  const taken = new Set((current ?? []).map((s) => s.code))
  for (const [i, s] of sections.entries()) {
    const values = { module_id: moduleId, title: s.title, emoji: s.emoji, description: s.description, position: i * 10 }
    if (s.existingId) {
      const { error: e } = await supabase.from('training_module_sections').update(values).eq('id', s.existingId).eq('module_id', moduleId)
      if (e) throw new Error(e.message)
    } else {
      const code = uniqueSlug(slugify(s.title), taken)
      taken.add(code)
      const { error: e } = await supabase.from('training_module_sections').insert({ ...values, code })
      if (e) throw new Error(e.message)
    }
  }
  const toDelete = (current ?? []).map((s) => s.id).filter((id) => !keep.has(id))
  if (toDelete.length) {
    const { error: e } = await supabase.from('training_module_sections').delete().in('id', toDelete)
    if (e) throw new Error(e.message)
  }
}

/** Active / désactive un module (un module inactif cache ses cas dans Modules). */
export async function toggleModule(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: toggleInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, active }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('training_modules')
        .update({ active, ...stampBy(admin.id) })
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Module introuvable')
      revalidateCatalog()
    },
  })
}

/** Déplace un module d'un cran (échange les positions avec son voisin) — patron scripts. */
export async function moveModule(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, direction }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_modules').select('id, position').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Module introuvable')
      const { data: neighbor, error: nErr } = await supabase
        .from('training_modules')
        .select('id, position')
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (nErr) throw new Error(nErr.message)
      if (!neighbor) throw new BusinessError('Déjà en bout de liste')
      // Échange des positions (2 updates — un échec au milieu laisse au pire un doublon de
      // position, corrigé au prochain déplacement). Inline plutôt qu'un helper générique :
      // `supabase.from(<union de tables>)` n'est pas appelable en TS.
      const { error: e1 } = await supabase.from('training_modules').update({ position: neighbor.position, ...stampBy(admin.id) }).eq('id', cur.id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('training_modules').update({ position: cur.position, ...stampBy(admin.id) }).eq('id', neighbor.id)
      if (e2) throw new Error(e2.message)
      revalidateCatalog()
    },
  })
}

// ======================= CAS =======================

/**
 * Crée (id null) ou modifie un cas. Vérifs métier UNE fois : module existant, section du même
 * module, créneaux de défi = solos du même module, sorte immuable. En édition, les enfants
 * (messages / créneaux / fans) sont REMPLACÉS en bloc — rien ne les référence encore (les
 * sessions futures stockeront un instantané du cas joué).
 */
export async function saveCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: caseForm,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: mod, error: mErr } = await supabase.from('training_modules').select('id').eq('id', d.moduleId).maybeSingle()
      if (mErr) throw new Error(mErr.message)
      if (!mod) throw new BusinessError('Module introuvable')
      if (d.sectionId) {
        const { data: sec, error: sErr } = await supabase
          .from('training_module_sections')
          .select('id')
          .eq('id', d.sectionId)
          .eq('module_id', d.moduleId)
          .maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (!sec) throw new BusinessError('Cette section n’appartient pas au module', { sectionId: ['Section inconnue pour ce module'] })
      }
      if (d.kind === 'arena') await assertArenaRefs(supabase, d.moduleId, d.slots.map((s) => s.refCaseId))

      const solo = d.kind === 'solo'
      const row = {
        module_id: d.moduleId,
        section_id: d.sectionId,
        title: d.title,
        phase: d.phase,
        difficulty: d.difficulty,
        max_turns: d.maxTurns,
        reaction_max_s: solo ? null : d.reactionMaxS,
        is_sale: d.isSale,
        context: d.context,
        objective: d.objective,
        target_line: d.targetLine,
        fan_name: solo ? d.fanName : null,
        fan_brief: solo ? d.fanBrief : null,
        expected: solo ? d.expected : null,
        ...stampBy(admin.id),
      }
      let caseId: string
      if (d.id) {
        const { data: cur, error } = await supabase.from('training_cases').select('id, kind').eq('id', d.id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!cur) throw new BusinessError('Cas introuvable')
        if (cur.kind !== d.kind) throw new BusinessError('La sorte d’un cas ne se change pas — crée un nouveau cas')
        const { error: uErr } = await supabase.from('training_cases').update(row).eq('id', d.id)
        if (uErr) throw new Error(uErr.message)
        caseId = cur.id
        for (const table of ['training_case_messages', 'training_case_arena_slots', 'training_case_boss_fans'] as const) {
          const { error: dErr } = await supabase.from(table).delete().eq('case_id', caseId)
          if (dErr) throw new Error(dErr.message)
        }
      } else {
        const [{ data: last, error: pErr }, { data: codes, error: kErr }] = await Promise.all([
          supabase.from('training_cases').select('position').eq('module_id', d.moduleId).order('position', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('training_cases').select('code'),
        ])
        if (pErr) throw new Error(pErr.message)
        if (kErr) throw new Error(kErr.message)
        const code = uniqueSlug(slugify(d.title), new Set((codes ?? []).map((c) => c.code)))
        const { data: created, error: iErr } = await supabase
          .from('training_cases')
          .insert({ ...row, kind: d.kind, code, position: (last?.position ?? -10) + 10 })
          .select('id')
          .single()
        if (iErr) throw new Error(iErr.message)
        caseId = created.id
      }
      await insertChildren(supabase, caseId, d)
      revalidateCatalog()
    },
  })
}

/** Chaque créneau d'un défi doit rejouer un cas SOLO du même module. */
async function assertArenaRefs(supabase: Db, moduleId: string, refs: string[]) {
  const ids = [...new Set(refs)]
  const { data, error } = await supabase.from('training_cases').select('id').in('id', ids).eq('module_id', moduleId).eq('kind', 'solo')
  if (error) throw new Error(error.message)
  const ok = new Set((data ?? []).map((c) => c.id))
  if (ids.some((id) => !ok.has(id))) {
    throw new BusinessError('Chaque conversation du défi doit rejouer un cas solo de ce module', {
      slots: ['Un cas choisi n’est pas un solo de ce module'],
    })
  }
}

async function insertChildren(supabase: Db, caseId: string, d: CaseInput) {
  if (d.kind === 'solo' && d.messages.length) {
    const { error } = await supabase
      .from('training_case_messages')
      .insert(d.messages.map((m, i) => ({ case_id: caseId, position: i * 10, speaker: m.speaker, body: m.body })))
    if (error) throw new Error(error.message)
  }
  if (d.kind === 'arena') {
    const { error } = await supabase
      .from('training_case_arena_slots')
      .insert(d.slots.map((s, i) => ({ case_id: caseId, position: i * 10, ref_case_id: s.refCaseId, display_name: s.displayName })))
    if (error) throw new Error(error.message)
  }
  if (d.kind === 'boss') {
    const taken = new Set<string>()
    const rows = d.fans.map((f, i) => {
      // code ≤ 30 (check SQL) : base 26 + suffixe éventuel.
      const code = uniqueSlug(slugify(f.name, 26), taken)
      taken.add(code)
      return {
        case_id: caseId,
        position: i * 10,
        code,
        name: f.name,
        age: f.age,
        job: f.job,
        city: f.city,
        color: f.color,
        persona: f.persona,
        opening_message: f.openingMessage,
        budget_cap: f.budgetCap,
        nego_threshold: f.negoThreshold,
        nego_where: f.negoWhere,
        meet_when: f.meetWhen,
        meet_where: f.meetWhere,
        derails: f.derails,
      }
    })
    const { error } = await supabase.from('training_case_boss_fans').insert(rows)
    if (error) throw new Error(error.message)
  }
}

/** Active / désactive un cas. Un SOLO joué dans un défi ne se désactive pas tant que le créneau existe. */
export async function toggleCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: toggleInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, active }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_cases').select('id, kind').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Cas introuvable')
      if (!active && cur.kind === 'solo') {
        const { data: slot, error: sErr } = await supabase
          .from('training_case_arena_slots')
          .select('case_id')
          .eq('ref_case_id', id)
          .limit(1)
          .maybeSingle()
        if (sErr) throw new Error(sErr.message)
        if (slot) {
          const { data: arena, error: aErr } = await supabase.from('training_cases').select('title').eq('id', slot.case_id).maybeSingle()
          if (aErr) throw new Error(aErr.message)
          throw new BusinessError(`Ce cas est joué dans le défi « ${arena?.title ?? '?'} » — retire-le d’abord`)
        }
      }
      const { error: tErr } = await supabase.from('training_cases').update({ active, ...stampBy(admin.id) }).eq('id', id)
      if (tErr) throw new Error(tErr.message)
      revalidateCatalog()
    },
  })
}

/** Déplace un cas d'un cran dans SON module. */
export async function moveCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id, direction }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: cur, error } = await supabase.from('training_cases').select('id, module_id, position').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      if (!cur) throw new BusinessError('Cas introuvable')
      const { data: neighbor, error: nErr } = await supabase
        .from('training_cases')
        .select('id, position')
        .eq('module_id', cur.module_id)
        .filter('position', direction === 'up' ? 'lt' : 'gt', cur.position)
        .order('position', { ascending: direction === 'down' })
        .limit(1)
        .maybeSingle()
      if (nErr) throw new Error(nErr.message)
      if (!neighbor) throw new BusinessError('Déjà en bout de liste')
      const { error: e1 } = await supabase.from('training_cases').update({ position: neighbor.position, ...stampBy(admin.id) }).eq('id', cur.id)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('training_cases').update({ position: cur.position, ...stampBy(admin.id) }).eq('id', neighbor.id)
      if (e2) throw new Error(e2.message)
      revalidateCatalog()
    },
  })
}

/** Duplique un cas (« Copie de … », INACTIF, en fin de module) avec ses messages / créneaux / fans. */
export async function duplicateCase(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: idInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const admin = await requireCatalogAdmin()
      const supabase = await createClient()
      const { data: src, error } = await supabase
        .from('training_cases')
        // `!case_id` : deux FK de arena_slots vers training_cases → indice obligatoire (PGRST201).
        .select('*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!src) throw new BusinessError('Cas introuvable')
      const [{ data: last, error: pErr }, { data: codes, error: kErr }] = await Promise.all([
        supabase.from('training_cases').select('position').eq('module_id', src.module_id).order('position', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('training_cases').select('code'),
      ])
      if (pErr) throw new Error(pErr.message)
      if (kErr) throw new Error(kErr.message)
      const title = `Copie de ${src.title}`.slice(0, 80)
      const code = uniqueSlug(slugify(title), new Set((codes ?? []).map((c) => c.code)))
      const { data: created, error: iErr } = await supabase
        .from('training_cases')
        .insert({
          module_id: src.module_id,
          section_id: src.section_id,
          code,
          kind: src.kind,
          title,
          phase: src.phase,
          difficulty: src.difficulty,
          max_turns: src.max_turns,
          reaction_max_s: src.reaction_max_s,
          is_sale: src.is_sale,
          context: src.context,
          objective: src.objective,
          target_line: src.target_line,
          fan_name: src.fan_name,
          fan_brief: src.fan_brief,
          expected: src.expected,
          position: (last?.position ?? -10) + 10,
          active: false,
          ...stampBy(admin.id),
        })
        .select('id')
        .single()
      if (iErr) throw new Error(iErr.message)
      const caseId = created.id
      if (src.training_case_messages.length) {
        const { error: e } = await supabase.from('training_case_messages').insert(
          src.training_case_messages.map((m) => ({ case_id: caseId, position: m.position, speaker: m.speaker, body: m.body })),
        )
        if (e) throw new Error(e.message)
      }
      if (src.training_case_arena_slots.length) {
        const { error: e } = await supabase.from('training_case_arena_slots').insert(
          src.training_case_arena_slots.map((s) => ({ case_id: caseId, position: s.position, ref_case_id: s.ref_case_id, display_name: s.display_name })),
        )
        if (e) throw new Error(e.message)
      }
      if (src.training_case_boss_fans.length) {
        const { error: e } = await supabase.from('training_case_boss_fans').insert(
          src.training_case_boss_fans.map((f) => ({
            case_id: caseId,
            position: f.position,
            code: f.code,
            name: f.name,
            age: f.age,
            job: f.job,
            city: f.city,
            color: f.color,
            persona: f.persona,
            opening_message: f.opening_message,
            budget_cap: f.budget_cap,
            nego_threshold: f.nego_threshold,
            nego_where: f.nego_where,
            meet_when: f.meet_when,
            meet_where: f.meet_where,
            derails: f.derails,
          })),
        )
        if (e) throw new Error(e.message)
      }
      revalidateCatalog()
    },
  })
}
```

- [ ] **Step 5: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web test`
Expected: OK. Points de vigilance TS : `.filter('position', 'lt' | 'gt', …)` (signature déjà utilisée dans `features/scripts/actions.ts`) ; l'embed `training_case_messages(*)` dans `duplicateCase` est typé grâce aux `Relationships` de `types.ts` régénéré (Task 1). Si `slots`/`sectionId` dans le second argument de `BusinessError` déclenchent une erreur de type, c'est `Record<string, string[]>` — vérifier les clés.

- [ ] **Step 6: Commit** (demander) — `feat(formation): catalogue — types, schémas Zod et Server Actions (modules, cas)`

---

### Task 7: `training-catalog` — service, Template, colonne modules, panneau + table des cas, route `/formation/catalogue`

**Files:**
- Create: `apps/web/src/features/training-catalog/services/get-catalog.ts`
- Create: `apps/web/src/features/training-catalog/CatalogTemplate.tsx`
- Create: `apps/web/src/features/training-catalog/components/catalog-skeleton.tsx`
- Create: `apps/web/src/features/training-catalog/components/modules-list.tsx`
- Create: `apps/web/src/features/training-catalog/components/module-panel.tsx`
- Create: `apps/web/src/features/training-catalog/components/cases-table.tsx`
- Create: `apps/web/src/app/(dash)/formation/catalogue/page.tsx`, `apps/web/src/app/(dash)/formation/catalogue/loading.tsx`

**Interfaces:**
- Produces: `getCatalog(): Promise<CatalogData>` ; `<CatalogTemplate data selectedCode />` ; `<ModulesList modules selectedId onCreate? />` ; `<ModulePanel module />` ; `<CasesTable module onEdit? />` ; `<CatalogSkeleton />`.
- Consumes: Task 6 (`types.ts`, actions `moveModule`, `toggleModule`, `moveCase`, `toggleCase`, `duplicateCase`), `CASE_KIND_LABELS`.
- Les boutons « Nouveau module », « Éditer » (module), « Nouveau cas » et « Éditer » (cas) sont branchés aux Tasks 8/9 — ici les props `onCreate`/`onEdit` existent déjà (optionnelles) pour ne pas retoucher la table ensuite.

- [ ] **Step 1: `services/get-catalog.ts`**

```ts
import type { Database } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { CaseKind, Speaker } from '@/lib/types/training'
import type { CatalogCase, CatalogData, CatalogModule } from '../types'

type T = Database['public']['Tables']
type ModuleRow = T['training_modules']['Row'] & {
  training_module_axes: T['training_module_axes']['Row'][]
  training_module_sections: T['training_module_sections']['Row'][]
}
type CaseRow = T['training_cases']['Row'] & {
  training_case_messages: T['training_case_messages']['Row'][]
  training_case_arena_slots: T['training_case_arena_slots']['Row'][]
  training_case_boss_fans: T['training_case_boss_fans']['Row'][]
}

/**
 * Catalogue COMPLET pour l'admin : tout (actif ou non), ordonné par position, en deux requêtes
 * (modules + axes + sections ; cas + messages + créneaux + fans) regroupées en mémoire. Table
 * de RÉFÉRENCE (~90 cas, ~230 messages), pas une table de faits journaliers : un `select`
 * simple suffit — `fetchAll` (guidelines-data-loading §2) ne s'impose qu'aux faits qui
 * dépassent le plafond PostgREST de 1000 lignes. RLS : lecture = droit de face `formation` / admin.
 */
export async function getCatalog(): Promise<CatalogData> {
  const supabase = await createClient()
  const [mods, cases] = await Promise.all([
    supabase.from('training_modules').select('*, training_module_axes(*), training_module_sections(*)').order('position'),
    // `!case_id` : training_case_arena_slots a DEUX FK vers training_cases (case_id, ref_case_id) —
    // sans l'indice, PostgREST refuse l'embed (PGRST201, relation ambiguë). Les enfants sont triés
    // en JS (`byPosition`) plutôt que par `.order(…, { referencedTable })` : moins de surface.
    supabase
      .from('training_cases')
      .select('*, training_case_messages(*), training_case_arena_slots!case_id(*), training_case_boss_fans(*)')
      .order('position'),
  ])
  if (mods.error) throw new Error(mods.error.message)
  if (cases.error) throw new Error(cases.error.message)

  const byModule = new Map<string, CatalogCase[]>()
  for (const c of (cases.data ?? []) as CaseRow[]) {
    const row = toCase(c)
    const list = byModule.get(row.moduleId) ?? []
    list.push(row)
    byModule.set(row.moduleId, list)
  }
  return { modules: ((mods.data ?? []) as ModuleRow[]).map((m) => toModule(m, byModule.get(m.id) ?? [])) }
}

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position)

function toModule(m: ModuleRow, cases: CatalogCase[]): CatalogModule {
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    objectiveLabel: m.objective_label,
    courseMd: m.course_md,
    scoringNotes: m.scoring_notes,
    position: m.position,
    active: m.active,
    axes: byPosition(m.training_module_axes).map((a) => ({ id: a.id, key: a.key, name: a.name, description: a.description, position: a.position })),
    sections: byPosition(m.training_module_sections).map((s) => ({
      id: s.id, code: s.code, title: s.title, emoji: s.emoji, description: s.description, position: s.position,
    })),
    cases,
  }
}

function toCase(c: CaseRow): CatalogCase {
  return {
    id: c.id,
    moduleId: c.module_id,
    sectionId: c.section_id,
    code: c.code,
    kind: c.kind as CaseKind,
    title: c.title,
    phase: c.phase,
    difficulty: c.difficulty,
    maxTurns: c.max_turns,
    reactionMaxS: c.reaction_max_s,
    isSale: c.is_sale,
    context: c.context,
    objective: c.objective,
    targetLine: c.target_line,
    fanName: c.fan_name,
    fanBrief: c.fan_brief,
    expected: c.expected,
    position: c.position,
    active: c.active,
    messages: byPosition(c.training_case_messages).map((m) => ({ id: m.id, position: m.position, speaker: m.speaker as Speaker, body: m.body })),
    arenaSlots: byPosition(c.training_case_arena_slots).map((s) => ({ id: s.id, position: s.position, refCaseId: s.ref_case_id, displayName: s.display_name })),
    bossFans: byPosition(c.training_case_boss_fans).map((f) => ({
      id: f.id, position: f.position, code: f.code, name: f.name, age: f.age, job: f.job, city: f.city, color: f.color,
      persona: f.persona, openingMessage: f.opening_message, budgetCap: f.budget_cap, negoThreshold: f.nego_threshold,
      negoWhere: f.nego_where, meetWhen: f.meet_when, meetWhere: f.meet_where, derails: f.derails,
    })),
  }
}
```
(Les casts `as ModuleRow[]` / `as CaseRow[]` : le type inféré par supabase-js pour un embed `(*)` est structurellement identique ; si TS l'accepte sans cast, retirer les casts.)

- [ ] **Step 2: `components/catalog-skeleton.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette du Catalogue : colonne modules (7 lignes) + panneau (en-tête + table). Partagée par
 *  `loading.tsx` et le fallback `<Suspense>` de la page (guidelines §2.4). */
export function CatalogSkeleton() {
  return (
    <div role="status" className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none border-t" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `components/modules-list.tsx`** (client)

```tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { moveModule } from '../actions'
import type { CatalogModule } from '../types'

/**
 * Colonne des modules : lien `?module=<code>` (état partageable, guidelines §6), ordre ↑↓,
 * badge inactif, compteur de cas. `onCreate` ouvre le dialog « Nouveau module » (Task 8).
 */
export function ModulesList({
  modules,
  selectedId,
  onCreate,
}: {
  modules: CatalogModule[]
  selectedId: string | null
  onCreate?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const move = (id: string, direction: 'up' | 'down') =>
    startTransition(async () => {
      const res = await moveModule({ id, direction })
      if (!res.success) toast.error(res.error)
    })

  return (
    <nav aria-label="Modules" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {modules.map((m, i) => (
          <li
            key={m.id}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm',
              m.id === selectedId && 'border-primary/50 bg-primary/5',
            )}
          >
            <Link
              href={{ pathname: '/formation/catalogue', query: { module: m.code } }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span aria-hidden className="w-5 shrink-0 text-center">{m.emoji ?? '·'}</span>
              <span className={cn('truncate', !m.active && 'text-muted-foreground line-through')}>{m.title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{m.cases.length}</span>
              {!m.active && <Badge variant="outline">inactif</Badge>}
            </Link>
            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Monter ${m.title}`}
              disabled={pending || i === 0} onClick={() => move(m.id, 'up')}>
              <ArrowUp className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Descendre ${m.title}`}
              disabled={pending || i === modules.length - 1} onClick={() => move(m.id, 'down')}>
              <ArrowDown className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      {onCreate && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onCreate}>
          <Plus className="size-4" /> Nouveau module
        </Button>
      )}
    </nav>
  )
}
```

- [ ] **Step 4: `components/cases-table.tsx`** (client)

```tsx
'use client'

import { useTransition } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import { cn } from '@/lib/utils'
import { duplicateCase, moveCase, toggleCase } from '../actions'
import type { CatalogCase, CatalogModule } from '../types'

/**
 * Cas du module sélectionné, triés par `position` (défaut du seed : ordre GLA ≈ difficulté).
 * Actions par ligne : Éditer (dialog, Task 9), Dupliquer (copie inactive en fin de module),
 * Activer/Désactiver, ↑↓. Un solo joué dans un défi refuse la désactivation (message de l'action).
 */
export function CasesTable({ module, onEdit }: { module: CatalogModule; onEdit?: (c: CatalogCase) => void }) {
  const [pending, startTransition] = useTransition()
  const sectionTitle = new Map(module.sections.map((s) => [s.id, s.title]))
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.success) toast.error(res.error ?? 'Erreur')
      else if (ok) toast.success(ok)
    })

  if (module.cases.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun cas dans ce module.</p>
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Sorte</TableHead>
            <TableHead className="w-12 text-center">Diff.</TableHead>
            <TableHead>Titre</TableHead>
            <TableHead>Phase</TableHead>
            <TableHead>Section</TableHead>
            <TableHead className="w-14 text-center">Vente</TableHead>
            <TableHead className="w-16 text-center">Tours</TableHead>
            <TableHead className="w-44 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {module.cases.map((c, i) => (
            <TableRow key={c.id} className={cn(!c.active && 'text-muted-foreground')}>
              <TableCell className="tabular-nums">{i + 1}</TableCell>
              <TableCell>
                <Badge variant={c.kind === 'solo' ? 'outline' : 'secondary'}>{CASE_KIND_LABELS[c.kind]}</Badge>
              </TableCell>
              <TableCell className="text-center tabular-nums">{c.difficulty}</TableCell>
              <TableCell className={cn('font-medium', !c.active && 'line-through')}>
                {c.title}
                {!c.active && <span className="ml-2 text-xs font-normal">(inactif)</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.phase || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{c.sectionId ? (sectionTitle.get(c.sectionId) ?? '—') : '—'}</TableCell>
              <TableCell className="text-center">{c.isSale ? '✓' : ''}</TableCell>
              <TableCell className="text-center tabular-nums">{c.maxTurns}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-0.5">
                  {onEdit && (
                    <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Éditer ${c.title}`} onClick={() => onEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Dupliquer ${c.title}`} disabled={pending}
                    onClick={() => run(() => duplicateCase({ id: c.id }), 'Cas dupliqué (inactif, en fin de module)')}>
                    <Copy className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={c.active ? `Désactiver ${c.title}` : `Activer ${c.title}`} disabled={pending}
                    onClick={() => run(() => toggleCase({ id: c.id, active: !c.active }))}>
                    {c.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Monter" disabled={pending || i === 0}
                    onClick={() => run(() => moveCase({ id: c.id, direction: 'up' }))}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Descendre" disabled={pending || i === module.cases.length - 1}
                    onClick={() => run(() => moveCase({ id: c.id, direction: 'down' }))}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 5: `components/module-panel.tsx`** (client)

```tsx
'use client'

import { useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleModule } from '../actions'
import { CasesTable } from './cases-table'
import type { CatalogCase, CatalogModule } from '../types'

/**
 * Panneau du module sélectionné : en-tête (emoji, titre, description, n axes / n sections),
 * Éditer (dialog, Task 8), Activer/Désactiver, Nouveau cas (dialog, Task 9), puis la table des cas.
 */
export function ModulePanel({
  module,
  onEdit,
  onCreateCase,
  onEditCase,
}: {
  module: CatalogModule
  onEdit?: () => void
  onCreateCase?: () => void
  onEditCase?: (c: CatalogCase) => void
}) {
  const [pending, startTransition] = useTransition()
  const toggle = () =>
    startTransition(async () => {
      const res = await toggleModule({ id: module.id, active: !module.active })
      if (!res.success) toast.error(res.error)
    })

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {module.emoji && <span aria-hidden>{module.emoji}</span>}
            <span className="truncate">{module.title}</span>
            {!module.active && <Badge variant="outline">inactif</Badge>}
          </h2>
          {module.description && <p className="text-sm text-muted-foreground">{module.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {module.axes.length === 0 ? 'Aucun axe de notation' : `${module.axes.length} axe${module.axes.length > 1 ? 's' : ''} de notation`}
            {' · '}
            {module.sections.length} section{module.sections.length > 1 ? 's' : ''}
            {' · '}
            {module.courseMd ? 'cours rédigé' : 'pas de cours'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>Éditer le module</Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
            {module.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {module.active ? 'Désactiver' : 'Activer'}
          </Button>
          {onCreateCase && (
            <Button type="button" size="sm" onClick={onCreateCase}>Nouveau cas</Button>
          )}
        </div>
      </div>
      <CasesTable module={module} onEdit={onEditCase} />
    </section>
  )
}
```

- [ ] **Step 6: `CatalogTemplate.tsx`** (RSC)

```tsx
import { ModulesList } from './components/modules-list'
import { ModulePanel } from './components/module-panel'
import type { CatalogData } from './types'

/**
 * Template Catalogue (admin) — Server Component, aucun fetch. Deux colonnes : modules à gauche,
 * module sélectionné à droite (en-tête + table des cas). Le module affiché vient de
 * `?module=<code>` ; défaut = 1ᵉʳ module. Les dialogs (module / cas) sont montés par la feuille
 * cliente `CatalogView` à partir de la Task 8 — jusque-là ce Template compose directement.
 */
export function CatalogTemplate({ data, selectedCode }: { data: CatalogData; selectedCode: string | null }) {
  const selected = data.modules.find((m) => m.code === selectedCode) ?? data.modules[0] ?? null
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Modules, cours et cas d’entraînement — ce que les chatters retrouvent dans Modules.
      </p>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
        <ModulesList modules={data.modules} selectedId={selected?.id ?? null} />
        {selected ? (
          <ModulePanel module={selected} />
        ) : (
          <p className="text-sm text-muted-foreground">Aucun module — crée le premier.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Route + loading**

`apps/web/src/app/(dash)/formation/catalogue/page.tsx` :
```tsx
import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth'
import { getCatalog } from '@/features/training-catalog/services/get-catalog'
import { CatalogTemplate } from '@/features/training-catalog/CatalogTemplate'
import { CatalogSkeleton } from '@/features/training-catalog/components/catalog-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { CatalogData } from '@/features/training-catalog/types'

/** Catalogue de formation (ADMIN — item adminOnly, comme Membres) : `?module=<code>` = module affiché. */
export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const [, { module }] = await Promise.all([requireAdmin(), searchParams])
  // Kickoff SANS await : le h1 s'affiche immédiatement, le catalogue streame dans son boundary.
  const data = getCatalog()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Catalogue</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <CatalogSkeleton />
          </SectionFallback>
        }
      >
        <CatalogContent data={data} selectedCode={module ?? null} />
      </Suspense>
    </div>
  )
}

async function CatalogContent({ data, selectedCode }: { data: Promise<CatalogData>; selectedCode: string | null }) {
  return <CatalogTemplate data={await data} selectedCode={selectedCode} />
}
```

`apps/web/src/app/(dash)/formation/catalogue/loading.tsx` :
```tsx
import { RouteLoading } from '@/components/skeletons/route-loading'
import { CatalogSkeleton } from '@/features/training-catalog/components/catalog-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-40">
      <CatalogSkeleton />
    </RouteLoading>
  )
}
```

- [ ] **Step 8: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Puis `pnpm dev` (env UAT) → `/formation/catalogue` en admin : 7 modules à gauche (Setting sélectionné), table des 23 cas de Setting (22 solos + 1 défi), `?module=boss` → 1 cas « Boss final ». Tester ↑↓ sur un module et un cas (l'ordre change, toast d'erreur en bout de liste), Désactiver/Activer un cas, Dupliquer un cas (copie inactive en bas), désactiver un solo référencé par le défi (`set_kyc_1`… : vérifier via `?module=setting` lequel est dans le défi — l'action refuse avec le titre du défi). « En tant que » un membre `frm-suivi` : `/formation/catalogue` redirige (adminOnly).

- [ ] **Step 9: Commit** (demander) — `feat(formation): page Catalogue — modules, table des cas, ordre / activation / duplication`

---

### Task 8: `training-catalog` — dialog Module (identité, cours + aperçu, axes, sections) + feuille cliente `CatalogView`

**Files:**
- Create: `apps/web/src/features/training-catalog/components/field-error.tsx`
- Create: `apps/web/src/features/training-catalog/components/module-dialog.tsx`
- Create: `apps/web/src/features/training-catalog/components/module-form-axes.tsx`
- Create: `apps/web/src/features/training-catalog/components/module-form-sections.tsx`
- Create: `apps/web/src/features/training-catalog/components/module-form-course.tsx`
- Create: `apps/web/src/features/training-catalog/components/catalog-view.tsx`
- Modify: `apps/web/src/features/training-catalog/CatalogTemplate.tsx` (compose `CatalogView`)

**Interfaces:**
- Produces: `<FieldError message? id? />` ; `<ModuleDialog open module onClose onCreated(code) />` ; `<CatalogView modules selected />`.
- Consumes: `saveModule` (Task 6), `moduleForm`/`ModuleFormValues`/`ModuleInput` (Task 6), `MarkdownView` (Task 5), `ModulesList`/`ModulePanel` (Task 7 — props `onCreate`, `onEdit`).

- [ ] **Step 1: `components/field-error.tsx`**

```tsx
/** Message d'erreur de champ (RHF) — même rendu que les dialogs Membres / Scripts. */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
```

- [ ] **Step 2: `components/module-form-axes.tsx`**

```tsx
'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ModuleFormValues, ModuleInput } from '../schema'
import { FieldError } from './field-error'

/**
 * Axes du barème (`useFieldArray` sur `axes`) : clé technique (ce que l'IA renvoie), nom (ce que
 * le chatter lit), description (la question posée à l'IA). Aucun minimum : le Boss final n'a pas
 * d'axe (noté par étape). Supprimer un axe est autorisé (les sessions futures garderont leur
 * instantané). `existingId` (null = nouvel axe, diff côté action) voyage dans les valeurs RHF sans
 * input DOM — pas de champ `id` : `useFieldArray` réserve cette clé pour sa propre `key`.
 */
export function ModuleFormAxes({
  control,
  register,
  errors,
  disabled,
}: {
  control: Control<ModuleFormValues, unknown, ModuleInput>
  register: UseFormRegister<ModuleFormValues>
  errors: FieldErrors<ModuleFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'axes' })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Axes de notation</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ existingId: null, key: '', name: '', description: '' })}>
          <Plus className="size-4" /> Ajouter un axe
        </Button>
      </div>
      <FieldError message={errors.axes?.message ?? errors.axes?.root?.message} />
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun axe — le module ne sera pas notable par axe.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`axe-${i}-key`} className="text-xs">Clé</Label>
                  <Input id={`axe-${i}-key`} placeholder="naturel" disabled={disabled} aria-invalid={!!errors.axes?.[i]?.key} {...register(`axes.${i}.key`)} />
                  <FieldError message={errors.axes?.[i]?.key?.message} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`axe-${i}-name`} className="text-xs">Nom affiché</Label>
                  <Input id={`axe-${i}-name`} placeholder="Naturel / fluidité" disabled={disabled} aria-invalid={!!errors.axes?.[i]?.name} {...register(`axes.${i}.name`)} />
                  <FieldError message={errors.axes?.[i]?.name?.message} />
                </div>
                <div className="flex items-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Supprimer l’axe" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`axe-${i}-desc`} className="text-xs">Description (la question posée à l’IA)</Label>
                <Textarea id={`axe-${i}-desc`} rows={2} disabled={disabled} aria-invalid={!!errors.axes?.[i]?.description} {...register(`axes.${i}.description`)} />
                <FieldError message={errors.axes?.[i]?.description?.message} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `components/module-form-sections.tsx`**

```tsx
'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ModuleFormValues, ModuleInput } from '../schema'
import { FieldError } from './field-error'

/**
 * Sections du module (`useFieldArray` sur `sections`) — un regroupement des cas (GLA
 * sous_categories), pas un niveau de navigation. `existingId` (null = nouvelle section, son
 * `code` est généré du titre côté action) voyage dans les valeurs RHF sans input DOM. Supprimer une section ne supprime pas ses cas : ils
 * redeviennent « sans section » (FK on delete set null).
 */
export function ModuleFormSections({
  control,
  register,
  errors,
  disabled,
}: {
  control: Control<ModuleFormValues, unknown, ModuleInput>
  register: UseFormRegister<ModuleFormValues>
  errors: FieldErrors<ModuleFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'sections' })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>Sections</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ existingId: null, title: '', emoji: '', description: '' })}>
          <Plus className="size-4" /> Ajouter une section
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Regroupent les cas dans la page du module. Supprimer une section ne supprime pas ses cas : ils redeviennent « sans section ».
      </p>
      <FieldError message={errors.sections?.message ?? errors.sections?.root?.message} />
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune section — les cas sont listés à plat.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[3rem_1fr_auto]">
                <div className="grid gap-1">
                  <Label htmlFor={`sec-${i}-emoji`} className="text-xs">Emoji</Label>
                  <Input id={`sec-${i}-emoji`} placeholder="📇" disabled={disabled} aria-invalid={!!errors.sections?.[i]?.emoji} {...register(`sections.${i}.emoji`)} />
                  <FieldError message={errors.sections?.[i]?.emoji?.message} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`sec-${i}-title`} className="text-xs">Titre</Label>
                  <Input id={`sec-${i}-title`} placeholder="Extraction d’info (KYC)" disabled={disabled} aria-invalid={!!errors.sections?.[i]?.title} {...register(`sections.${i}.title`)} />
                  <FieldError message={errors.sections?.[i]?.title?.message} />
                </div>
                <div className="flex items-end gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Supprimer la section" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`sec-${i}-desc`} className="text-xs">Description (une phrase)</Label>
                <Textarea id={`sec-${i}-desc`} rows={2} disabled={disabled} {...register(`sections.${i}.description`)} />
                <FieldError message={errors.sections?.[i]?.description?.message} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `components/module-form-course.tsx`**

```tsx
'use client'

import { useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownView } from '@/components/markdown-view'
import type { ModuleFormValues, ModuleInput } from '../schema'

/** Cours du module : Textarea Markdown + onglet Aperçu (même rendu que la page Modules). */
export function ModuleFormCourse({
  control,
  register,
  disabled,
}: {
  control: Control<ModuleFormValues, unknown, ModuleInput>
  register: UseFormRegister<ModuleFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const courseMd = useWatch({ control, name: 'courseMd' }) ?? ''
  return (
    <Tabs defaultValue="write" className="flex flex-col gap-3">
      <TabsList className="self-start">
        <TabsTrigger value="write">Écrire</TabsTrigger>
        <TabsTrigger value="preview">Aperçu</TabsTrigger>
      </TabsList>
      {/* forceMount : le Textarea reste monté sous l'onglet Aperçu (RHF garde la valeur de toute
          façon, mais un démontage/remontage perd le curseur et le scroll). */}
      <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
        <Textarea
          rows={22}
          className="font-mono text-xs"
          placeholder={'## Pourquoi le Setting\n\nLe Setting, c’est **tout ce qui se passe avant** le premier média payant…\n\n- point 1\n- point 2\n\n| Ce qu’il dit | Ce qu’il faut faire |\n| --- | --- |\n| c’est trop cher | remonter la valeur |'}
          disabled={disabled}
          {...register('courseMd')}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Markdown : `## Titre`, `**gras**`, `*italique*`, listes `-` / `1.`, tableaux `| a | b |`. Un retour à la ligne = un saut de ligne.
        </p>
      </TabsContent>
      <TabsContent value="preview">
        {courseMd.trim() ? (
          <div className="max-h-[50vh] overflow-y-auto rounded-md border p-4">
            <MarkdownView source={courseMd} className="max-w-prose" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Rien à afficher — le cours est vide.</p>
        )}
      </TabsContent>
    </Tabs>
  )
}
```

- [ ] **Step 5: `components/module-dialog.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { saveModule } from '../actions'
import { moduleForm, type ModuleFormValues, type ModuleInput } from '../schema'
import type { CatalogModule } from '../types'
import { FieldError } from './field-error'
import { ModuleFormAxes } from './module-form-axes'
import { ModuleFormCourse } from './module-form-course'
import { ModuleFormSections } from './module-form-sections'

const emptyModule: ModuleFormValues = {
  id: null, title: '', emoji: '', description: '', objectiveLabel: 'Objectif', courseMd: '', scoringNotes: '', axes: [], sections: [],
}
const toForm = (m: CatalogModule): ModuleFormValues => ({
  id: m.id,
  title: m.title,
  emoji: m.emoji ?? '',
  description: m.description ?? '',
  objectiveLabel: m.objectiveLabel,
  courseMd: m.courseMd ?? '',
  scoringNotes: m.scoringNotes ?? '',
  axes: m.axes.map((a) => ({ existingId: a.id, key: a.key, name: a.name, description: a.description })),
  sections: m.sections.map((s) => ({ existingId: s.id, title: s.title, emoji: s.emoji ?? '', description: s.description ?? '' })),
})

/**
 * Dialog Nouveau / Modifier module (RHF + Zod partagé avec `saveModule`). Quatre onglets dans UN
 * seul <form> : Général (identité, libellé objectif, consigne de notation), Cours (Markdown +
 * aperçu), Axes, Sections. Un onglet dont un champ est en erreur porte un « • » rouge. Reset à
 * chaque OUVERTURE (piège des dialogs, guidelines §5). Le `code` n'est pas saisi (généré).
 */
export function ModuleDialog({
  open,
  module,
  onClose,
  onCreated,
}: {
  open: boolean
  /** null = création. */
  module: CatalogModule | null
  onClose: () => void
  /** Après création : le parent navigue sur `?module=<code>`. */
  onCreated: (code: string) => void
}) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModuleFormValues, unknown, ModuleInput>({
    resolver: zodResolver(moduleForm),
    defaultValues: module ? toForm(module) : emptyModule,
  })
  useEffect(() => {
    if (open) reset(module ? toForm(module) : emptyModule)
  }, [open, module, reset])

  const submit = handleSubmit(async (values) => {
    const res = await saveModule(values)
    if (!res.success) {
      // fieldErrors serveur (ex. clé d'axe en double) → champ si affichable, sinon global.
      for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
        if (field === 'axes' && messages?.[0]) setError('axes', { message: messages[0] })
      }
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(module ? 'Module modifié' : 'Module créé')
    onClose()
    if (!module) onCreated(res.data.code)
  })

  const dot = (bad: boolean) => (bad ? <span aria-hidden className="ml-1 text-red-600">•</span> : null)
  const generalBad = !!(errors.title || errors.emoji || errors.description || errors.objectiveLabel || errors.scoringNotes)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{module ? `Modifier ${module.title}` : 'Nouveau module'}</DialogTitle>
          <DialogDescription>
            Un module = un cours + des cas d’entraînement notés sur ses axes. {module ? '' : 'Ajouté en fin de liste (réordonnable ensuite), sans cas — ajoute-les depuis le panneau.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Tabs defaultValue="general" className="flex flex-col gap-4">
            <TabsList className="self-start">
              <TabsTrigger value="general">Général{dot(generalBad)}</TabsTrigger>
              <TabsTrigger value="course">Cours{dot(!!errors.courseMd)}</TabsTrigger>
              <TabsTrigger value="axes">Axes{dot(!!errors.axes)}</TabsTrigger>
              <TabsTrigger value="sections">Sections{dot(!!errors.sections)}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-[4rem_1fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="mod-emoji">Emoji</Label>
                  <Input id="mod-emoji" placeholder="🧲" disabled={isSubmitting} {...register('emoji')} />
                  <FieldError message={errors.emoji?.message} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mod-title">Titre</Label>
                  <Input id="mod-title" placeholder="Setting & Qualification" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
                  <FieldError message={errors.title?.message} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-desc">Description (une phrase, sur la carte du module)</Label>
                <Textarea id="mod-desc" rows={2} disabled={isSubmitting} {...register('description')} />
                <FieldError message={errors.description?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-obj">Libellé du champ « objectif » des cas</Label>
                <Input id="mod-obj" placeholder="Ce que tu dois obtenir" disabled={isSubmitting} aria-invalid={!!errors.objectiveLabel} {...register('objectiveLabel')} />
                <p className="text-xs text-muted-foreground">Ex. « Ce que tu dois obtenir », « Étape de script à amener », « Ta relance ».</p>
                <FieldError message={errors.objectiveLabel?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-scoring">Consigne de notation (transmise à l’IA)</Label>
                <Textarea id="mod-scoring" rows={6} disabled={isSubmitting} {...register('scoringNotes')} />
                <p className="text-xs text-muted-foreground">Pilote l’IA qui note — jamais montrée au chatter.</p>
                <FieldError message={errors.scoringNotes?.message} />
              </div>
            </TabsContent>

            <TabsContent value="course">
              <ModuleFormCourse control={control} register={register} disabled={isSubmitting} />
              <FieldError message={errors.courseMd?.message} />
            </TabsContent>

            <TabsContent value="axes">
              <ModuleFormAxes control={control} register={register} errors={errors} disabled={isSubmitting} />
            </TabsContent>

            <TabsContent value="sections">
              <ModuleFormSections control={control} register={register} errors={errors} disabled={isSubmitting} />
            </TabsContent>
          </Tabs>

          {errors.root && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
            <ActionButton type="submit" pending={isSubmitting}>{module ? 'Enregistrer' : 'Créer le module'}</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```
`ModuleFormSections` prend les mêmes props que `ModuleFormAxes` (`control`, `register`, `errors`, `disabled`).

- [ ] **Step 6: `components/catalog-view.tsx` + Template**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { ModulesList } from './modules-list'
import { ModulePanel } from './module-panel'
import { ModuleDialog } from './module-dialog'
import type { CatalogModule } from '../types'

/**
 * Feuille cliente du Catalogue : porte l'état des dialogs (module en cours d'édition — et cas,
 * Task 9). Le Template reste un Server Component (guidelines-data-loading §3).
 */
export function CatalogView({ modules, selected }: { modules: CatalogModule[]; selected: CatalogModule | null }) {
  const router = useRouter()
  const [moduleDialog, setModuleDialog] = useState<{ open: boolean; module: CatalogModule | null }>({ open: false, module: null })

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
      <ModulesList
        modules={modules}
        selectedId={selected?.id ?? null}
        onCreate={() => setModuleDialog({ open: true, module: null })}
      />
      {selected ? (
        <ModulePanel module={selected} onEdit={() => setModuleDialog({ open: true, module: selected })} />
      ) : (
        <p className="text-sm text-muted-foreground">Aucun module — crée le premier.</p>
      )}
      <ModuleDialog
        open={moduleDialog.open}
        module={moduleDialog.module}
        onClose={() => setModuleDialog((d) => ({ ...d, open: false }))}
        // Route construite dynamiquement → cast Route (typedRoutes), comme members-tabs.tsx.
        onCreated={(code) => router.replace(`/formation/catalogue?module=${code}` as Route)}
      />
    </div>
  )
}
```

`CatalogTemplate.tsx` : remplacer le `<div className="grid …">…</div>` par `<CatalogView modules={data.modules} selected={selected} />` (import `./components/catalog-view`, retirer les imports `ModulesList`/`ModulePanel` devenus inutiles ; mettre à jour le commentaire d'en-tête : « la feuille cliente `CatalogView` porte les dialogs »).

- [ ] **Step 7: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Manuel (UAT) : « Nouveau module » → créer « Test plan » avec 1 axe (clé `test`, nom, description) et 1 section → toast, URL passe sur `?module=test_plan`, module en bas de liste. Éditer Setting → onglet Cours : l'aperçu rend titres/gras/table ; modifier un mot, Enregistrer → `/formation/modules/setting` (Task 10) le montrera. Ajouter un axe de clé déjà prise → erreur sous la liste des axes. Supprimer la section de test → Enregistrer OK. Désactiver le module « Test plan » (reste visible dans le Catalogue, badge inactif).

- [ ] **Step 8: Commit** (demander) — `feat(formation): catalogue — dialog module (identité, cours Markdown + aperçu, axes, sections)`

---

### Task 9: `training-catalog` — dialog Cas (3 sortes : solo / défi simultané / boss final)

**Files:**
- Create: `apps/web/src/features/training-catalog/components/case-dialog.tsx`
- Create: `apps/web/src/features/training-catalog/components/case-form-solo.tsx`
- Create: `apps/web/src/features/training-catalog/components/case-form-arena.tsx`
- Create: `apps/web/src/features/training-catalog/components/case-form-boss.tsx`
- Modify: `apps/web/src/features/training-catalog/components/catalog-view.tsx` (état du dialog cas + props `onCreateCase`/`onEditCase`)

**Interfaces:**
- Produces: `<CaseDialog open module caseItem onClose />` ; sous-forms `CaseFormSolo` / `CaseFormArena` / `CaseFormBoss` — props `{ control, register, errors, disabled }` typés `Control<CaseFormValues, unknown, CaseInput>` (+ `soloOptions: ComboOption[]` pour l'arène).
- Consumes: `saveCase`, `caseForm`/`CaseFormValues`/`CaseInput`, `CASE_KINDS`/`CASE_KIND_LABELS`/`SPEAKERS`/`SPEAKER_LABELS`, `Combobox`/`ComboOption` (`@/components/ui/combobox`), `Checkbox`, `Select*`, `FieldError`.

- [ ] **Step 1: `components/case-form-solo.tsx`** — *Le fan* · *Ouverture* (messages, field array) · *Après coup*

```tsx
'use client'

import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SPEAKERS, SPEAKER_LABELS } from '@/lib/types/training'
import type { CaseFormValues, CaseInput } from '../schema'
import { FieldError } from './field-error'

export type CaseFormProps = {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
}

/** Partie SOLO du dialog cas : le fan (IA), les messages d'ouverture, l'attendu (révélé après). */
export function CaseFormSolo({ control, register, errors, disabled }: CaseFormProps) {
  'use no memo'
  const { fields, append, remove, swap } = useFieldArray({ control, name: 'messages' })
  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Le fan</legend>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="case-fan-name">Prénom du fan</Label>
            <Input id="case-fan-name" placeholder="Tony" disabled={disabled} aria-invalid={!!errors.fanName} {...register('fanName')} />
            <FieldError message={errors.fanName?.message} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="case-fan-brief">Consigne du fan (pour l’IA)</Label>
          <Textarea id="case-fan-brief" rows={5} disabled={disabled} aria-invalid={!!errors.fanBrief} {...register('fanBrief')} />
          <p className="text-xs text-muted-foreground">Pilote l’IA qui joue le fan — jamais montrée au chatter.</p>
          <FieldError message={errors.fanBrief?.message} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Ouverture — la conversation déjà entamée</legend>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ speaker: 'fan', body: '' })}>
            <Plus className="size-4" /> Ajouter un message
          </Button>
        </div>
        <FieldError message={errors.messages?.message ?? errors.messages?.root?.message} />
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun message : le chatter démarre la conversation.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <li key={f.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[8rem_1fr_auto]">
                <Controller
                  name={`messages.${i}.speaker`}
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger aria-label="Qui parle"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SPEAKERS.map((s) => <SelectItem key={s} value={s}>{SPEAKER_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <div className="grid gap-1">
                  <Textarea rows={2} placeholder="Texte du message…" disabled={disabled} aria-invalid={!!errors.messages?.[i]?.body} {...register(`messages.${i}.body`)} />
                  <FieldError message={errors.messages?.[i]?.body?.message} />
                </div>
                <div className="flex items-start gap-0.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Monter" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><ArrowUp className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descendre" disabled={disabled || i === fields.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown className="size-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Retirer le message" disabled={disabled} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Après coup</legend>
        <Label htmlFor="case-expected">Ce qui était attendu</Label>
        <Textarea id="case-expected" rows={4} disabled={disabled} aria-invalid={!!errors.expected} {...register('expected')} />
        <p className="text-xs text-muted-foreground">Révélé au chatter APRÈS la session, avec sa note.</p>
        <FieldError message={errors.expected?.message} />
      </fieldset>
    </>
  )
}
```

- [ ] **Step 2: `components/case-form-arena.tsx`** — *Chrono* + *5 conversations*

```tsx
'use client'

import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CaseFormValues, CaseInput } from '../schema'
import { FieldError } from './field-error'

/**
 * Partie DÉFI SIMULTANÉ : délai de réponse max + exactement 5 conversations (chacune rejoue un
 * cas SOLO du module sous un autre prénom). Les 5 lignes sont toujours affichées (le parent
 * garantit `slots.length === 5` au passage en défi).
 */
export function CaseFormArena({
  control,
  register,
  errors,
  disabled,
  soloOptions,
}: {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
  /** Cas solo du module (value = id, label = titre). */
  soloOptions: ComboOption[]
}) {
  'use no memo'
  const { fields } = useFieldArray({ control, name: 'slots' })
  return (
    <>
      <fieldset className="grid gap-1.5 sm:max-w-xs">
        <legend className="text-sm font-medium">Chrono</legend>
        <Label htmlFor="case-reaction">Délai de réponse max (secondes)</Label>
        <Input id="case-reaction" type="number" min={10} max={600} disabled={disabled} aria-invalid={!!errors.reactionMaxS} {...register('reactionMaxS')} />
        <p className="text-xs text-muted-foreground">Au-delà, la conversation est perdue (GLA : 120 s).</p>
        <FieldError message={errors.reactionMaxS?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Les 5 conversations</legend>
        <FieldError message={errors.slots?.message ?? errors.slots?.root?.message} />
        <ul className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <li key={f.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[2rem_1fr_10rem]">
              <span className="pt-2 text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
              <div className="grid gap-1">
                <Controller
                  name={`slots.${i}.refCaseId`}
                  control={control}
                  render={({ field }) => (
                    <Combobox
                      options={soloOptions}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Cas solo rejoué…"
                      searchPlaceholder="Rechercher un cas…"
                      disabled={disabled}
                      aria-invalid={!!errors.slots?.[i]?.refCaseId}
                    />
                  )}
                />
                <FieldError message={errors.slots?.[i]?.refCaseId?.message} />
              </div>
              <div className="grid gap-1">
                <Input placeholder="Prénom affiché" disabled={disabled} aria-invalid={!!errors.slots?.[i]?.displayName} {...register(`slots.${i}.displayName`)} />
                <FieldError message={errors.slots?.[i]?.displayName?.message} />
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  )
}
```

- [ ] **Step 3: `components/case-form-boss.tsx`** — *Chrono* + *Fans* (visibles / ouverture / cachés)

```tsx
'use client'

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CaseFormValues, CaseInput } from '../schema'
import { FieldError } from './field-error'

export const emptyFan = (): CaseFormValues['fans'][number] => ({
  name: '', age: '', job: '', city: '', color: '', persona: '', openingMessage: '',
  budgetCap: '', negoThreshold: '', negoWhere: '', meetWhen: '', meetWhere: '', derails: '',
})

/**
 * Partie BOSS FINAL : chrono + 1 à 5 fans riches. Par fan : bloc VISIBLE (prénom, âge, métier,
 * ville, couleur d'onglet, caractère), son message d'ouverture, puis le bloc CACHÉ (plafond de
 * dépense, palier/mode de négo, moment/formulation de la demande de rencontre, déraillements) —
 * un texte d'aide rappelle qu'il pilote l'IA et n'est jamais montré.
 */
export function CaseFormBoss({
  control,
  register,
  errors,
  disabled,
}: {
  control: Control<CaseFormValues, unknown, CaseInput>
  register: UseFormRegister<CaseFormValues>
  errors: FieldErrors<CaseFormValues>
  disabled?: boolean
}) {
  'use no memo'
  const { fields, append, remove } = useFieldArray({ control, name: 'fans' })
  const err = (i: number, k: keyof ReturnType<typeof emptyFan>) => errors.fans?.[i]?.[k]?.message as string | undefined
  return (
    <>
      <fieldset className="grid gap-1.5 sm:max-w-xs">
        <legend className="text-sm font-medium">Chrono</legend>
        <Label htmlFor="case-reaction">Délai de réponse max (secondes)</Label>
        <Input id="case-reaction" type="number" min={10} max={600} disabled={disabled} aria-invalid={!!errors.reactionMaxS} {...register('reactionMaxS')} />
        <FieldError message={errors.reactionMaxS?.message} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Les fans ({fields.length}/5)</legend>
          <Button type="button" variant="outline" size="sm" disabled={disabled || fields.length >= 5} onClick={() => append(emptyFan())}>
            <Plus className="size-4" /> Ajouter un fan
          </Button>
        </div>
        <FieldError message={errors.fans?.message ?? errors.fans?.root?.message} />
        <ul className="flex flex-col gap-4">
          {fields.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Fan {i + 1}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Retirer ce fan" disabled={disabled || fields.length <= 1} onClick={() => remove(i)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Visible du chatter</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="grid gap-1"><Label className="text-xs">Prénom</Label><Input disabled={disabled} aria-invalid={!!err(i, 'name')} {...register(`fans.${i}.name`)} /><FieldError message={err(i, 'name')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Âge</Label><Input type="number" min={18} max={99} disabled={disabled} {...register(`fans.${i}.age`)} /><FieldError message={err(i, 'age')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Métier</Label><Input disabled={disabled} {...register(`fans.${i}.job`)} /><FieldError message={err(i, 'job')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Ville</Label><Input disabled={disabled} {...register(`fans.${i}.city`)} /><FieldError message={err(i, 'city')} /></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                <div className="grid gap-1"><Label className="text-xs">Couleur d’onglet</Label><Input placeholder="#ff6b9d" disabled={disabled} {...register(`fans.${i}.color`)} /><FieldError message={err(i, 'color')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Caractère (une phrase)</Label><Input disabled={disabled} aria-invalid={!!err(i, 'persona')} {...register(`fans.${i}.persona`)} /><FieldError message={err(i, 'persona')} /></div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Son premier message</Label>
                <Textarea rows={2} disabled={disabled} aria-invalid={!!err(i, 'openingMessage')} {...register(`fans.${i}.openingMessage`)} />
                <FieldError message={err(i, 'openingMessage')} />
              </div>
              <p className="text-xs text-muted-foreground">Caché — pilote l’IA, jamais montré au chatter</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1"><Label className="text-xs">Plafond de dépense (€)</Label><Input type="number" min={0} disabled={disabled} {...register(`fans.${i}.budgetCap`)} /><FieldError message={err(i, 'budgetCap')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Palier où il négocie (€)</Label><Input type="number" min={0} disabled={disabled} {...register(`fans.${i}.negoThreshold`)} /><FieldError message={err(i, 'negoThreshold')} /></div>
              </div>
              <div className="grid gap-1"><Label className="text-xs">Comment / quand il négocie</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.negoWhere`)} /><FieldError message={err(i, 'negoWhere')} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1"><Label className="text-xs">Moment de la demande de rencontre</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.meetWhen`)} /><FieldError message={err(i, 'meetWhen')} /></div>
                <div className="grid gap-1"><Label className="text-xs">Formulation de la demande</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.meetWhere`)} /><FieldError message={err(i, 'meetWhere')} /></div>
              </div>
              <div className="grid gap-1"><Label className="text-xs">Ses déraillements</Label><Textarea rows={2} disabled={disabled} {...register(`fans.${i}.derails`)} /><FieldError message={err(i, 'derails')} /></div>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  )
}
```

- [ ] **Step 4: `components/case-dialog.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CASE_KINDS, CASE_KIND_LABELS } from '@/lib/types/training'
import { saveCase } from '../actions'
import { caseForm, type CaseFormValues, type CaseInput } from '../schema'
import type { CatalogCase, CatalogModule } from '../types'
import { CaseFormArena } from './case-form-arena'
import { CaseFormBoss, emptyFan } from './case-form-boss'
import { CaseFormSolo } from './case-form-solo'
import { FieldError } from './field-error'

/** Un Select Radix refuse `value=""` → sentinelle pour « sans section » (guidelines §5, piège). */
const NONE = 'none'

const emptyCase = (moduleId: string): CaseFormValues => ({
  id: null, moduleId, kind: 'solo', sectionId: null, title: '', phase: '', difficulty: 3, maxTurns: 8, isSale: false,
  context: '', objective: '', targetLine: '', fanName: '', fanBrief: '', expected: '', messages: [],
  reactionMaxS: '', slots: [], fans: [],
})
const toForm = (c: CatalogCase): CaseFormValues => ({
  id: c.id, moduleId: c.moduleId, kind: c.kind, sectionId: c.sectionId, title: c.title, phase: c.phase,
  difficulty: c.difficulty, maxTurns: c.maxTurns, isSale: c.isSale, context: c.context, objective: c.objective,
  targetLine: c.targetLine ?? '', fanName: c.fanName ?? '', fanBrief: c.fanBrief ?? '', expected: c.expected ?? '',
  messages: c.messages.map((m) => ({ speaker: m.speaker, body: m.body })),
  reactionMaxS: c.reactionMaxS ?? '',
  slots: c.arenaSlots.map((s) => ({ refCaseId: s.refCaseId, displayName: s.displayName })),
  fans: c.bossFans.map((f) => ({
    name: f.name, age: f.age ?? '', job: f.job ?? '', city: f.city ?? '', color: f.color ?? '', persona: f.persona,
    openingMessage: f.openingMessage, budgetCap: f.budgetCap ?? '', negoThreshold: f.negoThreshold ?? '',
    negoWhere: f.negoWhere ?? '', meetWhen: f.meetWhen ?? '', meetWhere: f.meetWhere ?? '', derails: f.derails ?? '',
  })),
})
const emptySlots = () => Array.from({ length: 5 }, () => ({ refCaseId: '', displayName: '' }))

/**
 * Dialog Nouveau / Modifier cas. La SORTE se choisit à la création (solo / défi simultané / boss
 * final) et ne se change plus ensuite (le sélecteur est verrouillé en édition ; l'action le
 * re-vérifie). Sections dans l'ordre où le chatter les rencontre : Identité · Ce que voit le
 * chatter · puis la partie propre à la sorte. Reset à chaque ouverture.
 */
export function CaseDialog({
  open,
  module,
  caseItem,
  onClose,
}: {
  open: boolean
  module: CatalogModule
  /** null = création dans `module`. */
  caseItem: CatalogCase | null
  onClose: () => void
}) {
  'use no memo'
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CaseFormValues, unknown, CaseInput>({
    resolver: zodResolver(caseForm),
    defaultValues: caseItem ? toForm(caseItem) : emptyCase(module.id),
  })
  useEffect(() => {
    if (open) reset(caseItem ? toForm(caseItem) : emptyCase(module.id))
  }, [open, caseItem, module.id, reset])
  const kind = useWatch({ control, name: 'kind' })

  // Passage à une sorte multi-conversations : on amorce ce que le superRefine exigera.
  const onKindChange = (k: CaseFormValues['kind']) => {
    setValue('kind', k)
    if (k !== 'solo' && (getValues('reactionMaxS') === '' || getValues('reactionMaxS') == null)) setValue('reactionMaxS', 120)
    if (k === 'arena' && getValues('slots').length !== 5) setValue('slots', emptySlots())
    if (k === 'boss' && getValues('fans').length === 0) setValue('fans', [emptyFan()])
  }

  const soloOptions = module.cases
    .filter((c) => c.kind === 'solo')
    .map((c) => ({ value: c.id, label: `${c.title} (diff. ${c.difficulty})` }))

  const submit = handleSubmit(async (values) => {
    const res = await saveCase(values)
    if (!res.success) {
      for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
        const message = messages?.[0]
        if (message && (field === 'sectionId' || field === 'slots')) setError(field, { message })
      }
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(caseItem ? 'Cas modifié' : 'Cas créé')
    onClose()
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{caseItem ? `Modifier « ${caseItem.title} »` : `Nouveau cas — ${module.title}`}</DialogTitle>
          <DialogDescription>
            {caseItem ? 'La sorte du cas ne se change pas.' : 'Choisis d’abord la sorte : elle ne se change plus ensuite. Le cas est ajouté en fin de module.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Identité</legend>
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="grid gap-1.5">
                <Label>Sorte</Label>
                <Select value={kind} onValueChange={(v) => onKindChange(v as CaseFormValues['kind'])} disabled={isSubmitting || !!caseItem}>
                  <SelectTrigger aria-label="Sorte du cas"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_KINDS.map((k) => <SelectItem key={k} value={k}>{CASE_KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-title">Titre</Label>
                <Input id="case-title" disabled={isSubmitting} aria-invalid={!!errors.title} {...register('title')} />
                <FieldError message={errors.title?.message} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="case-phase">Phase (étiquette)</Label>
                <Input id="case-phase" placeholder="Qualification" disabled={isSubmitting} {...register('phase')} />
                <FieldError message={errors.phase?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-diff">Difficulté (1-10)</Label>
                <Input id="case-diff" type="number" min={1} max={10} disabled={isSubmitting} aria-invalid={!!errors.difficulty} {...register('difficulty')} />
                <FieldError message={errors.difficulty?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="case-turns">Messages max{kind === 'boss' ? ' (par fan)' : ''}</Label>
                <Input id="case-turns" type="number" min={1} max={50} disabled={isSubmitting} aria-invalid={!!errors.maxTurns} {...register('maxTurns')} />
                <FieldError message={errors.maxTurns?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label>Section</Label>
                <Controller
                  name="sectionId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={isSubmitting || module.sections.length === 0}>
                      <SelectTrigger aria-label="Section"><SelectValue placeholder="Sans section" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sans section</SelectItem>
                        {module.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.emoji ? `${s.emoji} ` : ''}{s.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.sectionId?.message} />
              </div>
            </div>
            <Controller
              name="isSale"
              control={control}
              render={({ field }) => (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={isSubmitting} />
                  Le cas attend une vente
                </label>
              )}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Ce que voit le chatter</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="case-context">Contexte (situation de départ)</Label>
              <Textarea id="case-context" rows={3} disabled={isSubmitting} aria-invalid={!!errors.context} {...register('context')} />
              <FieldError message={errors.context?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="case-objective">{module.objectiveLabel}</Label>
              <Textarea id="case-objective" rows={2} disabled={isSubmitting} aria-invalid={!!errors.objective} {...register('objective')} />
              <FieldError message={errors.objective?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="case-target">Ligne cible (facultatif)</Label>
              <Input id="case-target" disabled={isSubmitting} {...register('targetLine')} />
              <FieldError message={errors.targetLine?.message} />
            </div>
          </fieldset>

          {kind === 'solo' && <CaseFormSolo control={control} register={register} errors={errors} disabled={isSubmitting} />}
          {kind === 'arena' && <CaseFormArena control={control} register={register} errors={errors} disabled={isSubmitting} soloOptions={soloOptions} />}
          {kind === 'boss' && <CaseFormBoss control={control} register={register} errors={errors} disabled={isSubmitting} />}

          {errors.root && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>}
          {/* `id` et `moduleId` voyagent par les defaultValues (RHF garde les valeurs sans input
              DOM, shouldUnregister=false) — PAS d'<input hidden> : il forcerait `id: null` en ''. */}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
            <ActionButton type="submit" pending={isSubmitting}>{caseItem ? 'Enregistrer' : 'Créer le cas'}</ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```
- [ ] **Step 5: Brancher dans `catalog-view.tsx`**

Ajouter l'état et le dialog :
```tsx
import { CaseDialog } from './case-dialog'
import type { CatalogCase, CatalogModule } from '../types'
// …
const [caseDialog, setCaseDialog] = useState<{ open: boolean; caseItem: CatalogCase | null }>({ open: false, caseItem: null })
// …
<ModulePanel
  module={selected}
  onEdit={() => setModuleDialog({ open: true, module: selected })}
  onCreateCase={() => setCaseDialog({ open: true, caseItem: null })}
  onEditCase={(c) => setCaseDialog({ open: true, caseItem: c })}
/>
// …
{selected && (
  <CaseDialog
    open={caseDialog.open}
    module={selected}
    caseItem={caseDialog.caseItem}
    onClose={() => setCaseDialog((d) => ({ ...d, open: false }))}
  />
)}
```

- [ ] **Step 6: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web test`
Manuel (UAT) : ouvrir « Éditer » sur `trans_01` (solo) → tous les champs pré-remplis (3 messages d'ouverture), changer un mot, Enregistrer → OK. Éditer `set_arena` → 5 conversations affichées avec le bon cas et prénom ; remplacer un cas par un solo d'un AUTRE module n'est pas possible (liste bornée au module) ; Enregistrer OK. Éditer `boss_final` → 5 fans, champs cachés remplis ; Enregistrer OK. « Nouveau cas » : solo sans prénom → erreur sous le champ ; défi → 5 lignes vides, erreurs par ligne ; boss → 1 fan amorcé. Créer un solo réel dans « Test plan » puis un défi qui le référence 5 fois → OK ; désactiver le solo → refus « joué dans le défi ».

- [ ] **Step 7: Commit** (demander) — `feat(formation): catalogue — dialog cas (solo, défi simultané, boss final)`

---

### Task 10: `training-modules` (lecture) — liste des modules, page module (Cours / Cas), routes

**Files:**
- Create: `apps/web/src/features/training-modules/types.ts`
- Create: `apps/web/src/features/training-modules/services/get-modules.ts`, `apps/web/src/features/training-modules/services/get-module.ts`
- Create: `apps/web/src/features/training-modules/ModulesTemplate.tsx`, `apps/web/src/features/training-modules/ModuleTemplate.tsx`
- Create: `apps/web/src/features/training-modules/components/modules-skeleton.tsx`, `components/module-skeleton.tsx`, `components/module-tabs.tsx`, `components/course-view.tsx`, `components/cases-list.tsx`
- Create: `apps/web/src/app/(dash)/formation/modules/page.tsx`, `loading.tsx`, `apps/web/src/app/(dash)/formation/modules/[code]/page.tsx`, `loading.tsx`

**Interfaces:**
- Produces: `ModuleSummary`, `ModuleDetail`, `PublicCase`, `PublicBossFan` ; `getModules(): Promise<ModuleSummary[]>` ; `getModule(code): Promise<ModuleDetail | null>` ; `<ModulesTemplate modules />` ; `<ModuleTemplate module vue />`.
- Consumes: `requireAccess(['frm-entrainement', 'frm-suivi'])` (Task 2), `MarkdownView` (Task 5), `CASE_KIND_LABELS`, `RouteLoading`/`SectionFallback`, `Tabs`.
- **Sécurité** : la projection publique ne sélectionne JAMAIS `fan_brief`, `expected`, `scoring_notes`, ni les champs cachés des fans du boss (`budget_cap`, `nego_*`, `meet_*`, `derails`) — un RSC les enverrait dans le payload client du chatter.

- [ ] **Step 1: `types.ts`**

```ts
import type { CaseKind } from '@/lib/types/training'

/**
 * Projection PUBLIQUE du catalogue — ce qu'un chatter (droit Entraînement) ou un encadrant
 * (droit Suivi) peut voir AVANT de jouer : jamais la consigne du fan, l'attendu, la consigne de
 * notation ni les champs cachés des fans du boss (ils pilotent l'IA). Actifs uniquement.
 */
export interface ModuleSummary {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  caseCount: number
  hasCourse: boolean
}

export interface PublicBossFan {
  id: string
  name: string
  age: number | null
  job: string | null
  city: string | null
  color: string | null
  persona: string
}

export interface PublicCase {
  id: string
  code: string
  kind: CaseKind
  title: string
  phase: string
  difficulty: number
  maxTurns: number
  reactionMaxS: number | null
  isSale: boolean
  sectionId: string | null
  position: number
  /** Boss final uniquement (côté visible des fans). */
  bossFans: PublicBossFan[]
}

export interface ModuleDetail {
  id: string
  code: string
  title: string
  emoji: string | null
  description: string | null
  objectiveLabel: string
  courseMd: string | null
  axes: { key: string; name: string; description: string }[]
  sections: { id: string; title: string; emoji: string | null; description: string | null }[]
  cases: PublicCase[]
}

export type ModuleVue = 'cours' | 'cas'
```

- [ ] **Step 2: Services**

`services/get-modules.ts` :
```ts
import { createClient } from '@/lib/supabase/server'
import type { ModuleSummary } from '../types'

/** Modules ACTIFS, ordonnés, avec leur nombre de cas actifs (table de référence — select simple). */
export async function getModules(): Promise<ModuleSummary[]> {
  const supabase = await createClient()
  const [mods, cases] = await Promise.all([
    supabase.from('training_modules').select('id, code, title, emoji, description, course_md').eq('active', true).order('position'),
    supabase.from('training_cases').select('module_id').eq('active', true),
  ])
  if (mods.error) throw new Error(mods.error.message)
  if (cases.error) throw new Error(cases.error.message)
  const counts = new Map<string, number>()
  for (const c of cases.data ?? []) counts.set(c.module_id, (counts.get(c.module_id) ?? 0) + 1)
  return (mods.data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    caseCount: counts.get(m.id) ?? 0,
    hasCourse: !!m.course_md,
  }))
}
```

`services/get-module.ts` :
```ts
import { createClient } from '@/lib/supabase/server'
import type { CaseKind } from '@/lib/types/training'
import type { ModuleDetail } from '../types'

/**
 * Un module ACTIF par code, avec ses axes, sections et cas actifs en PROJECTION PUBLIQUE :
 * colonnes visibles uniquement (jamais fan_brief / expected / scoring_notes ni les champs cachés
 * des fans du boss — un RSC les enverrait au navigateur du chatter). null = inconnu ou inactif.
 */
export async function getModule(code: string): Promise<ModuleDetail | null> {
  const supabase = await createClient()
  const { data: m, error } = await supabase
    .from('training_modules')
    .select(
      'id, code, title, emoji, description, objective_label, course_md, ' +
        'training_module_axes(key, name, description, position), ' +
        'training_module_sections(id, title, emoji, description, position)',
    )
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!m) return null

  const { data: cases, error: cErr } = await supabase
    .from('training_cases')
    .select(
      'id, code, kind, title, phase, difficulty, max_turns, reaction_max_s, is_sale, section_id, position, ' +
        'training_case_boss_fans(id, name, age, job, city, color, persona, position)',
    )
    .eq('module_id', m.id)
    .eq('active', true)
    .order('position')
  if (cErr) throw new Error(cErr.message)
  const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position)

  return {
    id: m.id,
    code: m.code,
    title: m.title,
    emoji: m.emoji,
    description: m.description,
    objectiveLabel: m.objective_label,
    courseMd: m.course_md,
    axes: byPosition(m.training_module_axes).map((a) => ({ key: a.key, name: a.name, description: a.description })),
    sections: byPosition(m.training_module_sections).map((s) => ({ id: s.id, title: s.title, emoji: s.emoji, description: s.description })),
    cases: (cases ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      kind: c.kind as CaseKind,
      title: c.title,
      phase: c.phase,
      difficulty: c.difficulty,
      maxTurns: c.max_turns,
      reactionMaxS: c.reaction_max_s,
      isSale: c.is_sale,
      sectionId: c.section_id,
      position: c.position,
      bossFans: byPosition(c.training_case_boss_fans).map((f) => ({
        id: f.id, name: f.name, age: f.age, job: f.job, city: f.city, color: f.color, persona: f.persona,
      })),
    })),
  }
}
```

- [ ] **Step 3: Skeletons**

`components/modules-skeleton.tsx` :
```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la liste des modules : grille de cartes (7 dans le seed). */
export function ModulesSkeleton() {
  return (
    <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-32 rounded-xl" />
      ))}
    </div>
  )
}
```
`components/module-skeleton.tsx` :
```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la page module : onglets + colonne de texte (cours) — même largeur `max-w-prose`. */
export function ModuleSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-9 w-40" />
        <div className="flex max-w-prose flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `components/course-view.tsx` + `components/cases-list.tsx`** (Server Components — pur rendu)

```tsx
// course-view.tsx
import { MarkdownView } from '@/components/markdown-view'

/** Cours du module en typographie lisible (`max-w-prose`), ou un mot si le module n'en a pas (Boss). */
export function CourseView({ courseMd }: { courseMd: string | null }) {
  if (!courseMd?.trim()) {
    return <p className="text-sm text-muted-foreground">Pas de cours pour ce module — passe directement aux cas.</p>
  }
  return <MarkdownView source={courseMd} className="max-w-prose" />
}
```

```tsx
// cases-list.tsx
import { Badge } from '@/components/ui/badge'
import { CASE_KIND_LABELS } from '@/lib/types/training'
import type { ModuleDetail, PublicCase } from '../types'

/**
 * Cas du module « à faire » — sans état de progression (arrive avec les sessions). Groupés par
 * section (dans l'ordre du module), puis par position ; les cas sans section sous « Autres cas »
 * s'il y a des sections, à plat sinon ; le défi simultané en dernier, à part ; un module Boss =
 * son cas boss avec ses fans côté visible. Zéro badge de progression, zéro médaille.
 */
export function CasesList({ module }: { module: ModuleDetail }) {
  const solos = module.cases.filter((c) => c.kind === 'solo')
  const arenas = module.cases.filter((c) => c.kind === 'arena')
  const bosses = module.cases.filter((c) => c.kind === 'boss')
  const groups: { key: string; title: string | null; description: string | null; cases: PublicCase[] }[] = []
  if (module.sections.length) {
    for (const s of module.sections) {
      const cases = solos.filter((c) => c.sectionId === s.id)
      if (cases.length) groups.push({ key: s.id, title: `${s.emoji ? `${s.emoji} ` : ''}${s.title}`, description: s.description, cases })
    }
    const rest = solos.filter((c) => !module.sections.some((s) => s.id === c.sectionId))
    if (rest.length) groups.push({ key: 'rest', title: 'Autres cas', description: null, cases: rest })
  } else if (solos.length) {
    groups.push({ key: 'all', title: null, description: null, cases: solos })
  }

  if (module.cases.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun cas pour l’instant.</p>
  }
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          {g.title && (
            <div>
              <h3 className="text-base font-semibold">{g.title}</h3>
              {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {g.cases.map((c) => <CaseRow key={c.id} c={c} />)}
          </ul>
        </section>
      ))}
      {arenas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Défi simultané</h3>
          <ul className="flex flex-col gap-2">
            {arenas.map((c) => <CaseRow key={c.id} c={c} />)}
          </ul>
        </section>
      )}
      {bosses.map((c) => (
        <section key={c.id} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">{c.title}</h3>
          <p className="text-sm text-muted-foreground">
            {c.bossFans.length} fans en parallèle · {c.maxTurns} messages max par fan{c.reactionMaxS ? ` · ${c.reactionMaxS} s pour répondre` : ''}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {c.bossFans.map((f) => (
              <li key={f.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {f.color && <span aria-hidden className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: f.color }} />}
                  {f.name}
                  {f.age ? `, ${f.age} ans` : ''}
                </p>
                <p className="text-muted-foreground">{[f.job, f.city].filter(Boolean).join(' · ')}</p>
                <p className="mt-1">{f.persona}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function CaseRow({ c }: { c: PublicCase }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
      <span className="font-medium">{c.title}</span>
      {c.phase && <span className="text-muted-foreground">{c.phase}</span>}
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {c.kind !== 'solo' && <Badge variant="secondary">{CASE_KIND_LABELS[c.kind]}</Badge>}
        {c.isSale && <Badge variant="outline">vente</Badge>}
        <span className="tabular-nums">diff. {c.difficulty}/10</span>
        <span className="tabular-nums">{c.maxTurns} msg{c.kind === 'boss' ? '/fan' : ''}</span>
        {c.reactionMaxS && <span className="tabular-nums">{c.reactionMaxS} s</span>}
      </span>
    </li>
  )
}
```

- [ ] **Step 5: `components/module-tabs.tsx`** (client — même patron que `members-tabs.tsx`)

```tsx
'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ModuleVue } from '../types'

/**
 * Deux vues d'un module : Cours (défaut, ne s'écrit pas dans l'URL) et Cas (`?vue=cas`). L'onglet
 * vit dans l'URL pour rester partageable (guidelines §6), `router.replace` dans un
 * `startTransition` — patron repris de `members-tabs.tsx` / `ComptaTabs`.
 */
export function ModuleTabs({ vue, cours, cas, casCount }: { vue: ModuleVue; cours: ReactNode; cas: ReactNode; casCount: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'cours') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    startTransition(() => router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="cours">Cours</TabsTrigger>
        <TabsTrigger value="cas">Cas ({casCount})</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-[pending]:opacity-60 data-[pending]:transition-opacity">
        <TabsContent value="cours">{cours}</TabsContent>
        <TabsContent value="cas">{cas}</TabsContent>
      </div>
    </Tabs>
  )
}
```

- [ ] **Step 6: Templates**

`ModulesTemplate.tsx` :
```tsx
import Link from 'next/link'
import type { ModuleSummary } from './types'

/** Liste des modules actifs (cartes) — Server Component, aucun fetch. Sans état de progression. */
export function ModulesTemplate({ modules }: { modules: ModuleSummary[] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">Un module = un cours à lire, puis des cas à jouer.</p>
      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun module disponible pour l’instant.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link href={`/formation/modules/${m.code}`} className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-accent">
                <span className="flex items-center gap-2 text-base font-semibold">
                  {m.emoji && <span aria-hidden>{m.emoji}</span>}
                  {m.title}
                </span>
                {m.description && <span className="text-sm text-muted-foreground">{m.description}</span>}
                <span className="mt-auto pt-2 text-xs text-muted-foreground">
                  {m.caseCount} cas{m.hasCourse ? ' · cours' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

`ModuleTemplate.tsx` :
```tsx
import { CasesList } from './components/cases-list'
import { CourseView } from './components/course-view'
import { ModuleTabs } from './components/module-tabs'
import type { ModuleDetail, ModuleVue } from './types'

/** Un module : description + onglets Cours / Cas — Server Component, aucun fetch. */
export function ModuleTemplate({ module, vue }: { module: ModuleDetail; vue: ModuleVue }) {
  return (
    <div className="flex flex-col gap-6">
      {module.description && <p className="-mt-4 max-w-prose text-sm text-muted-foreground">{module.description}</p>}
      <ModuleTabs
        vue={vue}
        casCount={module.cases.length}
        cours={<CourseView courseMd={module.courseMd} />}
        cas={<CasesList module={module} />}
      />
    </div>
  )
}
```

- [ ] **Step 7: Routes**

`app/(dash)/formation/modules/page.tsx` :
```tsx
import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getModules } from '@/features/training-modules/services/get-modules'
import { ModulesTemplate } from '@/features/training-modules/ModulesTemplate'
import { ModulesSkeleton } from '@/features/training-modules/components/modules-skeleton'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { ModuleSummary } from '@/features/training-modules/types'

/** Modules de formation — ouverts au droit Entraînement OU Suivi (miroir de `NavItem.anyOf`). */
export default async function ModulesPage() {
  await requireAccess(['frm-entrainement', 'frm-suivi'])
  const modules = getModules()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
      <Suspense fallback={<SectionFallback><ModulesSkeleton /></SectionFallback>}>
        <ModulesContent modules={modules} />
      </Suspense>
    </div>
  )
}

async function ModulesContent({ modules }: { modules: Promise<ModuleSummary[]> }) {
  return <ModulesTemplate modules={await modules} />
}
```
`modules/loading.tsx` : `<RouteLoading title="h-7 w-32"><ModulesSkeleton /></RouteLoading>`.

`app/(dash)/formation/modules/[code]/page.tsx` :
```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth'
import { getModule } from '@/features/training-modules/services/get-module'
import { ModuleTemplate } from '@/features/training-modules/ModuleTemplate'
import { ModuleSkeleton } from '@/features/training-modules/components/module-skeleton'
import type { ModuleDetail, ModuleVue } from '@/features/training-modules/types'

/** Un module : cours + cas. `?vue=cas` ; 404 si code inconnu ou module inactif. */
export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ vue?: string }>
}) {
  const [, { code }, { vue }] = await Promise.all([requireAccess(['frm-entrainement', 'frm-suivi']), params, searchParams])
  // Le h1 est le titre du module → il streame avec la donnée (pas de h1 immédiat séparable).
  const module = getModule(code)
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleContent module={module} vue={vue === 'cas' ? 'cas' : 'cours'} />
    </Suspense>
  )
}

async function ModuleContent({ module, vue }: { module: Promise<ModuleDetail | null>; vue: ModuleVue }) {
  const m = await module
  if (!m) notFound()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {m.emoji && <span aria-hidden>{m.emoji}</span>}
        {m.title}
      </h1>
      <ModuleTemplate module={m} vue={vue} />
    </div>
  )
}
```
`modules/[code]/loading.tsx` : `<RouteLoading title="h-8 w-64"><ModuleSkeleton /></RouteLoading>`.

- [ ] **Step 8: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Manuel (UAT) : admin → `/formation/modules` : 7 cartes ; `/formation/modules/setting` : cours rendu (titres, gras, table), `?vue=cas` : 6 sections + « Défi simultané » ; `/formation/modules/boss` : « Pas de cours », onglet Cas = 5 fans (prénom, âge, métier, ville, caractère — RIEN de caché) ; `/formation/modules/inconnu` → 404. « En tant que » un membre avec `frm-entrainement` seul : Modules visible dans la sidebar, la page s'ouvre ; **vérifier dans l'onglet Réseau (payload RSC) qu'aucun `fan_brief` / `expected` / `budget_cap` n'apparaît** (`grep` sur la réponse du document `/formation/modules/setting`). Un module désactivé au Catalogue disparaît de la liste et 404 sur son URL.

- [ ] **Step 9: Commit** (demander) — `feat(formation): pages Modules — liste, cours Markdown, cas par section (lecture)`

---

### Task 11: Documentation, vérification finale, hand-off

**Files:**
- Modify: `CLAUDE.md` (ligne « 3 faces du CRM ») ; `docs/superpowers/specs/2026-08-17-formation-catalogue-design.md` (statut + écarts tranchés)

- [ ] **Step 1: `CLAUDE.md`** — dans le paragraphe « 3 faces du CRM », remplacer « `Formation` (`/formation/*`, squelette : Overview placeholder + Membres — la reprise de Good Luck Agency vient ensuite) » par :

> `Formation` (`/formation/*` — reprise de Good Luck Agency : **catalogue** `training_*` (0113 schéma, 0114 seed généré par `packages/db/scripts/gen-training-seed.mjs` depuis `formation.json`), Catalogue admin `features/training-catalog`, Modules en lecture `features/training-modules` (projection publique — jamais `fan_brief`/`expected` côté chatter), droits `frm-suivi` (Overview, encadrement) / `frm-entrainement` (Ma formation, chatter), Modules ouvert aux deux (`NavItem.anyOf`, `requireAccess([...])`) ; Ma formation / Overview sont des placeholders jusqu'aux sessions)

- [ ] **Step 2: Spec** — passer le statut à « implémenté (PRs 1-6) » et ajouter en fin de §7 : « Écart tranché à l'implémentation : pas de minimum d'axes (le Boss final GLA n'en a aucun — notation par étape) ; `saveModule`/`saveCase` (id null = création) ; item Modules en `anyOf` sans `slug` (+ `choiceLabel`) ».

- [ ] **Step 3: Vérification complète**

```bash
pnpm --filter @glagency/web lint && pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web test
pnpm --filter @glagency/db test
pnpm --filter @glagency/web build   # PPR/typedRoutes : un href mal typé ou une route dynamique sans params casse ICI, pas au typecheck
DB="$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')"; (cd packages/db && supabase db push --db-url "$DB" --dry-run)   # « Remote database is up to date »
```

- [ ] **Step 4: Recette UAT (Benoit)** — checklist à envoyer :
  1. `/formation/members` : cocher « Entraînement » à un chatter test, « Suivi » à un encadrant test.
  2. En tant que le chatter : sidebar = Ma formation, Modules ; lire le cours Setting ; onglet Cas ; `/formation/catalogue` inaccessible.
  3. Admin : Catalogue → éditer un cours (aperçu), un cas solo, le défi, le boss ; dupliquer ; désactiver / réactiver ; réordonner ; créer un module vide et un cas dedans.
  4. Prod : la 0113 + 0114 partent AVEC la release (`supabase db push --db-url "$DATABASE_URL"`), pas avant.

- [ ] **Step 5: Commit** (demander) — `docs(formation): CLAUDE.md + spec — catalogue livré`

---

## Self-review (fait à l'écriture du plan)

- **Couverture spec** : §2.1 schéma → Task 1 ; §2.2 seed → Tasks 3-4 ; §2.3 Catalogue admin (lister/créer/éditer/ordonner/activer, 3 sortes, messages, créneaux, fans) → Tasks 6-9 ; §2.4 Modules → Task 10 ; §3 modèle → Task 1 (colonnes 1:1) ; §3 RLS → Task 1 ; §4 règles de conversion → Task 3 (`buildSeed`, table de la spec reprise ligne à ligne : arena max_turns 8, boss 32, `me→creator`, `seed[0].t → opening_message`, `cap→budget_cap`, `nego→nego_threshold`, `rencontre→meet_when`, `rencontreWhere→meet_where`, `arena[]` du boss ignoré) ; §5 features/routes/slugs/anyOf/`requireAccess` tableau → Tasks 2, 6-10 ; §6 UI (2 colonnes, dialog cas par sections, dialog module avec aperçu, cartes + 2 onglets, neutre) → Tasks 7-10 ; §7 validation & erreurs (Zod plat + superRefine par sorte, `BusinessError`, `revalidatePath`, création dans module inactif autorisée) → Tasks 6, 8, 9 ; §8 tests (`canAccessNav`/anyOf, slugs, générateur : conversion, comptages, refus cross-module) → Tasks 2, 3, 5, 6 — `mergePages` n'est pas testé directement (son import tire `next/headers` via `lib/auth`) : couvert par `slugFace` (Task 2) dont il dépend entièrement ; §9 PRs 1-6 → Tasks 1-2 / 3-4 / 7 / 8 / 9 / 10.
- **Écarts assumés** (en tête du plan) : min axes, 24 axes, anyOf sans slug + `choiceLabel`, `save*`, remplacement en bloc des enfants, `existingId` (pas `id`) dans les field arrays (clé réservée par `useFieldArray`).
- **Cohérence des noms** : `saveModule`/`toggleModule`/`moveModule`/`saveCase`/`toggleCase`/`moveCase`/`duplicateCase` (Task 6) = ceux appelés en Tasks 7-9 ; `ModuleFormValues`/`ModuleInput`/`CaseFormValues`/`CaseInput` partout ; `CatalogModule.cases`/`.axes`/`.sections`, `CatalogCase.messages`/`.arenaSlots`/`.bossFans` (Task 6 types = Task 7 service = Tasks 8-9 `toForm`) ; `onCreate`/`onEdit`/`onCreateCase`/`onEditCase` (Task 7 props = Tasks 8-9 câblage) ; `getModules`/`getModule`/`ModuleSummary`/`ModuleDetail`/`PublicCase`/`ModuleVue` (Task 10) ; `frm-entrainement`/`frm-suivi` (Task 2 = Task 10 gardes).
