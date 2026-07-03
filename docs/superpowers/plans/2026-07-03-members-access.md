# Membres & droits d'accès — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page Membres admin (CRUD email+OTP, pages accessibles, modèles assignés) avec cloisonnement RLS réel par modèle.

**Architecture:** Migration SQL (role text, pages[], email, RLS scoping via `profile_creators` + `is_admin()`), Server Actions service-role (create/update/delete membre), UI shadcn (cartes + dialog checkboxes), sidebar filtrée + garde `requireAccess(slug)` par page, `get-chatters` bimode (admin = chatter_daily ; user = ventilation chatter_creator_daily).

**Tech Stack:** Next 16 RSC + Server Actions, supabase-js (`@supabase/ssr` + admin service-role de `@glagency/db`), zod, shadcn (Dialog/Checkbox/AlertDialog), psql pour la migration.

## Global Constraints

- **AUCUN commit sans GO explicite de Benoit** (consigne session) : les étapes « commit » sont remplacées par des checkpoints typecheck/build.
- Spec source : `docs/superpowers/specs/2026-07-03-glagency-members-design.md`.
- Rôles : `admin` | `user` — colonne **text + check**, PAS d'enum.
- Migration appliquée via `psql "$DATABASE_URL"` (pattern des migrations 0003+).
- Admins pilotés par allowlist (trigger) : `blmd8345@gmail.com`, `glbagencyy@gmail.com`.
- Conventions archi-web : `app → feature(template) → composants`, mutations en Server Actions, aucun fetch dans features.

---

### Task 1: Migration 0008 — rôles text, pages, email, RLS scoping

**Files:**
- Create: `packages/db/supabase/migrations/0008_members_roles_pages.sql`
- Modify: `packages/db/src/types.ts` (profiles: role→string, +pages, +email)

**Interfaces:**
- Produces: `profiles(role text check in admin|user, pages text[], email citext)`, fonction `public.is_admin() → boolean`, policies scoped. Consommé par Tasks 2-6.

- [ ] **Step 1: Écrire la migration**

```sql
-- 0008 — Membres & droits : role en text (pas d'enum), pages accessibles, email,
-- et RLS de cloisonnement réel par modèle via profile_creators (cf. spec 2026-07-03).

-- ── 1. profiles : role text + check, pages, email ────────────────────────────
alter table profiles alter column role drop default;
alter table profiles alter column role type text using role::text;
update profiles set role = 'user' where role not in ('admin');
alter table profiles add constraint profiles_role_check check (role in ('admin', 'user'));
alter table profiles alter column role set default 'user';
alter table profiles add column if not exists pages text[] not null default '{}';
alter table profiles add column if not exists email citext;

-- Backfill email depuis auth.users (le trigger le posera pour les suivants).
update profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is null;

-- ── 2. Trigger de provisioning : text + email (remplace la version enum 0002) ─
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, email)
  values (
    new.id,
    case
      when lower(new.email) in ('blmd8345@gmail.com', 'glbagencyy@gmail.com') then 'admin'
      else 'user'
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop type if exists app_role;

-- ── 3. Helper admin (security definer = pas de récursion RLS sur profiles) ───
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── 4. RLS : remplace les `using (true)` de 0004 ─────────────────────────────
-- Tables à creator_id : admin OU modèle assigné.
drop policy if exists creators_auth_read on creators;
create policy creators_scoped_read on creators for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = creators.id));

drop policy if exists creator_daily_auth_read on creator_daily;
create policy creator_daily_scoped_read on creator_daily for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = creator_daily.creator_id));

drop policy if exists chatter_creator_daily_auth_read on chatter_creator_daily;
create policy chatter_creator_daily_scoped_read on chatter_creator_daily for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = chatter_creator_daily.creator_id));

drop policy if exists chatter_creators_auth_read on chatter_creators;
create policy chatter_creators_scoped_read on chatter_creators for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = auth.uid() and pc.creator_id = chatter_creators.creator_id));

-- Tables au grain tous-modèles : admin uniquement.
drop policy if exists chatter_daily_auth_read on chatter_daily;
create policy chatter_daily_admin_read on chatter_daily for select to authenticated
  using (public.is_admin());
drop policy if exists chatter_daily_reach_auth_read on chatter_daily_reach;
create policy chatter_daily_reach_admin_read on chatter_daily_reach for select to authenticated
  using (public.is_admin());
drop policy if exists chatter_alias_auth_read on chatter_alias;
create policy chatter_alias_admin_read on chatter_alias for select to authenticated
  using (public.is_admin());
drop policy if exists period_snapshot_kpi_auth_read on period_snapshot_kpi;
create policy period_snapshot_kpi_admin_read on period_snapshot_kpi for select to authenticated
  using (public.is_admin());
drop policy if exists teams_auth_read on teams;
create policy teams_admin_read on teams for select to authenticated
  using (public.is_admin());

-- chatters (noms) : admin OU membre avec au moins un modèle (pour la ventilation).
drop policy if exists chatters_auth_read on chatters;
create policy chatters_scoped_read on chatters for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc where pc.profile_id = auth.uid()));

-- profiles : soi-même ou admin en lecture ; écritures admin (le service-role bypasse de toute façon).
drop policy if exists profiles_auth_read on profiles;
create policy profiles_self_or_admin_read on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profile_creators : lecture soi-même/admin ; écriture admin.
drop policy if exists profile_creators_auth_read on profile_creators;
create policy profile_creators_self_or_admin_read on profile_creators for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy profile_creators_admin_insert on profile_creators for insert to authenticated
  with check (public.is_admin());
create policy profile_creators_admin_delete on profile_creators for delete to authenticated
  using (public.is_admin());
```

