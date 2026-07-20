# To-do personnelle (onglet du Planning) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une to-do personnelle (kanban à faire / en cours / fini) en second onglet de la page Planning, alimentée par son porteur, par sa hiérarchie et par Claude en SQL direct.

**Architecture:** Nouvelle table `todos` (une ligne = une tâche, `profile_id` = le porteur) protégée par une fonction RLS `can_write_todo_of` qui compose les règles existantes du planning. Côté web, une nouvelle feature `features/todos/` (Server Component + feuille client) est montée dans la page `/chatter/planning` existante, qui devient un conteneur à deux onglets pilotés par le searchParam `?vue=`. Le sélecteur de personne du planning est réutilisé tel quel et enrichi (superadmins visibles des superadmins).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), `@dnd-kit/core`, react-hook-form + Zod v4, Supabase (Postgres + RLS), sonner.

**Spec de référence :** `docs/superpowers/specs/2026-07-20-todos-kanban-design.md`

## Global Constraints

- **Migrations** : numéro suivant contigu = `0067`. Convention `text` + `check`, **jamais** `create type … enum`. Toute fonction `security definer` porte `set search_path = public`, précédée d'un `revoke all … from public` avant le `grant`. Application via `cd packages/db && supabase db push --db-url "$DATABASE_URL"` — **jamais** `psql -f`.
- **Extraire l'URL de base en brut** : `grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'` — jamais `source .env`. Port direct 5432, pas le pooler 6543. UAT = variable `DATABASE_URL_UAT`.
- **Ordre de déploiement** : migration appliquée sur UAT **puis** prod AVANT le déploiement du code.
- **Architecture web** : `app → feature(template) → composants`. Aucun fetch dans une feature. Mutations en Server Actions via `runAction`. Pas de `use cache` sur une lecture RLS (cookie-bound).
- **Pas de tests unitaires dans `apps/web`** (aucun Vitest configuré) : la vérification web = `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`, plus les vérifications manuelles décrites dans chaque tâche. Les tests de la couche SQL sont de vrais tests exécutables (tâche 1).
- **Pas de commit automatique** : chaque étape « Commit » doit être **proposée à Benoit**, jamais exécutée sans son accord explicite.
- **Ne pas toucher au design existant** au-delà de ce que le plan décrit.
- **Langue** : toute copie visible en français ; commentaires de code en français comme le reste du repo.
- **Vocabulaire figé** (mêmes noms partout) : statuts `todo` / `in_progress` / `done` ; types `feature` / `bug` / `maintenance` ; priorités `1` (haute) / `2` (normale) / `3` (basse) ; searchParam d'onglet `vue` avec les valeurs `planning` (défaut) et `todo`.

---

### Task 1: Migration `0067_todos.sql` (table, RLS, trigger)

**Files:**
- Create: `packages/db/supabase/migrations/0067_todos.sql`
- Create (temporaire, non commité): `/tmp/todos_rls_test.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Consumes: fonctions existantes `public.can_edit_planning_of(uuid)` (0061), `public.is_admin()`, `public.is_superadmin()` (0041).
- Produces: table `public.todos` (colonnes `id, profile_id, title, description, status, type, priority, release, created_by, created_by_name, created_at, updated_at, done_at`), fonction `public.can_write_todo_of(uuid) returns boolean`, trigger `todos_touch_trg`.

- [ ] **Step 1: Écrire le test SQL qui échoue**

