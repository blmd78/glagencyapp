# Membres — accès managers : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** ouvrir `/chatter/members` aux profils `manager`, qui voient toute la liste mais ne peuvent QUE créer des comptes rôle `user` (chatters), limités à leurs propres modèles.

**Architecture :** RLS élargie en lecture (`is_manager()` + policies `select` sur `profiles`/`profile_creators`) ; mutations inchangées côté base (service-role gardé app). Un prop `viewer: 'admin' | 'manager'` descend de la page aux composants pour masquer édition/suppression/sélecteur de rôle. Spec : `docs/superpowers/specs/2026-07-16-members-manager-access-design.md`.

**Tech Stack :** Next.js 16 (App Router, Server Actions), Supabase (RLS, service-role), Zod, RHF, shadcn/ui.

## Global Constraints

- **Pas de commit automatique** : Benoît valide chaque commit. De plus `apps/web/src/config/workspaces.ts` contient déjà des modifs non commitées (chantier daily-reports) → tout commit de ce fichier doit passer par `git add -p` ou attendre que ce chantier soit commité. Un seul point de commit, en fin de plan, sur demande.
- **Pas d'infra de test dans `apps/web`** (aucun `*.test.*`) : la vérification = `pnpm typecheck` + `pnpm lint` à la racine + vérification runtime (checklist finale). Ne pas introduire Vitest/RTL ici.
- **Jamais d'enum Postgres** : text + check (déjà le cas — ne pas y toucher).
- **Ne pas toucher au design existant** : uniquement masquer des contrôles existants, aucun restyling.
- La migration s'applique avec `supabase db push` (ou SQL Editor du dashboard) — la prod est vivante, l'appliquer seulement à l'étape prévue.
- `profile.role` côté app reste `'admin' | 'user'` (un manager = `'user'` partout ailleurs) ; le nouveau booléen `Profile.manager` est le SEUL marqueur manager.

---

### Task 1 : Migration RLS lecture manager

**Files:**
- Create: `packages/db/supabase/migrations/0048_members_manager_read.sql`

**Interfaces:**
- Produces: fonction SQL `public.is_manager()` ; policies `profiles_self_admin_or_manager_read` et `profile_creators_self_admin_or_manager_read`. Aucun code TS n'en dépend directement (la RLS agit sous `getMembers()` existant).

- [ ] **Step 1 : Écrire la migration**

```sql
-- 0048 — Page Membres ouverte aux managers (LECTURE seule) : is_manager() + policies
-- select élargies sur profiles/profile_creators (liste complète + colonnes Modèles).
-- AUCUNE écriture manager en base : les mutations passent par le service-role gardé
-- côté app ; l'update direct reste verrouillé superadmin/admin (0037/0038).
create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'manager');
$$;
revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;

-- profiles : le manager lit tous les profils (choix produit : il voit toute la liste).
drop policy if exists profiles_self_or_admin_read on profiles;
create policy profiles_self_admin_or_manager_read on profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_manager());

-- profile_creators : idem (assignations modèles affichées dans la liste).
drop policy if exists profile_creators_self_or_admin_read on profile_creators;
create policy profile_creators_self_admin_or_manager_read on profile_creators for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or public.is_manager());
```

- [ ] **Step 2 : Appliquer sur le projet Supabase**

Run (racine du repo) : `supabase db push`
Alternative : coller le SQL dans le SQL Editor du dashboard.
Expected : migration `0048` appliquée sans erreur.

- [ ] **Step 3 : Vérifier les policies**

SQL (dashboard ou psql) :

```sql
select tablename, policyname from pg_policies
where tablename in ('profiles', 'profile_creators') and cmd = 'SELECT';
```

Expected : `profiles_self_admin_or_manager_read` et `profile_creators_self_admin_or_manager_read` présentes ; les anciennes `*_self_or_admin_read` absentes.

---

### Task 2 : `lib/auth` — `Profile.manager` + `requireAdminOrManager()`

**Files:**
- Modify: `apps/web/src/lib/auth/index.ts`

**Interfaces:**
- Produces: `Profile.manager: boolean` ; `requireAdminOrManager(): Promise<Profile>` (redirige `/login` sans session, `/chatter/overview` si ni admin ni manager). Consommés par Tasks 3, 4, 5.

- [ ] **Step 1 : Ajouter le champ `manager` à `Profile` et son mapping**

Dans l'interface `Profile` (après `superadmin`) :

```ts
  /** Rôle base `manager` : accès page Membres (ajout de chatters) — `user` partout ailleurs. */
  manager: boolean
```

Dans le retour de `getProfile()` (après `superadmin:`) :