- [ ] **Step 2: Appliquer et vérifier**

Run: `cd <repo> && /opt/homebrew/opt/postgresql@15/bin/psql "$DATABASE_URL" -f packages/db/supabase/migrations/0008_members_roles_pages.sql`
Expected: pas d'erreur ; puis `\d profiles` montre `role text`, `pages text[]`, `email citext` ; `select role, email from profiles;` → admins en `admin` avec email rempli.

- [ ] **Step 3: Vérifier le scoping en SQL (simulation JWT)**

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<uuid-user-test>', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from creator_daily;    -- 0 si aucun modèle assigné
select count(*) from chatter_daily;    -- 0 (admin only)
rollback;
```
Expected: 0 partout pour un profil `user` sans assignation ; tout pour un admin.

- [ ] **Step 4: Mettre à jour `packages/db/src/types.ts`** (profiles.Row : `role: string`, `pages: string[]`, `email: string | null` + Insert/Update) puis `pnpm -r --if-present typecheck`
Expected: vert (le typage `app_role` disparaît).

- [ ] **Step 5: Checkpoint** — PAS de commit (GO requis) ; noter la tâche faite dans le plan.

---

### Task 2: Slugs de pages + garde d'accès serveur

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (export `PAGE_CHOICES`, `pageSlug`)
- Modify: `apps/web/src/lib/auth.ts` (ajouter `getProfile()`, `requireAccess(slug)`, `requireAdmin()`)
- Modify: `apps/web/src/app/(dash)/layout.tsx` (rôle réel + pages → sidebar)
- Modify: `apps/web/src/components/app-sidebar.tsx` (filtrer la nav par pages)
- Modify (1 ligne chacune): `apps/web/src/app/(dash)/chatter/{overview,insights,chatters,modeles,health,quotas,compta}/page.tsx`

**Interfaces:**
- Produces: `pageSlug('/chatter/modeles') === 'modeles'` ; `PAGE_CHOICES: { slug, label }[]` (pages cochables, SANS members) ; `getProfile(): Promise<{ role: 'admin'|'user'; pages: string[] } | null>` ; `requireAccess(slug: string)` (redirect si interdit) ; `requireAdmin()` (redirect si non-admin). Consommé par Tasks 3-5.

- [ ] **Step 1: workspaces.ts**

```ts
/** Slug d'accès d'une page = dernier segment de son href (`/chatter/modeles` → `modeles`). */
export const pageSlug = (href: string) => href.split('/').pop() as string

/** Pages cochables dans la gestion des membres (tout sauf Membres, admin only). */
export const PAGE_CHOICES = DEFAULT_WORKSPACE.nav
  .filter((n) => !n.adminOnly)
  .map((n) => ({ slug: pageSlug(n.href), label: n.label, icon: n.icon }))