Créer `/tmp/todos_rls_test.sql`. Ce script impersonne de vrais utilisateurs via `request.jwt.claims` et vérifie la matrice de droits. Il doit échouer maintenant (la table n'existe pas).

```sql
-- Test de can_write_todo_of : matrice de droits (spec §1).
-- Usage : psql "$DATABASE_URL_UAT" -f /tmp/todos_rls_test.sql
-- N'ÉCRIT RIEN : lectures + appels de fonction uniquement.
\set ON_ERROR_STOP on

do $$
declare
  v_super uuid; v_admin uuid; v_mgr uuid; v_sous uuid; v_chat uuid;
  v_ok boolean;
begin
  select id into v_super from profiles where role = 'superadmin' limit 1;
  select id into v_admin from profiles where role = 'admin' limit 1;
  select id into v_mgr   from profiles where role = 'manager' limit 1;
  select id into v_sous  from profiles where role = 'sous-manager' limit 1;
  select id into v_chat  from profiles where role = 'chatteur' limit 1;

  -- 1. superadmin écrit chez un admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_super)::text, true);
  select public.can_write_todo_of(v_admin) into v_ok;
  if not v_ok then raise exception 'FAIL 1 : superadmin devrait écrire chez un admin'; end if;

  -- 2. superadmin écrit chez lui-même
  select public.can_write_todo_of(v_super) into v_ok;
  if not v_ok then raise exception 'FAIL 2 : superadmin devrait écrire chez lui'; end if;

  -- 3. admin n'écrit PAS chez un superadmin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  select public.can_write_todo_of(v_super) into v_ok;
  if v_ok then raise exception 'FAIL 3 : admin ne doit pas écrire chez un superadmin'; end if;

  -- 4. admin écrit chez lui-même (branche self)
  select public.can_write_todo_of(v_admin) into v_ok;
  if not v_ok then raise exception 'FAIL 4 : admin devrait écrire chez lui'; end if;

  -- 5. admin écrit chez un manager
  select public.can_write_todo_of(v_mgr) into v_ok;
  if not v_ok then raise exception 'FAIL 5 : admin devrait écrire chez un manager'; end if;

  -- 6. PERSONNE n'écrit chez un chatteur (cible non encadrante)
  if v_chat is not null then
    select public.can_write_todo_of(v_chat) into v_ok;
    if v_ok then raise exception 'FAIL 6 : un chatteur ne doit jamais être une cible'; end if;
  end if;

  -- 7. manager écrit chez lui-même
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr)::text, true);
  select public.can_write_todo_of(v_mgr) into v_ok;
  if not v_ok then raise exception 'FAIL 7 : manager devrait écrire chez lui'; end if;

  -- 8. manager n'écrit PAS chez un admin
  select public.can_write_todo_of(v_admin) into v_ok;
  if v_ok then raise exception 'FAIL 8 : manager ne doit pas écrire chez un admin'; end if;

  -- 9. sous-manager écrit chez lui, mais pas chez un autre encadrant
  if v_sous is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_sous)::text, true);
    select public.can_write_todo_of(v_sous) into v_ok;
    if not v_ok then raise exception 'FAIL 9a : sous-manager devrait écrire chez lui'; end if;
    select public.can_write_todo_of(v_mgr) into v_ok;
    if v_ok then raise exception 'FAIL 9b : sous-manager ne doit pas écrire chez son manager'; end if;
  end if;

  -- 10. chatteur n'écrit nulle part, pas même chez lui
  if v_chat is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_chat)::text, true);
    select public.can_write_todo_of(v_chat) into v_ok;
    if v_ok then raise exception 'FAIL 10 : un chatteur ne doit pas avoir de to-do'; end if;
  end if;

  perform set_config('request.jwt.claims', null, true);
  raise notice 'TOUS LES TESTS can_write_todo_of PASSENT';
end $$;

-- Trigger : done_at posé à l'INSERT direct en 'done' (voie Claude), conservé, puis effacé.
do $$
declare v_target uuid; v_id uuid; v_done timestamptz; v_done2 timestamptz;
begin
  select id into v_target from profiles where role = 'superadmin' limit 1;
  insert into todos (profile_id, title, status) values (v_target, '__test_trigger__', 'done')
    returning id, done_at into v_id, v_done;
  if v_done is null then raise exception 'FAIL 11 : done_at doit être posé à l''INSERT en done'; end if;

  update todos set title = '__test_trigger2__' where id = v_id returning done_at into v_done2;
  if v_done2 is distinct from v_done then raise exception 'FAIL 12 : done_at doit être conservé'; end if;

  update todos set status = 'todo' where id = v_id returning done_at into v_done2;
  if v_done2 is not null then raise exception 'FAIL 13 : done_at doit être effacé en sortie de done'; end if;

  delete from todos where id = v_id;
  raise notice 'TOUS LES TESTS todos_touch PASSENT';
end $$;
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -f /tmp/todos_rls_test.sql
```

Attendu : `ERROR: function public.can_write_todo_of(uuid) does not exist`.

- [ ] **Step 3: Écrire la migration**

Créer `packages/db/supabase/migrations/0067_todos.sql` :

```sql
-- 0067 — To-do personnelle : une liste par encadrant, affichée en 2e onglet de la page
-- Planning (spec docs/superpowers/specs/2026-07-20-todos-kanban-design.md).
--
-- Droits = ceux du planning (0061), PLUS « chacun gère la sienne » (une to-do qu'on ne peut
-- pas cocher soi-même n'a aucun sens), MOINS les cibles non encadrantes : can_edit_planning_of
-- laisserait un admin écrire chez un chatteur, or un chatteur n'a pas accès à la page — sa
-- liste serait invisible.
create table public.todos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'done')),
  -- Facultatif : sert la roadmap de dev, inutile pour une tâche opérationnelle.
  type        text check (type in ('feature', 'bug', 'maintenance')),
  -- Rang numérique et NON un libellé : un `order by` sur du texte trierait alphabétiquement
  -- (basse < haute < normale), soit un ordre faux et silencieux.
  priority    smallint not null default 2 check (priority in (1, 2, 3)),  -- 1 haute, 2 normale, 3 basse
  release     text,
  created_by  uuid references public.profiles(id) on delete set null,
  -- Nom de l'auteur DÉNORMALISÉ, posé par les Server Actions. Indispensable : la RLS de
  -- `profiles` (0054) ne laisse un manager lire que lui-même et ses rattachés directs — une
  -- jointure sur l'auteur renverrait donc null quand un admin dépose une tâche chez lui.
  -- null + created_by null = écrit par Claude (service role).
  created_by_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);

create or replace function public.can_write_todo_of(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
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

-- Lecture = écriture (pas de to-do en lecture seule, spec §1).
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
-- Toute FK est indexée (convention 0055_fk_indexes.sql).
create index todos_created_by_idx on public.todos (created_by);

-- updated_at / done_at maintenus EN BASE : Claude écrit en SQL direct, hors des Server
-- Actions — un maintien applicatif seul les laisserait périmés. INSERT compris (une tâche
-- créée directement en 'done' doit avoir son done_at) ; `old` n'existe pas à l'INSERT, d'où
-- la garde tg_op.
create or replace function public.todos_touch()
returns trigger
language plpgsql
set search_path = public
as $$
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

- [ ] **Step 4: Appliquer sur l'UAT**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
cd packages/db && supabase db push --db-url "$UAT" --dry-run
```
Attendu : la migration `0067_todos.sql` est listée comme à appliquer. Puis :
```bash
cd packages/db && supabase db push --db-url "$UAT"
```
Attendu : `Finished supabase db push.`

- [ ] **Step 5: Relancer le test pour vérifier qu'il passe**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -f /tmp/todos_rls_test.sql
```
Attendu : `NOTICE: TOUS LES TESTS can_write_todo_of PASSENT` puis `NOTICE: TOUS LES TESTS todos_touch PASSENT`, sans `ERROR`.

Si un `FAIL n` apparaît : corriger la migration, la ré-appliquer (`supabase db push`), relancer. Ne pas passer à la suite tant que le script n'est pas vert.

- [ ] **Step 6: Vérifier l'advisor Supabase**

Interroger l'advisor de sécurité du projet UAT (`ihkksdmgtrbbjugeboks`) via le MCP Supabase (`get_advisors`, type `security`).
Attendu : aucune nouvelle alerte `unindexed_foreign_keys`, `function_search_path_mutable` ou `rls_disabled_in_public` mentionnant `todos` ou `can_write_todo_of`.

- [ ] **Step 7: Régénérer les types**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase gen types typescript --db-url "$UAT" > packages/db/src/types.ts
git diff --stat packages/db/src/types.ts
```
Attendu : le diff ajoute le bloc `todos` dans `Tables`. Vérifier qu'aucune table existante n'a disparu (`git diff packages/db/src/types.ts | grep '^-' | head -30` ne doit montrer que du bruit de formatage, pas des suppressions de tables).

- [ ] **Step 8: Commit (demander l'accord de Benoit avant d'exécuter)**

```bash
git add packages/db/supabase/migrations/0067_todos.sql packages/db/src/types.ts
git commit -m "feat(db): table todos + RLS can_write_todo_of + trigger done_at [0067]"
```

---

### Task 2: Couche domaine de la feature (types, schéma, service, actions)

**Files:**
- Create: `apps/web/src/features/todos/types.ts`
- Create: `apps/web/src/features/todos/schema.ts`
- Create: `apps/web/src/features/todos/services/get-todos.ts`
- Create: `apps/web/src/features/todos/actions.ts`

**Interfaces:**
- Consumes: `public.todos` + `can_write_todo_of` (tâche 1) ; `runAction` / `ActionResult` (`@/lib/actions`) ; `getProfile` / `Profile` (`@/lib/auth`) ; `createClient` (`@/lib/supabase/server`).
- Produces:
  - `Todo` : `{ id: string; title: string; description: string | null; status: TodoStatus; type: TodoType | null; priority: TodoPriority; release: string | null; createdBy: string | null; createdByName: string | null; createdAt: string; doneAt: string | null }`
  - `TodoStatus = 'todo' | 'in_progress' | 'done'`, `TodoType = 'feature' | 'bug' | 'maintenance'`, `TodoPriority = 1 | 2 | 3`
  - `STATUSES`, `TYPES`, `PRIORITIES` (tableaux de `{ value, label }`, ordre d'affichage)
  - `getTodos(targetId: string): Promise<Todo[]>`
  - `createTodo(input: unknown): Promise<ActionResult>`, `updateTodo(input: unknown): Promise<ActionResult>`, `setTodoStatus(input: unknown): Promise<ActionResult>`, `deleteTodo(input: unknown): Promise<ActionResult>`
  - `todoCreateInput`, `todoUpdateInput`, `todoStatusInput`, `todoDeleteInput` (schémas Zod)

- [ ] **Step 1: Écrire `types.ts`**

```ts
/** Une tâche de la to-do personnelle (spec 2026-07-20). */
export type TodoStatus = 'todo' | 'in_progress' | 'done'
export type TodoType = 'feature' | 'bug' | 'maintenance'
/** Rang numérique : 1 haute, 2 normale, 3 basse — trié tel quel (jamais par libellé). */
export type TodoPriority = 1 | 2 | 3

export interface Todo {
  id: string
  title: string
  description: string | null
  status: TodoStatus
  type: TodoType | null
  priority: TodoPriority
  release: string | null
  /** null = écrit par Claude en SQL direct (service role), ou auteur supprimé. */
  createdBy: string | null
  createdByName: string | null
  createdAt: string
  doneAt: string | null
}

/** Colonnes du kanban, dans l'ordre d'affichage. */
export const STATUSES: { value: TodoStatus; label: string }[] = [
  { value: 'todo', label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Fini' },
]

/** Types facultatifs : sans type, la carte n'affiche aucun badge. */
export const TYPES: { value: TodoType; label: string }[] = [
  { value: 'feature', label: 'Fonctionnalité' },
  { value: 'bug', label: 'Bug' },
  { value: 'maintenance', label: 'Maintenance' },
]

export const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
]

export const statusLabel = (s: TodoStatus) => STATUSES.find((x) => x.value === s)?.label ?? s
export const typeLabel = (t: TodoType) => TYPES.find((x) => x.value === t)?.label ?? t
export const priorityLabel = (p: TodoPriority) => PRIORITIES.find((x) => x.value === p)?.label ?? ''
```

- [ ] **Step 2: Écrire `schema.ts`**

```ts
import { z } from 'zod'

// Schémas PARTAGÉS client (RHF) ↔ serveur (runAction). `profileId` est le PORTEUR de la
// liste (la cible du sélecteur) : il fait partie de l'entrée validée, la garde applicative
// et la RLS tranchent ensuite le droit d'y écrire.

const status = z.enum(['todo', 'in_progress', 'done'])
const type = z.enum(['feature', 'bug', 'maintenance'])
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)])

/** '' → null : un champ vide du formulaire ne doit pas devenir une chaîne vide en base. */
const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === '' ? null : v))
    .nullable()

const base = {
  profileId: z.uuid(),
  title: z.string().trim().min(1, 'Titre requis').max(200, 'Titre trop long (200 max)'),
  description: optionalText(5000, 'Description trop longue (5 000 max)'),
  type: type.nullable(),
  priority,
  release: optionalText(20, 'Release trop longue (20 max)'),
}

export const todoCreateInput = z.object(base)
export type TodoCreateInput = z.infer<typeof todoCreateInput>

export const todoUpdateInput = z.object({ ...base, id: z.uuid() })
export type TodoUpdateInput = z.infer<typeof todoUpdateInput>

/** Statut en valeur ABSOLUE (jamais un déplacement relatif) : deux drags concurrents convergent. */
export const todoStatusInput = z.object({ id: z.uuid(), profileId: z.uuid(), status })
export type TodoStatusInput = z.infer<typeof todoStatusInput>

export const todoDeleteInput = z.object({ id: z.uuid(), profileId: z.uuid() })
```

- [ ] **Step 3: Écrire `services/get-todos.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import type { Todo, TodoPriority, TodoStatus, TodoType } from '../types'

/**
 * To-do d'UNE personne (la cible du sélecteur). Le cloisonnement est porté par la RLS
 * (`todos_select` → `can_write_todo_of`, 0067) : la lecture n'aboutit que si l'on a le droit
 * d'écrire chez cette personne (lecture = écriture, spec §1). Volume : quelques dizaines de
 * lignes → pas de RPC/fetchAll (largement sous 1000).
 *
 * Tri : priorité (rang NUMÉRIQUE 1→3), puis date de création. La colonne « Fini » est
 * re-triée par `done_at` décroissant côté composant (un seul aller-retour SQL).
 */
export async function getTodos(targetId: string): Promise<Todo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, description, status, type, priority, release, created_by, created_by_name, created_at, done_at')
    .eq('profile_id', targetId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TodoStatus,
    type: (t.type ?? null) as TodoType | null,
    priority: t.priority as TodoPriority,
    release: t.release,
    createdBy: t.created_by,
    // Nom DÉNORMALISÉ (0067) : surtout pas une jointure sur `profiles`, dont la RLS (0054)
    // renverrait null à un manager pour un auteur admin. Sans auteur = écrit par Claude.
    createdByName: t.created_by_name ?? (t.created_by ? null : 'Claude'),
    createdAt: t.created_at,
    doneAt: t.done_at,
  }))
}
```

- [ ] **Step 4: Écrire `actions.ts`**

```ts
'use server'

// Server Actions de la to-do personnelle. Garde applicative `requireCanWriteTodo` = miroir
// EXACT de la fonction RLS `can_write_todo_of` (0067) : cible encadrante, et soit les règles
// du planning (can_edit_planning_of), soit sa propre liste. La RLS reste l'enforcement réel ;
// cette garde évite un aller-retour inutile et donne un message français.

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile, type Profile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import { todoCreateInput, todoDeleteInput, todoStatusInput, todoUpdateInput } from './schema'

const ENCADRANTS = ['superadmin', 'admin', 'manager', 'sous-manager']

const loadTargetProfile = async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('role, manager_id')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Miroir de `can_write_todo_of`. Mémoïsé par requête (une seule lecture de la cible pour la
 * garde ET le handler, comme `requireCanEdit` du planning).
 */
const requireCanWriteTodo = cache(
  async (targetId: string): Promise<{ profile: Profile } | { error: string }> => {
    const profile = await getProfile()
    if (!profile) return { error: 'Accès réservé' }
    // Sa propre liste : ouverte à tout encadrant (un chatteur n'a pas de to-do).
    if (targetId === profile.id) {
      return ENCADRANTS.includes(profile.baseRole) ? { profile } : { error: 'Accès réservé' }
    }
    const target = await loadTargetProfile(targetId)
    if (!target) return { error: 'Profil introuvable' }
    if (!ENCADRANTS.includes(target.role)) return { error: 'Cette personne n’a pas de to-do' }
    if (profile.superadmin) return { profile }
    if (profile.role === 'admin') {
      if (target.role === 'admin' || target.role === 'superadmin') {
        return { error: 'La to-do d’un admin est gérée par un propriétaire' }
      }
      return { profile }
    }
    if (profile.baseRole === 'manager' && target.role === 'sous-manager' && target.manager_id === profile.id) {
      return { profile }
    }
    return { error: 'Accès réservé' }
  },
)

/**
 * Garde d'une action : valide l'entrée avec SON schéma (donc `profileId` est un vrai uuid —
 * une chaîne quelconque partirait sinon dans une requête Postgres et lèverait un 22P02 remonté
 * en « Erreur inattendue »), puis vérifie le droit d'écriture. Entrée invalide → on laisse le
 * safeParse de `runAction` produire les fieldErrors.
 */
const guardFor =
  <S extends z.ZodType<{ profileId: string }>>(raw: unknown, schema: S) =>
  async () => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { ok: true } as const
    const res = await requireCanWriteTodo(parsed.data.profileId)
    return 'error' in res ? ({ ok: false, error: res.error } as const) : ({ ok: true } as const)
  }

const revalidateTodos = () => revalidatePath('/chatter/planning')

/** Crée une tâche dans la liste de `profileId`. */
export async function createTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoCreateInput,
    input: raw,
    guard: guardFor(raw, todoCreateInput),
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new Error(res.error) // impossible si le guard a laissé passer
      const supabase = await createClient()
      const { error } = await supabase.from('todos').insert({
        profile_id: values.profileId,
        title: values.title,
        description: values.description,
        type: values.type,
        priority: values.priority,
        release: values.release,
        created_by: res.profile.id,
        // Dénormalisé : la RLS de profiles empêcherait un manager de résoudre ce nom.
        created_by_name: res.profile.displayName ?? res.profile.email ?? null,
      })
      if (error) throw new Error(error.message)
      revalidateTodos()
    },
  })
}

export async function updateTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoUpdateInput,
    input: raw,
    guard: guardFor(raw, todoUpdateInput),
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new Error(res.error)
      const supabase = await createClient()
      // .eq('profile_id') en plus de l'id : un id d'une AUTRE liste ne peut pas être détourné
      // via un profileId complaisant (la RLS le bloquerait déjà, ceinture + bretelles).
      const { error } = await supabase
        .from('todos')
        .update({
          title: values.title,
          description: values.description,
          type: values.type,
          priority: values.priority,
          release: values.release,
        })
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
      if (error) throw new Error(error.message)
      revalidateTodos()
    },
  })
}

/** Change le statut — valeur ABSOLUE, jamais un déplacement relatif. */
export async function setTodoStatus(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoStatusInput,
    input: raw,
    guard: guardFor(raw, todoStatusInput),
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new Error(res.error)
      const supabase = await createClient()
      // done_at et updated_at sont posés par le trigger todos_touch (0067).
      const { error } = await supabase
        .from('todos')
        .update({ status: values.status })
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
      if (error) throw new Error(error.message)
      revalidateTodos()
    },
  })
}

export async function deleteTodo(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: todoDeleteInput,
    input: raw,
    guard: guardFor(raw, todoDeleteInput),
    handler: async (values) => {
      const res = await requireCanWriteTodo(values.profileId)
      if ('error' in res) throw new Error(res.error)
      const supabase = await createClient()
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', values.id)
        .eq('profile_id', values.profileId)
      if (error) throw new Error(error.message)
      revalidateTodos()
    },
  })
}
```

- [ ] **Step 5: Vérifier la compilation**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```
Attendu : aucune erreur. Si `created_by_name` est inconnu du type `todos`, c'est que `packages/db/src/types.ts` n'a pas été régénéré après la migration (tâche 1, étape 7) — le refaire.

- [ ] **Step 6: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/todos
git commit -m "feat(todos): types, schéma zod, service de lecture et Server Actions"
```

---

### Task 3: Onglets dans la page Planning (`?vue=`) + sélecteur enrichi

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/planning/page.tsx` (fichier entier réécrit, 70 lignes actuelles)
- Modify: `apps/web/src/app/(dash)/chatter/planning/loading.tsx` (5 lignes)
- Modify: `apps/web/src/features/planning/services/get-planning.ts:92-115` (`getPlanningMembers`)
- Modify: `apps/web/src/features/planning/types.ts` (type `PlanningMember`)
- Create: `apps/web/src/features/todos/components/todos-tabs.tsx`
- Create: `apps/web/src/features/todos/components/todos-skeleton.tsx`

**Interfaces:**
- Consumes: `getTodos` (tâche 2), `getPlanning` / `getPlanningMembers` (existants), `Tabs` (`@/components/ui/tabs`).
- Produces:
  - `PlanningMember` gagne `hasPlanningPage: boolean`
  - `<TodosTabs vue={'planning' | 'todo'} planning={ReactNode} todo={ReactNode} />` (feuille client qui écrit `?vue=` dans l'URL)
  - `<TodosSkeleton />`
  - `page.tsx` accepte désormais `searchParams: Promise<{ membre?: string; vue?: string }>`

- [ ] **Step 1: Ajouter `hasPlanningPage` au type `PlanningMember`**

Dans `apps/web/src/features/planning/types.ts`, remplacer la déclaration de `PlanningMember` par :

```ts
/** Personne sélectionnable dans l'en-tête (planning + to-do). */
export interface PlanningMember {
  id: string
  name: string
  role: string
  /**
   * La personne a-t-elle le droit d'ouvrir la page Planning (slug 'planning', ou admin/
   * superadmin qui y accèdent sans slug) ? Sert le bandeau d'avertissement de la to-do :
   * le sélecteur liste par RÔLE, pas par slug — on peut donc viser quelqu'un qui ne verra
   * jamais la liste qu'on lui écrit.
   */
  hasPlanningPage: boolean
}
```

- [ ] **Step 2: Renseigner `hasPlanningPage` dans `getPlanningMembers` et y inclure les superadmins**

Dans `apps/web/src/features/planning/services/get-planning.ts`, remplacer le corps de `getPlanningMembers` par :

```ts
export async function getPlanningMembers(role: Profile['baseRole']): Promise<PlanningMember[]> {
  // Qui peut être sélectionné, par rôle du spectateur. Les SUPERADMINS ne sont visibles que
  // d'un superadmin (la RLS 0061 l'autorisait déjà : la restriction était purement ici).
  const roles =
    role === 'superadmin'
      ? ['superadmin', 'admin', 'manager', 'sous-manager']
      : role === 'admin'
        ? ['manager', 'sous-manager']
        : role === 'manager'
          ? ['sous-manager']
          : []
  if (!roles.length) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, role, pages')
    .in('role', roles)
    .order('role')
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name ?? p.email ?? '—',
    role: p.role,
    // admin/superadmin passent requireAccess sans slug (lib/auth) ; les autres ont besoin
    // du slug 'planning' pour ouvrir la page — et donc pour voir leur to-do.
    hasPlanningPage:
      p.role === 'admin' || p.role === 'superadmin' || (p.pages ?? []).includes('planning'),
  }))
}
```

⚠️ Conserver l'import de `Profile` déjà présent dans le fichier, mais **mettre à jour la docstring** de la fonction : elle dit aujourd'hui « jamais de superadmin », ce que cette étape rend faux. Nouvelle docstring :

```ts
/**
 * Personnes sélectionnables dans l'en-tête (planning ET to-do). Filtré par rôle du viewer —
 * jamais de chatteur ; les SUPERADMINS ne sont visibles que d'un superadmin (la RLS 0061
 * l'autorisait déjà : un superadmin édite n'importe quelle cible, lui-même compris).
 * superadmin → superadmins + admins + managers + sous-managers ; admin → managers +
 * sous-managers ; manager → ses sous-managers directs (RLS `profiles`) ; sinon personne.
 */