```ts
    manager: data.role === 'manager',
```

- [ ] **Step 2 : Ajouter la garde**

Après `requireAdmin()` :

```ts
/** Garde page Membres : admin (superadmin compris) OU manager. */
export async function requireAdminOrManager(): Promise<Profile> {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && !profile.manager) redirect('/chatter/overview')
  return profile
}
```

- [ ] **Step 3 : Typecheck**

Run : `pnpm typecheck`
Expected : PASS (0 erreur).

---

### Task 3 : Nav — flag `managerAccess` + sidebar + layout

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (interface `NavItem` + item Membres chatteurs)
- Modify: `apps/web/src/components/app-sidebar.tsx` (prop `isManager` + filtre)
- Modify: `apps/web/src/app/(dash)/layout.tsx` (passe `isManager`)

**Interfaces:**
- Consumes: `Profile.manager` (Task 2).
- Produces: `NavItem.managerAccess?: boolean` ; prop `isManager?: boolean` sur `AppSidebar`.

- [ ] **Step 1 : `workspaces.ts` — flag + item Membres**

Dans `interface NavItem`, après `superadminOnly?: boolean` :

```ts
  /** Item adminOnly AUSSI visible des managers (ex. Membres face chatteurs). */
  managerAccess?: boolean
```

L'item Membres de la face chatteurs devient :

```ts
      { href: '/chatter/members', label: 'Membres', icon: UserCog, adminOnly: true, managerAccess: true, bottom: true },
```

⚠️ Celui de la face marketing (`/marketing/members`) reste inchangé (admin-only).
NB : `PAGE_CHOICES` filtre `!n.adminOnly` → Membres reste non cochable, rien à changer.

- [ ] **Step 2 : `app-sidebar.tsx` — prop + filtre**

Ajouter la prop (après `isSuperadmin`) :

```ts
  /** Rôle manager : voit en plus les items adminOnly marqués managerAccess (Membres). */
  isManager?: boolean
```

(et `isManager,` dans la destructuration des props).

Remplacer le filtre du `useMemo` :

```ts
    return active.nav.filter((item) => {
      if (item.superadminOnly && !isSuperadmin) return false
      if (isAdmin) return true
      if (item.adminOnly) return !!item.managerAccess && !!isManager
      return allowed.has(navSlug(item))
    })
  }, [active, isAdmin, isSuperadmin, isManager, pagesKey])
```

(`isManager` ajouté aux deps du `useMemo` — sinon la sidebar resterait figée.)

- [ ] **Step 3 : `layout.tsx` — passer le prop**

Dans `<AppSidebar …>` (après `isSuperadmin=`) :

```tsx
        isManager={profile.manager}
```

- [ ] **Step 4 : Typecheck**

Run : `pnpm typecheck`
Expected : PASS.

---

### Task 4 : Page + UI — prop `viewer` (masquer édition/suppression/rôle)

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/members/page.tsx`
- Modify: `apps/web/src/features/members/MembersTemplate.tsx`
- Modify: `apps/web/src/features/members/components/members-table.tsx`
- Modify: `apps/web/src/features/members/components/member-dialog.tsx`

**Interfaces:**
- Consumes: `requireAdminOrManager()` (Task 2).
- Produces: prop `viewer?: 'admin' | 'manager'` (défaut `'admin'`) sur `MembersTemplate`, `MembersTable`, `MemberDialog`. `/marketing/members` ne le passe pas → comportement admin inchangé.

- [ ] **Step 1 : `page.tsx` — garde + viewer**

```tsx
import { requireAdminOrManager } from '@/lib/auth'
import { getMembers } from '@/features/members/services/get-members'
import { MembersTemplate } from '@/features/members/MembersTemplate'

export default async function MembersPage() {
  const profile = await requireAdminOrManager()
  const data = await getMembers()
  return <MembersTemplate data={data} viewer={profile.role === 'admin' ? 'admin' : 'manager'} />
}
```

- [ ] **Step 2 : `MembersTemplate.tsx` — pass-through**

Ajouter aux props :

```ts
  /** Manager : lecture seule + ajout de chatters (rôle user forcé) — défaut admin. */
  viewer?: 'admin' | 'manager'
```

(destructurer `viewer = 'admin'`), et passer `viewer={viewer}` à `<MembersTable …>`.

- [ ] **Step 3 : `members-table.tsx` — masquer les actions, propager au dialog**

Ajouter aux props de `MembersTable` :

```ts
  viewer?: 'admin' | 'manager'