```

- [ ] **Step 2: lib/auth.ts** — à côté de `requireUser` existant :

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface Profile {
  id: string
  role: 'admin' | 'user'
  pages: string[]
  displayName: string | null
}

/** Profil de l'utilisateur connecté (RLS : chacun lit le sien). Null si non connecté. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, role, pages, display_name')
    .eq('id', user.id)
    .single()
  if (!data) return null
  return {
    id: data.id,
    role: data.role === 'admin' ? 'admin' : 'user',
    pages: data.pages ?? [],
    displayName: data.display_name,
  }
}

/** Garde de page : admin passe toujours ; `user` doit avoir le slug dans profiles.pages. */
export async function requireAccess(slug: string): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.pages.includes(slug)) {
    redirect(profile.pages[0] ? `/chatter/${profile.pages[0]}` : '/login')
  }
  return profile
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/chatter/overview')
  return profile
}
```

- [ ] **Step 3: layout + sidebar** — layout lit `getProfile()` (remplace le TODO `isAdmin = true`), passe `role`/`pages` à `AppSidebar` ; la sidebar filtre : admin → tout ; user → `nav.filter(n => !n.adminOnly && pages.includes(pageSlug(n.href)))`.

- [ ] **Step 4: 1 ligne en tête de chaque page protégée** — ex. `apps/web/src/app/(dash)/chatter/modeles/page.tsx` : `await requireAccess('modeles')` (idem overview/insights/chatters/health/quotas/compta avec leur slug ; members utilisera `requireAdmin()` en Task 4).

- [ ] **Step 5: `pnpm typecheck` + test manuel admin** (rien ne change pour toi) — checkpoint sans commit.

---

### Task 3: Feature members — types, service, Server Actions

**Files:**
- Modify: `apps/web/src/features/members/types.ts`
- Modify: `apps/web/src/features/members/services/get-members.ts` (renommer le scaffold `services/` existant si besoin)
- Modify: `apps/web/src/features/members/actions.ts`

**Interfaces:**
- Produces: `Member { id, email, displayName, role, pages, creatorIds, createdAt }`, `MembersData { members: Member[]; creators: {id,name}[] }` (les choix de pages viennent de `PAGE_CHOICES`, importé directement par l'UI), `getMembers(): Promise<MembersData>`, actions `createMember(input)`, `updateMember(input)`, `deleteMember(id)` → `{ success: true } | { success: false; error: string }`. Consommé par Task 4.

- [ ] **Step 1: types.ts**

```ts
export interface Member {
  id: string
  email: string
  displayName: string
  role: 'admin' | 'user'
  pages: string[]
  creatorIds: string[]
  createdAt: string
}

export interface MembersData {
  members: Member[]
  creators: { id: string; name: string }[]
}
```

- [ ] **Step 2: services/get-members.ts** (lecture via client RLS — l'appelant est déjà gardé admin)

```ts
import { createClient } from '@/lib/supabase/server'
import type { Member, MembersData } from '../types'

/** Liste des membres + modèles assignables (page admin — RLS : admin lit tout). */
export async function getMembers(): Promise<MembersData> {
  const supabase = await createClient()
  const [{ data: profiles }, { data: links }, { data: creators }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name, role, pages, created_at').order('created_at'),
    supabase.from('profile_creators').select('profile_id, creator_id'),
    supabase.from('creators').select('id, name').eq('excluded', false).order('name'),
  ])
  const byProfile = new Map<string, string[]>()
  for (const l of links ?? []) {
    byProfile.set(l.profile_id, [...(byProfile.get(l.profile_id) ?? []), l.creator_id])
  }
  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email ?? '—',
    displayName: p.display_name ?? (p.email ?? '').split('@')[0],
    role: p.role === 'admin' ? 'admin' : 'user',
    pages: p.pages ?? [],
    creatorIds: byProfile.get(p.id) ?? [],
    createdAt: p.created_at,
  }))
  return { members, creators: creators ?? [] }
}
```

- [ ] **Step 3: actions.ts** (`'use server'`) — zod + garde admin + service-role

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@glagency/db'
import { requireAdmin } from '@/lib/auth'
import { PAGE_CHOICES } from '@/config/workspaces'

const SLUGS = PAGE_CHOICES.map((p) => p.slug) as [string, ...string[]]

const memberInput = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(60),
  pages: z.array(z.enum(SLUGS)).max(SLUGS.length),
  creatorIds: z.array(z.string().uuid()).max(50),
})