```

- [ ] **Step 3: Écrire le squelette de la to-do**

Créer `apps/web/src/features/todos/components/todos-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette du kanban (3 colonnes) — fallback du Suspense quand ?vue=todo. */
export function TodosSkeleton() {
  return (
    // role="status" + sr-only : convention des skeletons du repo (planning-skeleton.tsx).
    <div role="status">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((col) => (
          <div key={col} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Écrire la barre d'onglets**

Créer `apps/web/src/features/todos/components/todos-tabs.tsx` :

```tsx
'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Bascule Planning journalier ↔ To-do. L'onglet actif vit dans l'URL (`?vue=`) pour rester
 * partageable et se combiner avec `?membre=` — écrit en `router.replace(..., { scroll: false })`
 * dans un `startTransition` (docs/guidelines-standard-feature.md §6 : pas de `push`, pas
 * d'entrée d'historique parasite à chaque changement d'onglet).
 */
export function TodosTabs({
  vue,
  planning,
  todo,
}: {
  vue: 'planning' | 'todo'
  planning: ReactNode
  todo: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'planning') params.delete('vue')
    else params.set('vue', next)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <Tabs value={vue} onValueChange={go} className="flex flex-col gap-6">
      <TabsList className="self-start">
        <TabsTrigger value="planning">Planning journalier</TabsTrigger>
        <TabsTrigger value="todo">To-do</TabsTrigger>
      </TabsList>
      <div data-pending={pending ? '' : undefined} className="data-pending:opacity-60 data-pending:transition-opacity">
        <TabsContent value="planning">{planning}</TabsContent>
        <TabsContent value="todo">{todo}</TabsContent>
      </div>
    </Tabs>
  )
}
```

- [ ] **Step 5: Réécrire `page.tsx`**

Remplacer intégralement `apps/web/src/app/(dash)/chatter/planning/page.tsx` par :

```tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getPlanning, getPlanningMembers } from '@/features/planning/services/get-planning'
import { PlanningTemplate } from '@/features/planning/PlanningTemplate'
import { PlanningSkeleton } from '@/features/planning/components/planning-skeleton'
import { MemberSelect } from '@/features/planning/components/member-select'
import { getTodos } from '@/features/todos/services/get-todos'
import { TodosTemplate } from '@/features/todos/TodosTemplate'
import { TodosSkeleton } from '@/features/todos/components/todos-skeleton'
import { TodosTabs } from '@/features/todos/components/todos-tabs'
import { requireAccess } from '@/lib/auth'
import type { PlanningMember } from '@/features/planning/types'

/**
 * Deux onglets sur la même page (`?vue=`) : le planning journalier et la to-do personnelle.
 * Le sélecteur `?membre=` est COMMUN aux deux (superadmin → tout, superadmins compris ;
 * admin → managers/sous-managers ; manager → ses sous-managers directs ; sous-manager →
 * personne). Droits distincts : on n'édite pas SON planning (sauf superadmin), mais on gère
 * toujours SA to-do (spec 2026-07-20).
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ membre?: string; vue?: string }>
}) {
  const profile = await requireAccess('planning')
  // Jamais de chatteur (matrice), même si un admin lui a coché le slug 'planning'.
  // /no-access et pas landingHref : éviter la boucle si 'planning' est sa seule page autorisée.
  if (profile.baseRole === 'chatteur') redirect('/no-access')
  const { membre, vue: vueParam } = await searchParams
  const vue = vueParam === 'todo' ? 'todo' : 'planning'

  // Kickoff SANS await : le sélecteur est un widget client (useRouter) qui a besoin de
  // `members` — tout le composite streame dans un seul boundary. `[]` pour sous-manager.
  const membersPromise = getPlanningMembers(profile.baseRole)

  return (
    <Suspense fallback={vue === 'todo' ? <TodosSkeleton /> : <PlanningSkeleton />}>
      <PlanningContent
        profileId={profile.id}
        selfName={profile.displayName ?? profile.email ?? 'Moi'}
        superadmin={profile.superadmin}
        membre={membre}
        vue={vue}
        membersPromise={membersPromise}
      />
    </Suspense>
  )
}

async function PlanningContent({
  profileId,
  selfName,
  superadmin,
  membre,
  vue,
  membersPromise,
}: {
  profileId: string
  selfName: string
  superadmin: boolean
  membre?: string
  vue: 'planning' | 'todo'
  membersPromise: Promise<PlanningMember[]>
}) {
  // Personnes gérables (hors soi). S'il n'y en a aucune → pas de sélecteur (members vide),
  // on ouvre le sien. SOI-MÊME en tête. `role: ''` = pas de suffixe de rôle dans le libellé.
  const others = (await membersPromise).filter((m) => m.id !== profileId)
  const members: PlanningMember[] = others.length
    ? [{ id: profileId, name: `${selfName} (moi)`, role: '', hasPlanningPage: true }, ...others]
    : []
  const target = membre && members.some((m) => m.id === membre) ? membre : profileId
  // Édition du PLANNING : on ne modifie jamais le sien (préparé par un rôle au-dessus) ; le
  // superadmin fait exception. RLS 0043/0061 + requireCanEdit = la vraie défense.
  const canEdit = superadmin || target !== profileId
  // La to-do, elle, est TOUJOURS gérée par son porteur — pas de flag symétrique (spec §1).
  const targetMember = members.find((m) => m.id === target)
  const targetName = target === profileId ? selfName : (targetMember?.name ?? '')

  // Les deux requêtes sont indépendantes : en parallèle, sinon `await` dans les props JSX
  // les sérialiserait (waterfall — docs/guidelines-data-loading.md).
  const [planning, todos] = await Promise.all([getPlanning(target), getTodos(target)])

  return (
    <div className="flex flex-col gap-6">
      {/* Le sélecteur vit AU-DESSUS des onglets : Radix démonte le contenu de l'onglet
          inactif, donc un sélecteur logé dans l'en-tête du planning disparaîtrait dès qu'on
          bascule sur la to-do. */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
        {members.length > 0 && (
          <div className="ml-auto">
            <MemberSelect members={members} value={target} />
          </div>
        )}
      </div>
      <TodosTabs
        vue={vue}
        planning={<PlanningTemplate data={planning} canEdit={canEdit} members={members} />}
        todo={
          <TodosTemplate
            todos={todos}
            profileId={target}
            targetName={targetName}
            isSelf={target === profileId}
            targetHasAccess={targetMember?.hasPlanningPage ?? true}
          />
        }
      />
    </div>
  )
}
```

⚠️ **Changement visible sur la page Planning existante — à faire valider par Benoit avant de coder cette étape.** Le titre et le sélecteur de personne remontent au-dessus de la barre d'onglets ; l'en-tête du planning journalier ne garde que son sous-titre (nom, durée, shifts) et ses deux boutons. C'est structurellement nécessaire : Radix `Tabs` démonte le contenu de l'onglet inactif (`TabsContent` sans `forceMount`, `components/ui/tabs.tsx`), donc un sélecteur resté dans `PlanningHeader` serait absent de l'onglet To-do. Les deux arbres sont bien rendus côté serveur (les deux données sont chargées), mais l'état **client** de l'onglet inactif (filtre, dialog ouvert) est réinitialisé à chaque bascule — acceptable ici.

- [ ] **Step 6: Rendre `loading.tsx` neutre**

Remplacer `apps/web/src/app/(dash)/chatter/planning/loading.tsx` par :

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette NEUTRE : un `loading.tsx` ne reçoit pas `searchParams`, donc on ne sait pas quel
 * onglet va s'afficher. On ne montre que ce qui est commun (titre, sélecteur, barre
 * d'onglets) — le fallback spécifique à l'onglet est celui du <Suspense> de page.tsx.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="ml-auto h-9 w-52" />
      </div>
      <Skeleton className="h-10 w-64" />
    </div>
  )
}
```

- [ ] **Step 7: Créer un `TodosTemplate` provisoire pour compiler**

Créer `apps/web/src/features/todos/TodosTemplate.tsx` (il sera étoffé en tâche 4) :

```tsx
import type { Todo } from './types'

/**
 * To-do personnelle — Server Component, aucun fetch (données en props). Toute l'interactivité
 * vit dans les composants clients (board, dialog).
 */
export function TodosTemplate({
  todos,
  profileId,
  targetName,
  isSelf,
  targetHasAccess,
}: {
  todos: Todo[]
  /** Porteur de la liste (cible du sélecteur) — jamais le spectateur. */
  profileId: string
  targetName: string
  isSelf: boolean
  /** La cible peut-elle ouvrir la page Planning ? Sinon elle ne verra jamais cette liste. */
  targetHasAccess: boolean
}) {
  return (
    <div className="flex flex-col gap-4" data-profile-id={profileId}>
      <p className="text-sm text-muted-foreground">
        {isSelf ? 'Ma to-do' : `To-do de ${targetName}`} · {todos.length} tâche
        {todos.length > 1 ? 's' : ''}
        {!targetHasAccess && ' · sans accès à la page'}
      </p>
    </div>
  )
}
```

- [ ] **Step 8: Vérifier la compilation et le rendu**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Attendu : build OK.

Puis vérification manuelle (`pnpm dev`, connecté en superadmin sur la préprod) :
1. `/chatter/planning` → titre « Planning » + sélecteur au-dessus des onglets, onglet « Planning journalier » actif, contenu du planning inchangé ;
2. clic sur « To-do » → l'URL devient `/chatter/planning?vue=todo`, le compteur de tâches s'affiche (0 pour l'instant), **le sélecteur reste visible** ;
3. changer de personne depuis l'onglet To-do → l'onglet reste actif, `?membre=` s'ajoute à l'URL ;
4. le sélecteur propose désormais les **superadmins** ;
5. retour arrière du navigateur : on ne repasse pas par chaque bascule d'onglet (c'est `replace`).

- [ ] **Step 9: Retirer le sélecteur (et le titre) de l'en-tête du planning**

Le sélecteur est désormais rendu par `page.tsx` au-dessus des onglets (Step 5). Dans `apps/web/src/features/planning/components/planning-header.tsx` :

1. supprimer l'import `useRouter` et la ligne `const router = useRouter()` (plus aucun usage) ;
2. supprimer l'import `Combobox` ;
3. supprimer la prop `members` de la signature et du type (elle n'est plus lue ici) ;
4. rétrograder le `<h1>` en `<h2>` — la page n'a plus qu'un seul `<h1>` (« Planning », rendu par `page.tsx`) — en gardant le libellé « Planning journalier » comme titre de section :

```tsx
        <div>
          <h2 className="text-lg font-medium">Planning journalier</h2>
          <p className="text-sm text-muted-foreground">
            {data.profileName}
            {totalMin > 0 && (
              <>
                {' '}· {fmtDuration(totalMin)} de travail effectif · {shiftsCount} shift
                {shiftsCount > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
```

5. remplacer la condition `{members.length > 0 && (<div className="ml-auto flex flex-wrap items-center gap-2"> <Combobox …/> {canEdit && (…boutons…)} </div>)}` par le seul bloc des boutons, sans dépendance à `members` :

```tsx
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* les deux boutons existants, inchangés */}
          </div>
        )}
```

6. répercuter la suppression de la prop `members` chez l'appelant `planning-view.tsx` (il continue de la recevoir de `PlanningTemplate` : la laisser passer ou la retirer aussi, au choix — mais le typecheck doit être vert).

- [ ] **Step 10: Écrire le sélecteur partagé**

Créer `apps/web/src/features/planning/components/member-select.tsx` :

```tsx
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Combobox } from '@/components/ui/combobox'
import type { PlanningMember } from '../types'

/**
 * Sélecteur de personne COMMUN aux deux onglets (planning + to-do) — rendu au-dessus de
 * `Tabs`, qui démonte l'onglet inactif. Préserve tous les paramètres d'URL existants
 * (`?vue=` en particulier) et écrit en `replace` + `scroll: false` (guidelines §6).
 */
export function MemberSelect({ members, value }: { members: PlanningMember[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('membre', id)
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <Combobox
      value={value}
      onChange={select}
      className={pending ? 'w-52 opacity-60' : 'w-52'}
      placeholder="Choisir un membre…"
      searchPlaceholder="Rechercher un membre…"
      options={members.map((m) => ({
        value: m.id,
        label:
          m.role === 'manager'
            ? `${m.name} · manager`
            : m.role === 'sous-manager'
              ? `${m.name} · sous-manager`
              : m.role === 'admin'
                ? `${m.name} · admin`
                : m.role === 'superadmin'
                  ? `${m.name} · propriétaire`
                  : m.name,
      }))}
    />
  )
}
```

- [ ] **Step 11: Re-vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Puis refaire les 5 points de l'étape 8 — en particulier le 2 (sélecteur toujours visible sur l'onglet To-do) et le 3 (changement de personne depuis la to-do).

- [ ] **Step 12: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/app/\(dash\)/chatter/planning apps/web/src/features/planning apps/web/src/features/todos
git commit -m "feat(planning): onglets Planning/To-do (?vue=) + sélecteur partagé + superadmins"
```

---

### Task 4: Kanban en lecture (colonnes, cartes, tri, bandeau)

**Files:**
- Modify: `apps/web/src/features/todos/TodosTemplate.tsx`
- Create: `apps/web/src/features/todos/components/todos-board.tsx`
- Create: `apps/web/src/features/todos/components/todo-column.tsx`
- Create: `apps/web/src/features/todos/components/todo-card.tsx`

**Interfaces:**
- Consumes: `Todo`, `STATUSES`, `TYPES`, `PRIORITIES` (tâche 2).
- Produces:
  - `<TodosBoard todos={Todo[]} profileId={string} targetHasAccess={boolean} />`
  - `<TodoColumn status={TodoStatus} todos={Todo[]} />`
  - `<TodoCard todo={Todo} />`
  - `groupByStatus(todos: Todo[]): Record<TodoStatus, Todo[]>` (exporté depuis `todos-board.tsx`)

- [ ] **Step 1: Écrire la carte**

Créer `apps/web/src/features/todos/components/todo-card.tsx` :

```tsx
'use client'

import { Bug, Sparkles, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { priorityLabel, typeLabel, type Todo, type TodoType } from '../types'

const TYPE_ICON: Record<TodoType, typeof Bug> = {
  feature: Sparkles,
  bug: Bug,
  maintenance: Wrench,
}

/** Le TYPE est la seule couleur forte de la carte : la priorité reste sobre (sinon les deux
 *  axes se marchent dessus et plus rien n'est lisible). */
const TYPE_CLASS: Record<TodoType, string> = {
  feature: 'text-emerald-600 dark:text-emerald-400',
  bug: 'text-red-600 dark:text-red-400',
  maintenance: 'text-slate-500 dark:text-slate-400',
}

export function TodoCard({ todo }: { todo: Todo }) {
  const Icon = todo.type ? TYPE_ICON[todo.type] : null
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left">
      <div className="flex items-start gap-2">
        {Icon && todo.type && (
          <Icon
            aria-label={typeLabel(todo.type)}
            className={cn('mt-0.5 size-4 shrink-0', TYPE_CLASS[todo.type])}
          />
        )}
        <span className="text-sm font-medium leading-snug">{todo.title}</span>
      </div>
      {todo.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{todo.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {todo.priority !== 2 && <span>{priorityLabel(todo.priority)}</span>}
        {todo.release && <span>{todo.release}</span>}
        {todo.createdByName && <span>{todo.createdByName}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Écrire la colonne**

Créer `apps/web/src/features/todos/components/todo-column.tsx` :

```tsx
'use client'

import { TodoCard } from './todo-card'
import { statusLabel, type Todo, type TodoStatus } from '../types'

export function TodoColumn({ status, todos }: { status: TodoStatus; todos: Todo[] }) {
  return (
    <section className="flex flex-col gap-3" aria-label={statusLabel(status)}>
      <h2 className="text-sm font-medium">
        {statusLabel(status)}{' '}
        <span className="text-muted-foreground">{todos.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {todos.map((t) => (
          <TodoCard key={t.id} todo={t} />
        ))}
        {todos.length === 0 && (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Rien ici.
          </p>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Écrire le board**

Créer `apps/web/src/features/todos/components/todos-board.tsx` :

```tsx
'use client'

import { useMemo } from 'react'
import { TodoColumn } from './todo-column'
import { STATUSES, type Todo, type TodoStatus } from '../types'

/**
 * Répartit les tâches par colonne. Le service les rend déjà triées (priorité puis date) ;
 * seule la colonne « Fini » est re-triée par done_at décroissant (le plus récemment terminé
 * en haut), ce qui ne justifie pas un second aller-retour SQL.
 */
export function groupByStatus(todos: Todo[]): Record<TodoStatus, Todo[]> {
  const out: Record<TodoStatus, Todo[]> = { todo: [], in_progress: [], done: [] }
  for (const t of todos) out[t.status].push(t)
  out.done.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  return out
}

export function TodosBoard({
  todos,
  targetHasAccess,
}: {
  todos: Todo[]
  targetHasAccess: boolean
}) {
  const columns = useMemo(() => groupByStatus(todos), [todos])
  return (
    <div className="flex flex-col gap-4">
      {!targetHasAccess && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          Cette personne n’a pas accès à la page Planning : elle ne verra pas cette liste tant
          que « Planning » n’est pas coché dans Membres.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((s) => (
          <TodoColumn key={s.value} status={s.value} todos={columns[s.value]} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Brancher le board dans le template**

Remplacer le corps de `apps/web/src/features/todos/TodosTemplate.tsx` (garder la signature et la docstring de la tâche 3) :

```tsx
import { TodosBoard } from './components/todos-board'
import type { Todo } from './types'

/**
 * To-do personnelle — Server Component, aucun fetch (données en props). Toute l'interactivité
 * vit dans les composants clients (board, dialog).
 */
export function TodosTemplate({
  todos,
  profileId,
  targetName,
  isSelf,
  targetHasAccess,
}: {
  todos: Todo[]
  /** Porteur de la liste (cible du sélecteur) — jamais le spectateur. */
  profileId: string
  targetName: string
  isSelf: boolean
  /** La cible peut-elle ouvrir la page Planning ? Sinon elle ne verra jamais cette liste. */
  targetHasAccess: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {isSelf ? 'Ma to-do' : `To-do de ${targetName}`}
      </p>
      <TodosBoard todos={todos} profileId={profileId} targetHasAccess={targetHasAccess} />
    </div>
  )
}
```

⚠️ `profileId` est passé au board dès maintenant (il servira aux mutations en tâche 5) : ajouter la prop correspondante à `TodosBoard` (`profileId: string`) même si elle n'est pas encore lue, sinon le typecheck échoue.

- [ ] **Step 5: Semer des données de test sur l'UAT**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" <<'SQL'
-- UN SEUL porteur : `from profiles, (values …) where role='superadmin' limit 5` ferait un
-- produit cartésien (2 superadmins en préprod) et répartirait les tâches entre eux au hasard.
insert into todos (profile_id, title, description, status, type, priority, release)
select (select id from profiles where email = 'blmd8345@gmail.com'),
       t.title, t.descr, t.status, t.type, t.prio, t.rel
from (values
  ('Fix relances fantômes', 'Vu sur le tracker spenders', 'todo', 'bug', 1, 'v1.4'),
  ('Brancher la page stats marketing', null, 'todo', 'feature', 2, null),
  ('Système de versioning', 'release-please + commitlint', 'in_progress', 'feature', 2, 'v1.4'),
  ('Rappeler Marco', null, 'todo', null, 1, null),
  ('Audit membres Akari', 'Doublon email', 'done', 'bug', 3, 'v1.3')
) as t(title, descr, status, type, prio, rel);
SQL
```

- [ ] **Step 6: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Puis, sur `pnpm dev` connecté en superadmin, ouvrir `/chatter/planning?vue=todo` et vérifier :
1. trois colonnes avec les bons compteurs (3 / 1 / 1) ;
2. « Fix relances fantômes » (priorité haute) apparaît **au-dessus** de « Brancher la page stats » (normale) ;
3. la carte « Rappeler Marco » n'a **aucun badge de type** ;
4. sélectionner un manager sans le slug `planning` → le bandeau d'avertissement s'affiche.

- [ ] **Step 7: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/todos
git commit -m "feat(todos): kanban en lecture (colonnes, cartes, tri, bandeau d'accès)"
```

---

### Task 5: Création, édition et suppression d'une tâche

**Files:**
- Create: `apps/web/src/features/todos/components/todo-dialog.tsx`
- Modify: `apps/web/src/features/todos/components/todos-board.tsx`
- Modify: `apps/web/src/features/todos/components/todo-card.tsx`

**Interfaces:**
- Consumes: `createTodo` / `updateTodo` / `deleteTodo` (tâche 2), `todoCreateInput` (tâche 2), `ConfirmDialog` (`@/components/confirm-dialog`), `ActionButton` (`@/components/action-button`).
- Produces: `<TodoDialog profileId={string} todo={Todo | null} releases={string[]} open={boolean} onOpenChange={(v: boolean) => void} />`. `TodoCard` gagne les props `onEdit: () => void` et `onDelete: () => Promise<string | void>`.

- [ ] **Step 1: Écrire le dialog**

Créer `apps/web/src/features/todos/components/todo-dialog.tsx` :

```tsx
'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { createTodo, updateTodo } from '../actions'
import { todoCreateInput, type TodoCreateInput } from '../schema'
import { PRIORITIES, TYPES, type Todo } from '../types'

const NONE = '__none__'

/**
 * Création / édition d'une tâche. Le schéma zod est PARTAGÉ avec le serveur ; les
 * `fieldErrors` renvoyés par l'action sont remappés champ par champ (un message global
 * générique ne dit pas quel champ corriger — leçon de l'audit Membres 2026-07-19).
 */
export function TodoDialog({
  profileId,
  todo,
  releases,
  open,
  onOpenChange,
}: {
  profileId: string
  /** null = création. */
  todo: Todo | null
  /** Releases déjà saisies — proposées en datalist pour éviter les valeurs fantômes (`v1.4 `). */
  releases: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<TodoCreateInput>({
    resolver: zodResolver(todoCreateInput),
    defaultValues: { profileId, title: '', description: null, type: null, priority: 2, release: null },
  })
  const { control, formState, handleSubmit, register, reset, setError } = form

  // Réinitialise à chaque ouverture : sans ça, rouvrir le dialog après une création réussie
  // le montrerait pré-rempli avec la tâche précédente (bug constaté sur Membres).
  useEffect(() => {
    if (!open) return
    reset({
      profileId,
      title: todo?.title ?? '',
      description: todo?.description ?? null,
      type: todo?.type ?? null,
      priority: todo?.priority ?? 2,
      release: todo?.release ?? null,
    })
  }, [open, todo, profileId, reset])

  const onSubmit = handleSubmit(async (values) => {
    const res = todo
      ? await updateTodo({ ...values, id: todo.id })
      : await createTodo(values)
    if (res.success) {
      toast.success(todo ? 'Tâche modifiée' : 'Tâche créée')
      onOpenChange(false)
      return
    }
    for (const [field, messages] of Object.entries(res.fieldErrors ?? {})) {
      if (messages?.[0]) setError(field as keyof TodoCreateInput, { message: messages[0] })
    }
    setError('root', { message: res.error })
    toast.error(res.error)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{todo ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
          <DialogDescription>
            Le type et la release sont facultatifs — utiles pour le suivi de développement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-title">Titre</Label>
            <Input id="todo-title" {...register('title')} autoFocus />
            {formState.errors.title && (
              <p className="text-sm text-destructive">{formState.errors.title.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="todo-description">Description</Label>
            <Textarea
              id="todo-description"
              rows={4}
              {...register('description', { setValueAs: (v) => (v === '' ? null : v) })}
            />
            {formState.errors.description && (
              <p className="text-sm text-destructive">{formState.errors.description.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Un Select Radix dans RHF passe par Controller, jamais register
                (docs/guidelines-standard-feature.md §5, « Pièges »). */}
            <div className="flex flex-col gap-2">
              <Label>Priorité</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v) as 1 | 2 | 3)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Aucun</SelectItem>
                      {TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-release">Release</Label>
              <Input
                id="todo-release"
                list="todo-releases"
                placeholder="v1.4"
                {...register('release', { setValueAs: (v) => (v === '' ? null : v.trim()) })}
              />
              {/* Propose les releases déjà saisies : une faute de frappe créerait une valeur
                  de filtre fantôme (mitigation prévue par la spec). */}
              <datalist id="todo-releases">
                {releases.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {formState.errors.release && (
                <p className="text-sm text-destructive">{formState.errors.release.message}</p>
              )}
            </div>
          </div>

          {formState.errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {formState.errors.root.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <ActionButton type="submit" pending={formState.isSubmitting}>
              {todo ? 'Enregistrer' : 'Créer la tâche'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Ajouter les actions sur la carte**

Dans `apps/web/src/features/todos/components/todo-card.tsx`, ajouter les imports et les props :

```tsx
// imports supplémentaires
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
```

Remplacer la signature et l'en-tête de la carte par :

```tsx
export function TodoCard({
  todo,
  onEdit,
  onDelete,
}: {
  todo: Todo
  onEdit: () => void
  /** Renvoie un message d'erreur pour garder le dialog ouvert, rien en cas de succès. */
  onDelete: () => Promise<string | void>
}) {
  const Icon = todo.type ? TYPE_ICON[todo.type] : null
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left">
      <div className="flex items-start gap-2">
        {Icon && todo.type && (
          <Icon
            aria-label={typeLabel(todo.type)}
            className={cn('mt-0.5 size-4 shrink-0', TYPE_CLASS[todo.type])}
          />
        )}
        <span className="text-sm font-medium leading-snug">{todo.title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Modifier" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label="Supprimer">
                <Trash2 className="size-3.5" />
              </Button>
            }
            title="Supprimer cette tâche ?"
            onConfirm={onDelete}
          />
        </div>
      </div>
```

⚠️ Ajouter `Trash2` à l'import `lucide-react` existant. Le reste du corps de la carte (description, métadonnées) est inchangé.

- [ ] **Step 3: Câbler dans le board**

Dans `apps/web/src/features/todos/components/todos-board.tsx`, remplacer le composant `TodosBoard` (garder `groupByStatus` tel quel) :

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TodoColumn } from './todo-column'
import { TodoDialog } from './todo-dialog'
import { deleteTodo } from '../actions'
import { STATUSES, type Todo } from '../types'

export function TodosBoard({
  todos,
  profileId,
  targetHasAccess,
}: {
  todos: Todo[]
  profileId: string
  targetHasAccess: boolean
}) {
  const columns = useMemo(() => groupByStatus(todos), [todos])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Todo | null>(null)
  // Releases déjà saisies : proposées en datalist dans le dialog (et réutilisées par le
  // filtre en tâche 7).
  const releases = useMemo(
    () => [...new Set(todos.map((t) => t.release).filter((r): r is string => !!r))].sort(),
    [todos],
  )

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
    if (res.success) {
      toast.success('Tâche supprimée')
      return
    }
    return res.error // string → le ConfirmDialog reste ouvert et affiche l'erreur
  }

  return (
    <div className="flex flex-col gap-4">
      {!targetHasAccess && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          Cette personne n’a pas accès à la page Planning : elle ne verra pas cette liste tant
          que « Planning » n’est pas coché dans Membres.
        </p>
      )}
      <Button className="self-start" onClick={openCreate}>
        <Plus data-icon="inline-start" />
        Nouvelle tâche
      </Button>
      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((s) => (
          <TodoColumn
            key={s.value}
            status={s.value}
            todos={columns[s.value]}
            onEdit={openEdit}
            onDelete={remove}
          />
        ))}
      </div>
      <TodoDialog
        profileId={profileId}
        todo={editing}
        releases={releases}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
```

- [ ] **Step 4: Propager dans la colonne**

Dans `apps/web/src/features/todos/components/todo-column.tsx`, remplacer la signature et la boucle :

```tsx
export function TodoColumn({
  status,
  todos,
  onEdit,
  onDelete,
}: {
  status: TodoStatus
  todos: Todo[]
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => Promise<string | void>
}) {
```

```tsx
        {todos.map((t) => (
          <TodoCard key={t.id} todo={t} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
        ))}
```

- [ ] **Step 5: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Puis, en préprod avec `pnpm dev` :
1. « Nouvelle tâche » → créer « Test création » en priorité haute, sans type → la carte apparaît en tête de « À faire », toast « Tâche créée » ;
2. rouvrir « Nouvelle tâche » → le formulaire est **vide** (pas pré-rempli avec la précédente) ;
3. modifier une tâche → le dialog est pré-rempli, l'enregistrement met la carte à jour ;
4. soumettre un titre vide → message « Titre requis » **sous le champ**, pas seulement un toast ;
5. supprimer une tâche → confirmation obligatoire, puis disparition ;
6. sélectionner un autre membre puis créer une tâche → elle apparaît bien dans **sa** liste, et pas dans la sienne (vérifier en rebasculant sur « moi »).

- [ ] **Step 6: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/todos
git commit -m "feat(todos): création, édition et suppression d'une tâche"
```

---

### Task 6: Drag & drop entre colonnes (dnd-kit + useOptimistic)

**Files:**
- Modify: `apps/web/package.json` (dépendance)
- Modify: `apps/web/src/features/todos/components/todos-board.tsx`
- Modify: `apps/web/src/features/todos/components/todo-column.tsx`
- Modify: `apps/web/src/features/todos/components/todo-card.tsx`

**Interfaces:**
- Consumes: `setTodoStatus` (tâche 2), `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors`).
- Produces: `TodoCard` gagne `onMove: (status: TodoStatus) => void` ; `TodoColumn` gagne `onMove`. Le board expose l'état optimiste via `useOptimistic`.

- [ ] **Step 1: Installer dnd-kit et vérifier la compatibilité React 19**

```bash
pnpm --filter @glagency/web add @dnd-kit/core
pnpm --filter @glagency/web build
```
Attendu : installation sans warning de peer dependency bloquant, build OK.

⚠️ Si l'installation refuse React 19 (peer dependency non satisfaite) : **ne pas forcer**. Remplacer par `pnpm --filter @glagency/web add @atlaskit/pragmatic-drag-and-drop` et adapter les étapes suivantes (API différente : `draggable({ element })` / `dropTargetForElements({ element })` dans un `useEffect`, au lieu des hooks). Noter le choix retenu dans la spec.

- [ ] **Step 2: Rendre la carte draggable + menu de repli**

Dans `apps/web/src/features/todos/components/todo-card.tsx`, ajouter les imports :

```tsx
import { useDraggable } from '@dnd-kit/core'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoveRight } from 'lucide-react'
import { STATUSES, statusLabel, type TodoStatus } from '../types'
```

Ajouter la prop `onMove` à la signature :

```tsx
export function TodoCard({
  todo,
  onEdit,
  onDelete,
  onMove,
}: {
  todo: Todo
  onEdit: () => void
  onDelete: () => Promise<string | void>
  /** Repli clavier/tactile du drag & drop — obligatoire pour l'accessibilité. */
  onMove: (status: TodoStatus) => void
}) {
```

Juste après la ligne `const Icon = …`, ajouter :

```tsx
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: todo.id })
```

Remplacer l'ouverture du `<div>` racine par :

```tsx
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left',
        isDragging && 'opacity-50',
      )}
    >
```

Puis, sur le `<span>` du titre, appliquer la poignée de drag (le titre entier est la poignée, mais **pas** les boutons — sinon un clic sur Modifier déclencherait un drag) :

```tsx
        <span className="cursor-grab text-sm font-medium leading-snug" {...listeners} {...attributes}>
          {todo.title}
        </span>
```

Enfin, dans le groupe de boutons, ajouter le menu de déplacement avant le bouton « Modifier » :

```tsx
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Déplacer vers">
                <MoveRight className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUSES.filter((s) => s.value !== todo.status).map((s) => (
                <DropdownMenuItem key={s.value} onSelect={() => onMove(s.value)}>
                  {statusLabel(s.value)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
```

- [ ] **Step 3: Rendre la colonne droppable**

Dans `apps/web/src/features/todos/components/todo-column.tsx`, ajouter :

```tsx
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
```

Ajouter la prop `onMove: (todo: Todo, status: TodoStatus) => void` à la signature, puis dans le corps :

```tsx
  const { setNodeRef, isOver } = useDroppable({ id: status })
```

Remplacer la `<section>` par :

```tsx
    <section
      ref={setNodeRef}
      aria-label={statusLabel(status)}
      className={cn('flex flex-col gap-3 rounded-md p-1 transition-colors', isOver && 'bg-muted')}
    >
```

et la boucle par :

```tsx
        {todos.map((t) => (
          <TodoCard
            key={t.id}
            todo={t}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
            onMove={(s) => onMove(t, s)}
          />
        ))}
```

- [ ] **Step 4: Câbler le DndContext et l'état optimiste**

Dans `apps/web/src/features/todos/components/todos-board.tsx`, ajouter les imports :

```tsx
import { useOptimistic, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { setTodoStatus } from '../actions'
import type { TodoStatus } from '../types'
```

Dans le composant, remplacer `const columns = useMemo(...)` par :

```tsx
  // État optimiste : la carte change de colonne AVANT la réponse serveur. Un échec rejoue
  // l'état serveur (React réconcilie à la fin de la transition) + toast d'erreur.
  const [optimistic, applyOptimistic] = useOptimistic(
    todos,
    (state: Todo[], move: { id: string; status: TodoStatus }) =>
      state.map((t) => (t.id === move.id ? { ...t, status: move.status } : t)),
  )
  const [, startTransition] = useTransition()
  const columns = useMemo(() => groupByStatus(optimistic), [optimistic])

  // Le drag ne démarre qu'après 6 px : sinon un simple clic sur le titre serait avalé.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const move = (todo: Todo, status: TodoStatus) => {
    if (todo.status === status) return
    startTransition(async () => {
      applyOptimistic({ id: todo.id, status })
      // Valeur ABSOLUE du statut (jamais un déplacement relatif) : deux drags concurrents
      // convergent au lieu de s'additionner.
      const res = await setTodoStatus({ id: todo.id, profileId, status })
      if (!res.success) toast.error(res.error)
    })
  }

  const onDragEnd = (event: DragEndEvent) => {
    const status = event.over?.id
    if (typeof status !== 'string') return
    const todo = optimistic.find((t) => t.id === event.active.id)
    if (todo) move(todo, status as TodoStatus)
  }
```

Envelopper la grille des colonnes dans le `DndContext` et propager `onMove` :

```tsx
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map((s) => (
            <TodoColumn
              key={s.value}
              status={s.value}
              todos={columns[s.value]}
              onEdit={openEdit}
              onDelete={remove}
              onMove={move}
            />
          ))}
        </div>
      </DndContext>
```

- [ ] **Step 5: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Puis en préprod :
1. glisser une carte de « À faire » vers « En cours » → elle bouge **immédiatement**, et reste en place après le rafraîchissement serveur ;
2. glisser vers « Fini » → la carte se place en tête de la colonne (tri `done_at` décroissant) ;
3. sortir une carte de « Fini » → elle repart dans la colonne visée ;
4. cliquer sur le titre sans bouger la souris → **aucun drag** ne se déclenche ;
5. utiliser le menu « Déplacer vers » → même effet que le drag ;
6. sur mobile (ou en mode responsive du navigateur) → le menu reste utilisable même si le drag est pénible.

- [ ] **Step 6: Vérifier le comportement en cas d'échec serveur**

Vérifier le rollback optimiste **sans muter aucun rôle** (une dégradation de rôle en préprod laisserait un compte cassé si la restauration était oubliée). Le chemin de refus existe déjà par construction : un **manager** ne peut pas écrire dans la liste d'un admin.

1. Se connecter en manager (préprod) et récupérer l'id d'une tâche d'un admin ainsi que celui d'un admin :
```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -c "select t.id as todo_id, t.profile_id from todos t join profiles p on p.id = t.profile_id where p.role = 'admin' limit 1;"
```
2. Dans la console du navigateur, appeler l'action avec ces identifiants — la garde doit refuser :
```js
// Coller dans la console, onglet To-do ouvert : reproduit ce que ferait un drag interdit.
await fetch(location.href, { method: 'HEAD' }) // s'assurer que la session est active
```
   Plus simple et suffisant : côté UI, sélectionner un **admin** dans le sélecteur en tant que manager — il n'y apparaît pas, donc le cas est inatteignable par l'interface.

3. Vérification directe du refus côté base (preuve que le rollback se déclencherait) :
```bash
psql "$UAT" -c "select public.can_write_todo_of('<uuid_admin>');" # depuis une session manager : false
```
Attendu : `f`. Si un jour l'action est appelée hors UI, `setTodoStatus` renvoie `success:false`, le toast s'affiche et `useOptimistic` restaure l'état serveur automatiquement à la fin de la transition.

- [ ] **Step 7: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/features/todos
git commit -m "feat(todos): drag & drop entre colonnes (dnd-kit + useOptimistic) + menu de repli"
```

---

### Task 7: Filtre par release, nettoyage et déploiement

**Files:**
- Modify: `apps/web/src/features/todos/components/todos-board.tsx`
- Modify: `docs/superpowers/specs/2026-07-20-todos-kanban-design.md` (statut)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: filtre de release local (`useState`, filtre de vue non partageable — guidelines §6).

- [ ] **Step 1: Ajouter le filtre par release**

Dans `apps/web/src/features/todos/components/todos-board.tsx`, ajouter l'import du Select puis, avant `const columns = …` :

```tsx
  // Filtre de VUE (pas de searchParams) : il ne change pas la donnée récupérée côté serveur
  // et n'a pas vocation à être partagé par lien (guidelines §6).
  const [release, setRelease] = useState<string>('all')
  // `releases` est déjà calculé en tâche 5 (datalist du dialog) — ne pas le redéclarer.
  const visible = useMemo(
    () =>
      release === 'all'
        ? optimistic
        : optimistic.filter((t) => (release === 'none' ? !t.release : t.release === release)),
    [optimistic, release],
  )
```

Puis remplacer `const columns = useMemo(() => groupByStatus(optimistic), [optimistic])` par :

```tsx
  const columns = useMemo(() => groupByStatus(visible), [visible])
```

Et ajouter le contrôle à côté du bouton « Nouvelle tâche » (uniquement s'il y a des releases) :

```tsx
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          Nouvelle tâche
        </Button>
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
      </div>
```

⚠️ Supprimer l'ancien `<Button className="self-start" onClick={openCreate}>` remplacé par ce bloc.

- [ ] **Step 2: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
En préprod : le sélecteur de release n'apparaît que si au moins une tâche en porte une ; choisir `v1.4` ne laisse que les tâches concernées, `Sans release` fait l'inverse.

- [ ] **Step 3: Nettoyer les données de test**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -c "delete from todos where title in ('Fix relances fantômes','Brancher la page stats marketing','Système de versioning','Rappeler Marco','Audit membres Akari','Test création');"
```

- [ ] **Step 4: Documenter la feature**

Dans `CLAUDE.md`, section « Règles », après le paragraphe sur les 2 faces du CRM, ajouter :

```markdown
- **To-do personnelle** : 2e onglet de `/chatter/planning` (`?vue=todo`), une liste par
  encadrant (`todos`, RLS `can_write_todo_of`, migration `0067`). Chacun gère la sienne ; la
  hiérarchie peut y déposer une tâche (mêmes règles que le planning). Aucun slug dédié : le
  droit vient de « Planning ». Claude y écrit en SQL direct (`created_by` null → « Claude »).
```

Dans `docs/superpowers/specs/2026-07-20-todos-kanban-design.md`, remplacer la ligne de statut de l'en-tête par :

```markdown
**Date** : 2026-07-20 · **Statut** : implémenté (plan `docs/superpowers/plans/2026-07-20-todos-kanban.md`)
```

- [ ] **Step 5: Appliquer la migration en PROD**

⚠️ **Demander l'accord explicite de Benoit avant cette étape** (elle touche la production).

```bash
PROD=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
cd packages/db && supabase db push --db-url "$PROD" --dry-run
```
Attendu : seule `0067_todos.sql` est listée. Puis, après accord :
```bash
cd packages/db && supabase db push --db-url "$PROD"
```
Attendu : `Finished supabase db push.` Vérifier ensuite :
```bash
psql "$PROD" -c "select count(*) from todos;"
```
Attendu : `0`.

- [ ] **Step 6: Commit final (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/todos CLAUDE.md docs/superpowers/specs/2026-07-20-todos-kanban-design.md
git commit -m "feat(todos): filtre par release + documentation de la feature"
```

- [ ] **Step 7: Vérification finale de bout en bout**

Sur la préprod déployée (après merge sur `develop`), en tant que **superadmin** :
1. `/chatter/planning` → onglet Planning inchangé ;
2. onglet To-do → sa propre liste, création/édition/suppression/drag OK ;
3. sélectionner l'autre superadmin → sa liste s'ouvre, on peut y déposer une tâche ;
4. se connecter en **manager** ayant le slug `planning` → il voit sa to-do, la gère, et ne voit **pas** les superadmins dans le sélecteur ;
5. se connecter en **chatteur** → `/chatter/planning` redirige vers `/no-access` (inchangé).

---

### Task 8: Vue liste + bascule, et correctifs du glisser-déposer

> **Cette tâche est née d'une demande de Benoit après la tâche 6** (2026-07-20) : « je voulais
> l'affichage en ligne et kanban, mais en priorité en ligne, avec un onglet pour switcher — et
> fais comme Trello pour le kanban, facile et lisible ». Elle absorbe aussi les **5 défauts
> Important** relevés par la revue de la tâche 6, qui portent sur les mêmes fichiers. Elle
> s'exécute **avant** la tâche 7.

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/planning/page.tsx` (lecture du cookie)
- Modify: `apps/web/src/features/todos/TodosTemplate.tsx`
- Modify: `apps/web/src/features/todos/types.ts` (type de la préférence d'affichage)
- Create: `apps/web/src/features/todos/components/todos-view.tsx` (porteur d'état commun)
- Create: `apps/web/src/features/todos/components/todos-list.tsx`
- Create: `apps/web/src/features/todos/components/todo-row.tsx`
- Create: `apps/web/src/features/todos/components/todo-quick-add.tsx`
- Modify: `apps/web/src/features/todos/components/todos-board.tsx` (devient une feuille)
- Modify: `apps/web/src/features/todos/components/todo-card.tsx`, `todo-column.tsx`

**Interfaces:**
- Consumes: `Todo`, `STATUSES`, `groupByStatus`, les 4 Server Actions (inchangées).
- Produces:
  - `TodoAffichage = 'liste' | 'kanban'` (dans `types.ts`)
  - `<TodosView todos profileId targetHasAccess affichage />` — **seul porteur d'état** :
    `useOptimistic`, dialog, `move()`, `remove()`, `releases`
  - `<TodosList todos onEdit onDelete onMove onQuickAdd />`, `<TodoRow …>`, `<TodoQuickAdd …>`
  - `<TodosBoard todos onEdit onDelete onMove />` — devient une feuille sans état propre
  - `groupByStatus` déplacée hors de `todos-board.tsx` (les deux vues l'utilisent) — la mettre
    dans `types.ts` ou un `lib.ts` de la feature, et mettre à jour les imports.

- [ ] **Step 1: Hisser l'état dans `TodosView`**

Aujourd'hui `todos-board.tsx` porte tout : `useOptimistic`, l'état du dialog, `move()`,
`remove()`, `releases`, les capteurs dnd. Si la vue liste arrive à côté, tout serait dupliqué.

Crée `todos-view.tsx` (`'use client'`) qui reprend **à l'identique** cette logique (état
optimiste, `openCreate`/`openEdit`, `remove`, `move`, calcul de `releases`, `TodoDialog`), plus
l'état d'affichage, et qui rend l'une ou l'autre vue en **rendu conditionnel** :

```tsx
{affichage === 'liste' ? <TodosList … /> : <TodosBoard … />}
```

Pas de `forceMount`, pas de `<Activity>` : les feuilles n'ont aucun état propre à préserver.

`TodosBoard` est réduit à une feuille de présentation : il reçoit `todos` (déjà optimistes) et
`onEdit` / `onDelete` / `onMove`, garde le `DndContext` et les capteurs (ils appartiennent à la
vue kanban), et ne fait plus aucun appel de Server Action.

- [ ] **Step 2: Persister le choix de vue dans un cookie**

`todos_affichage` (`liste` | `kanban`), écrit côté client, lu côté serveur.

- Lecture dans `app/(dash)/chatter/planning/page.tsx` via `cookies()` de `next/headers`, passée
  en prop jusqu'à `TodosView`. Défaut si absent : **`liste`**.
- Écriture côté client en `document.cookie` avec un `max-age` d'un an et `path=/` — le repo a
  déjà exactement cet idiome, lis `apps/web/src/components/ui/sidebar.tsx` (constantes
  `SIDEBAR_COOKIE_NAME` / `SIDEBAR_COOKIE_MAX_AGE` et l'écriture associée) et suis-le.
- L'état local (`useState` initialisé par la prop) pilote l'affichage : la bascule est
  instantanée, sans aller-retour serveur. Le cookie ne sert qu'au prochain chargement.

**Pourquoi pas autre chose** : `localStorage` imposerait un script bloquant en tête de page pour
éviter le flash ; un `?affichage=` alourdirait une URL qui porte déjà `?vue=` et `?membre=` pour
une préférence que personne ne partagera.

- [ ] **Step 3: La bascule**

Un `ToggleGroup` (`@/components/ui/toggle-group`, déjà présent) `type="single"`, deux items
icônes (`List` et `Columns3` de lucide), `size="sm"`, avec un `aria-label` explicite sur chacun
(« Vue liste », « Vue kanban ») — aligné à droite de la ligne d'en-tête de la to-do, dans
`TodosTemplate`.

**Surtout pas des `Tabs`** : la page porte déjà une barre d'onglets (Planning journalier /
To-do) juste au-dessus ; deux barres de même grammaire visuelle rendraient la hiérarchie
illisible. Le toggle icônique se lit comme un réglage d'affichage, pas comme une navigation.

Une bascule ne doit **jamais** être un `ToggleGroup` vide : garde la valeur courante toujours
sélectionnée (`onValueChange` ignore une valeur vide).

- [ ] **Step 4: La vue liste**

`todos-list.tsx` + `todo-row.tsx`. Lignes simples groupées par statut — **pas de `DataTable`** :
il impose des largeurs de colonnes qui étranglent le titre et embarque ~15 ko de client pour
une feature secondaire ; il reste le bon outil pour Membres/Spenders.

- Trois sections (À faire / En cours / Fini), en-tête `titre + compteur` discret, même
  `groupByStatus` que le kanban (source de tri unique).
- **Section « Fini » repliée par défaut** avec `@/components/ui/collapsible` (déjà présent) ;
  les deux autres sont ouvertes.
- Une ligne : pastille de statut cliquable, titre, puis méta à droite (priorité si ≠ normale,
  type, release, auteur), et les actions Modifier/Supprimer comme sur la carte.
- **Changement de statut depuis la ligne** : la pastille ouvre un `DropdownMenu` avec les trois
  statuts (`DropdownMenuRadioGroup`), qui appelle le **même `onMove`** que le kanban. Pas de case
  à cocher (trois états n'y rentrent pas), pas de pastille qui cycle (aucune découvrabilité).
- Densité : une ligne tient sur une ligne. La description n'est pas affichée en vue liste (elle
  reste dans le dialog) — c'est ce qui distingue la liste du kanban.

- [ ] **Step 5: L'ajout rapide en ligne**

`todo-quick-add.tsx`, rendu en bas de la section « À faire » : un champ, on tape un titre,
`Entrée`, la tâche est créée avec les défauts (statut `todo`, priorité normale, pas de type ni
de release).

Deux exigences d'ergonomie, sans lesquelles la saisie en rafale est cassée :
1. le champ est **vidé et regagne le focus immédiatement**, sans attendre la réponse serveur ;
2. si la création échoue, un toast d'erreur le dit et la saisie n'est pas perdue silencieusement.

Utilise `createTodo` telle quelle. Priorité, type et release restent dans le dialog complet.

- [ ] **Step 6: Correctif dnd — la carte suit le curseur**

Revue tâche 6, constat Important 3 : `useDraggable` renvoie un `transform` qui n'est **jamais
consommé**, et il n'y a pas de `DragOverlay`. La carte reste donc immobile pendant le geste :
le dépôt fonctionne, mais l'utilisateur glisse à l'aveugle.

Fais suivre le curseur. Deux voies possibles — choisis-en une et justifie :
- appliquer `transform` sur la carte (`CSS.Translate.toString(transform)` de `@dnd-kit/utilities`
  — vérifie si ce paquet est déjà installé avant de l'ajouter) ;
- ou un `DragOverlay` qui rend une copie de la carte suivant le pointeur.

Garde le retour visuel discret : source en opacité réduite, colonne visée légèrement teintée.
**Pas de rotation, pas d'ombre portée** (design maison).

- [ ] **Step 7: Correctif dnd — poignée dédiée**

Aujourd'hui les `listeners` sont posés sur le titre entier, ce qui met le geste en concurrence
avec le clic. Ajoute une **poignée dédiée** (`GripVertical` de lucide) visible au survol et au
focus clavier (`opacity-0 group-hover:opacity-100 focus-visible:opacity-100` ou équivalent),
`cursor-grab` / `active:cursor-grabbing`, avec un `aria-label` (« Déplacer la tâche »).

Retire les `listeners` du titre. C'est aussi ce qui rend l'affordance visible — l'erreur
classique d'un kanban maison est que rien n'indique qu'une carte se déplace.

- [ ] **Step 8: Correctif dnd — état optimiste, hydratation, resynchronisation**

Trois défauts prouvés par la revue de la tâche 6 :

1. **La carte déposée dans « Fini » atterrit en bas de colonne, puis saute en tête.** Le
   réducteur `useOptimistic` ne pose que `status` ; `groupByStatus` trie « Fini » par `doneAt`
   décroissant, et un `doneAt` absent part en queue. Pose `doneAt` dans le réducteur en même
   temps que le statut (horodatage courant quand le statut devient `done`, `null` sinon).
2. **`DndContext` sans prop `id` provoque une dérive d'identifiants entre serveur et client**
   (dnd-kit numérote ses `aria-describedby` avec un compteur de module, pas `useId`) → erreur
   d'hydratation dès la deuxième requête servie par un même process. Donne-lui un `id` stable.
3. **`move()` ne resynchronise pas** quand le serveur répond « cette tâche n'existe plus » : la
   carte fantôme réapparaît dans sa colonne d'origine. Le handler frère `remove()` traite déjà
   ce cas avec `router.refresh()` — aligne `move()` dessus.

- [ ] **Step 9: Correctif dnd — accessibilité clavier honnête**

Le `KeyboardSensor` est monté sans configuration : il déplace de 25 px par flèche (une quinzaine
d'appuis pour traverser une colonne) et annonce en **anglais** avec l'identifiant brut de la
tâche (« Picked up draggable item 3f2a-… »). Il donne l'illusion d'un second chemin clavier qui
n'en est pas un.

Tranche explicitement, et justifie dans ton rapport :
- soit tu le configures réellement (annonces françaises via `accessibility={{ announcements }}`,
  et un `coordinateGetter` adapté aux colonnes) ;
- soit tu ne le montes pas, le menu « Déplacer vers » restant le chemin clavier officiel — il
  est déjà complet et testé.

Dans les deux cas, le menu « Déplacer vers » reste obligatoire (WCAG 2.5.7).

- [ ] **Step 10: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Les trois verts, 4 warnings ESLint pré-existants seulement.

**Preuves d'exécution obligatoires** (un build vert n'a rien prouvé à la tâche 5, où le
formulaire crashait à l'ouverture). Écris un script jetable dans `/tmp`, en extrayant le code
**verbatim des fichiers livrés** (pas une recopie), et montre les sorties réelles :
1. le réducteur optimiste pose bien `doneAt` → composé avec `groupByStatus`, une carte déplacée
   vers « Fini » ressort **en tête** de sa colonne ;
2. un déplacement vers le statut courant est ignoré ;
3. `groupByStatus` donne le même résultat pour les deux vues.

Puis supprime le script.

**Vérifications navigateur** (à faire par Benoit, à lister dans le rapport) : bascule
liste/kanban et persistance après rechargement, ajout rapide en rafale, changement de statut
depuis la liste, geste de glissement avec la poignée, dépôt dans « Fini ».

- [ ] **Step 11: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/todos apps/web/src/app/\(dash\)/chatter/planning
git commit -m "feat(todos): vue liste + bascule, kanban façon Trello (poignée, transit, ordre optimiste)"
```

---

## Notes d'exécution

- **Ordre des tâches imposé** : 1 → 2 → 3 → 4 → 5 → 6 → **8** → 7. Les tâches 4 à 8 modifient les mêmes fichiers de façon incrémentale ; les exécuter en parallèle provoquerait des conflits. La tâche 8 (ajoutée après coup à la demande de Benoit) restructure les vues et absorbe les correctifs de la revue de la tâche 6 : elle doit donc précéder la tâche 7, dont le filtre par release se pose sur l'en-tête commun aux deux vues.
- **Après chaque tâche**, `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` doivent être verts avant de proposer le commit.
- **Migration prod** : uniquement à l'étape 7.5, avec accord explicite, et **avant** que le code correspondant n'arrive en production (règle « migration = dépendance de déploiement »).