```

(destructurer `viewer = 'admin'`).

Colonne `actions`, remplacer le `cell` :

```ts
      cell: ({ row }) =>
        viewer === 'admin' ? <RowActions member={row.original} creators={creators} scope={scope} /> : null,
```

Dans le `toolbar`, passer `viewer={viewer}` au `<MemberDialog …>` (celui de création).
NB : le `MemberDialog` d'édition (dans `RowActions`) n'est rendu que pour un admin — pas de prop à ajouter là.

- [ ] **Step 4 : `member-dialog.tsx` — rôle forcé user, sélecteur masqué**

Ajouter aux props :

```ts
  /** Manager : rôle verrouillé sur user, sélecteur masqué. */
  viewer?: 'admin' | 'manager'
```

(destructurer `viewer = 'admin'`).

`defaultValues.role` devient :

```ts
      role: viewer === 'manager' ? 'user' : member?.role === 'manager' ? 'manager' : 'user',
```

Envelopper le `<Controller name="role" …/>` :

```tsx
          {viewer === 'admin' && <Controller
            name="role"
            control={control}
            render={({ field }) => (
              /* … contenu existant inchangé … */
            )}
          />}
```

- [ ] **Step 5 : Typecheck + lint**

Run : `pnpm typecheck && pnpm lint`
Expected : PASS.

---

### Task 5 : Action `createMember` — garde manager + contraintes serveur

**Files:**
- Modify: `apps/web/src/features/members/actions.ts`

**Interfaces:**
- Consumes: `requireAdminOrManager()` (Task 2) ; `createClient` de `@/lib/supabase/server` (existant).
- Produces: `createMember` accepte un appelant manager (scope chatter, rôle user forcé, `creatorIds ⊆ ses modèles`). `updateMember`/`deleteMember` inchangés (`requireAdmin`).

- [ ] **Step 1 : Imports**

```ts
import { requireAdmin, requireAdminOrManager } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
```

- [ ] **Step 2 : Début de `createMember` — garde + contraintes**

Remplacer le début de `createMember` (jusqu'à la déstructuration incluse) par :

```ts
export async function createMember(input: unknown): Promise<Result> {
  const caller = await requireAdminOrManager()
  const parsed = memberInput.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Saisie invalide (au moins une page requise)' }
  const { scope, email, displayName, pages, creatorIds, workLink } = parsed.data
  let role = parsed.data.role

  // Appelant manager : création restreinte — face chatteurs, rôle user FORCÉ (aucune
  // confiance au client), modèles limités à SON périmètre (profile_creators, RLS self).
  if (caller.role !== 'admin') {
    if (scope !== 'chatter') return { success: false, error: 'Réservé aux admins' }
    role = 'user'
    const supabase = await createClient()
    const { data: own, error: ownErr } = await supabase
      .from('profile_creators')
      .select('creator_id')
      .eq('profile_id', caller.id)
    if (ownErr) return { success: false, error: ownErr.message }
    const allowedCreators = new Set((own ?? []).map((c) => c.creator_id))
    if (creatorIds.some((id) => !allowedCreators.has(id))) {
      return { success: false, error: 'Modèle hors de ton périmètre' }
    }
  }
```

Le reste de la fonction est inchangé : elle utilise déjà `role` (désormais la variable `let`) pour le `if (role === 'manager')`.

- [ ] **Step 3 : Typecheck + lint**

Run : `pnpm typecheck && pnpm lint`
Expected : PASS.

---

### Task 6 : Vérification runtime + commit (sur accord)

**Files:** aucun (vérification).

- [ ] **Step 1 : Vérification runtime (2 comptes : un manager, un admin)**

`pnpm dev`, puis :

1. **Manager** : l'entrée « Membres » apparaît dans la sidebar face Chatteurs, PAS côté Marketing ; la page liste TOUS les comptes ; aucun bouton Modifier/Supprimer ; « Nouveau membre » ouvre le dialog SANS sélecteur de rôle ; les cases « Modèles assignés » ne proposent que SES modèles ; création d'un chatter OK → il apparaît rôle User.
2. **Escalade** : depuis le compte manager, appeler `createMember` avec `role: 'manager'` (payload forgé) → le compte créé est rôle `user` en base.
3. **User simple** : ne voit pas l'entrée Membres ; `/chatter/members` en URL directe → redirigé `/chatter/overview`.
4. **Admin** : page Membres identique à avant (rôle sélectionnable, Modifier/Supprimer présents), les deux faces.

- [ ] **Step 2 : Demander à Benoît avant tout commit**

Rappels : `workspaces.ts` contient AUSSI le chantier daily-reports non commité → `git add -p` sur ce fichier, ou attendre. Stager fichier par fichier, jamais `git add -A`.