type Result = { success: true } | { success: false; error: string }

/** Crée le compte auth (email confirmé → OTP direct), le profil `user`, pages + modèles. */
export async function createMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { email, displayName, pages, creatorIds } = parsed.data

  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !created.user) return { success: false, error: error?.message ?? 'Création refusée' }
  const uid = created.user.id

  // Le trigger a posé le profil : on écrit display_name/pages (service-role, idempotent).
  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, pages, role: 'user' })
    .eq('id', uid)
  if (pErr) return { success: false, error: pErr.message }
  if (creatorIds.length) {
    const { error: cErr } = await admin
      .from('profile_creators')
      .insert(creatorIds.map((creator_id) => ({ profile_id: uid, creator_id })))
    if (cErr) return { success: false, error: cErr.message }
  }
  revalidatePath('/chatter/members')
  return { success: true }
}

const updateInput = memberInput.omit({ email: true }).extend({ id: z.string().uuid() })

export async function updateMember(input: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = updateInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide' }
  const { id, displayName, pages, creatorIds } = parsed.data

  const admin = createAdminClient()
  // Un admin n'est pas éditable depuis l'UI (rôle piloté par l'allowlist).
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).single()
  if (!target) return { success: false, error: 'Profil introuvable' }
  if (target.role === 'admin') return { success: false, error: 'Un admin ne se modifie pas ici' }

  const { error: pErr } = await admin
    .from('profiles')
    .update({ display_name: displayName, pages })
    .eq('id', id)
  if (pErr) return { success: false, error: pErr.message }
  await admin.from('profile_creators').delete().eq('profile_id', id)
  if (creatorIds.length) {
    const { error: cErr } = await admin
      .from('profile_creators')
      .insert(creatorIds.map((creator_id) => ({ profile_id: id, creator_id })))
    if (cErr) return { success: false, error: cErr.message }
  }
  revalidatePath('/chatter/members')
  return { success: true }
}

export async function deleteMember(id: unknown): Promise<Result> {
  await requireAdmin()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { success: false, error: 'Id invalide' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('role').eq('id', parsed.data).single()
  if (target?.role === 'admin') return { success: false, error: 'Un admin ne se supprime pas ici' }
  // Supprime le compte auth → profiles/profile_creators suivent par cascade FK.
  const { error } = await admin.auth.admin.deleteUser(parsed.data)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/members')
  return { success: true }
}
```

- [ ] **Step 4: `pnpm typecheck`** — checkpoint sans commit.

---

### Task 4: UI — page Membres (liste + dialog + suppression)

**Files:**
- Create: `apps/web/src/components/ui/checkbox.tsx` + `apps/web/src/components/ui/alert-dialog.tsx` (shadcn ; `pnpm add @radix-ui/react-checkbox @radix-ui/react-alert-dialog` dans apps/web)
- Modify: `apps/web/src/features/members/MembersTemplate.tsx`
- Create: `apps/web/src/features/members/components/member-card.tsx`
- Create: `apps/web/src/features/members/components/member-dialog.tsx` (`'use client'`)
- Modify: `apps/web/src/app/(dash)/chatter/members/page.tsx`

**Interfaces:**
- Consumes: `getMembers`, actions Task 3, `PAGE_CHOICES`, `modelColor`, `STATUS_COLORS`.
- Produces: page `/chatter/members` fonctionnelle.

- [ ] **Step 1: page.tsx**

```tsx
import { requireAdmin } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'

export default async function MembersPage() {
  await requireAdmin()
  const data = await getMembers()
  return <MembersTemplate data={data} />
}
```

- [ ] **Step 2: MembersTemplate** — header (« Membres », sous-titre « comptes, pages accessibles et modèles assignés ») + bouton « Nouveau membre » (ouvre `MemberDialog` sans membre) + grille de `MemberCard`.

- [ ] **Step 3: member-card.tsx** — Card shadcn : Avatar initiales (`displayName`), nom + email, badge rôle (`STATUS_COLORS.positive` pour admin, neutre pour user), lignes « PAGES » (badges avec icônes `PAGE_CHOICES`) et « MODÈLES » (badges `modelColor`), date `créé le …`, actions : bouton Modifier (ouvre `MemberDialog` prérempli — masqué pour un admin) + Supprimer (AlertDialog de confirmation → `deleteMember`). Un admin affiche « toutes les pages · tous les modèles ».

- [ ] **Step 4: member-dialog.tsx** (`'use client'`) — Dialog shadcn contrôlé. Champs : email (Input, `disabled` si édition), nom affiché (Input), « Pages accessibles » (grille 2-3 col de `<Checkbox>` + label icône, état local `Set<string>`), « Modèles assignés » (idem avec badges `modelColor`). Submit → `createMember`/`updateMember` via `useTransition`, erreurs affichées en rouge sous le formulaire, succès → close + `router.refresh()`.

- [ ] **Step 5: `pnpm typecheck && pnpm build`** — vert ; test manuel : créer un membre test (email jetable réel), le voir listé, modifier ses cases, supprimer un autre essai. Checkpoint sans commit.

---

### Task 5: get-chatters bimode (user restreint)

**Files:**
- Modify: `apps/web/src/features/chatters/services/get-chatters.ts`
- Modify: `apps/web/src/features/chatters/types.ts` (`presenceActiveH/presenceIdleH: number | null`, `restricted?: boolean` sur ChattersData)
- Modify: `apps/web/src/features/chatters/components/chatters-table.tsx` (colonnes présence/com/statut/« Prop./Vendu » global affichent `—` si null / masquées si `restricted`)
- Modify: `apps/web/src/app/(dash)/chatter/chatters/page.tsx` (passe le rôle du `requireAccess('chatters')`)

**Interfaces:**
- Consumes: `Profile` de Task 2.
- Produces: `getChatters(period, { restricted: boolean })` — en mode restreint, agrège UNIQUEMENT `chatter_creator_daily` (RLS-filtré aux modèles du membre) : ca/ppv/tips/vendu réels, `com=0`, `propose=0`, présence/réactivité `null`.

- [ ] **Step 1:** signature `getChatters(period, opts?: { restricted?: boolean })` ; si `restricted`, sauter la requête `chatter_daily` (vide de toute façon) et construire les `ChatterRow` depuis l'agrégat `chatter_creator_daily` (mêmes maps `bd`/`assigned` déjà présentes) ; sinon comportement actuel inchangé.
- [ ] **Step 2:** page chatters : `const profile = await requireAccess('chatters')` → `getChatters(period, { restricted: profile.role !== 'admin' })`.
- [ ] **Step 3:** table : cellules présence/réactivité/com → `—` quand null ; badge Statut masqué en restreint.
- [ ] **Step 4:** `pnpm typecheck` — l'admin ne voit AUCUNE différence. Checkpoint sans commit.

---

### Task 6: Secrets Worker web + vérification bout-en-bout

**Files:** aucun (ops)

- [ ] **Step 1:** `cd apps/web && printf '%s' "$(grep '^SUPABASE_URL=' ../../.env | cut -d= -f2-)" | npx wrangler secret put SUPABASE_URL` (idem `SUPABASE_SECRET_KEY`) — requis par `createAdminClient` dans les Server Actions en prod.
- [ ] **Step 2:** `pnpm cf:deploy` → tester sur l'URL prod : page Membres (admin), création d'un membre test avec 2 pages + 2 modèles.
- [ ] **Step 3:** Connexion avec le membre test (navigation privée) : sidebar réduite, page interdite → redirection, Overview/Modèles/Santé = SES modèles uniquement (vérif réseau : aucune ligne étrangère), Chatters = ventilation restreinte.
- [ ] **Step 4:** Vérif admin inchangé + suppression du membre test → sa connexion échoue.
- [ ] **Step 5:** Checkpoint final — demander le GO de commit à Benoit (un seul commit d'ensemble ou par tâche, à sa préférence).
