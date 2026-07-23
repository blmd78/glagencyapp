# Impersonation « Consulter / agir en tant que » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un admin/superadmin clique un membre (manager/sous-manager/police/chatteur) dans Membres et voit/agit exactement comme lui, via sa vraie session Supabase, avec sortie garantie.

**Architecture:** Session forgée `generateLink('magiclink')`+`verifyOtp('magiclink')` → cookies d'auth = la cible → RLS + branches applicatives scopent. État d'impersonation matérialisé en base (row `impersonation_sessions`) ; cookie = id opaque signé HMAC. Sortie = **re-mint** de la session admin (aucun token stocké) + révocation locale de la session forgée. TTL 30 min + teardown proxy + tripwire rôle.

**Tech Stack:** Next.js 16 (App Router/RSC/Server Actions, `cacheComponents`), `@supabase/ssr` (OTP email), Supabase RLS, `runAction`/`BusinessError` (`lib/actions.ts`), Sentry (`@sentry/nextjs`), Vitest (`packages/core`).

## Global Constraints (repris du spec, valeurs exactes)

- **Allowlist impersonnable = `['manager','sous-manager','police','chatteur']`** (fail-closed sur le rôle BRUT `profiles.role` relu par `targetId` via service-role). Jamais admin/superadmin. Jamais de role/email venant du client.
- **Appelant = admin OU superadmin** (`adminGuard` : `getProfile().role === 'admin'` couvre les 2 via le collapse `auth/index.ts:68`).
- **`generateLink` ET `verifyOtp` en `type:'magiclink'`** ; forger sur un client SSR **dédié, non-`cache()`, `setAll` qui THROW** ; **asserter `getClaims().sub === targetId`** avant tout commit.
- **Cible résolue par id** : `admin.auth.admin.getUserById(targetId)` pour l'email courant ; rejeter si email absent ou `email_confirmed_at` null. Jamais `profiles.email`.
- **Aucun token (admin/cible) stocké** en cookie ni en base. Cookie `imp_sid` = `{sid, exp}` **HMAC-SHA256** (`IMPERSONATION_COOKIE_SECRET`, dédié, jamais `NEXT_PUBLIC_*`), `httpOnly secure sameSite=lax`, `maxAge=1800`. Vérif signature **constant-time avant usage**.
- **TTL 30 min** (`expires_at = now()+30min`). Teardown proxy si expiré/incohérent. Tripwire : rôle cible re-vérifié à chaque nav ; hors allowlist → stop.
- **Sortie** : re-mint admin (assert `sub===actorId` + rôle admin/superadmin) → révoquer forgé `signOut(forgedAccess,'local')` (snapshot AVANT restore) → `ended_at` → clear cookie. **Jamais** de signout global sur une session forgée. Fallback = logout complet + clear tous cookies.
- **Write-capable** : breadcrumb Sentry `{real_actor, target, action}` sur chaque mutation tant que `imp_sid` présent ; `deleteMember`/`createMember`/`updateMember` **bloqués** en impersonation.
- **CSRF** : épingler `serverActions.allowedOrigins` (domaine prod) dans `next.config.ts`.
- **Sentry** : jamais logger `token_hash`/access/refresh. `captureMessage` = ids + timestamp only.
- **Migrations** : prochain numéro = **`0081`**. Convention `text`+`check`, jamais d'enum. Appliquer via `supabase db push --db-url`. RLS `security invoker` par défaut ; fonctions `security definer set search_path=public stable` + `revoke/grant`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `packages/db/supabase/migrations/0081_impersonation_sessions.sql` | Table état/audit + RLS lecture admin |
| `packages/core/src/impersonation/rules.ts` (+ `.test.ts`) | **Pur, testé** : `IMPERSONATION_ROLES`, `isImpersonatable(role)`, `signState/verifyState` (HMAC), `isExpired` |
| `packages/core/src/index.ts` | ré-export du module impersonation |
| `apps/web/.env.example` + `apps/web/src/lib/env.ts` | `IMPERSONATION_COOKIE_SECRET` (server env, validé) |
| `apps/web/next.config.ts` | `serverActions.allowedOrigins` |
| `apps/web/src/lib/impersonation/session.ts` | Glue app : client SSR dédié, `forgeSessionInto`, `revokeForged`, get/set/clear `imp_sid`, CRUD row |
| `apps/web/src/features/impersonation/actions.ts` | `startImpersonation`, `stopImpersonation` (+ gardes, atomicité, re-mint) |
| `apps/web/src/features/impersonation/components/impersonation-banner.tsx` | Bandeau (Server Component) + `countdown.tsx` (îlot client) |
| `apps/web/src/features/impersonation/read-state.ts` | `getImpersonationState()` : lit `imp_sid` vérifié + row → `{active, targetName, expiresAt, actorId}` |
| `apps/web/src/features/members/components/{members-table.tsx, impersonate-button.tsx}` | Déclencheur ligne (admin only, lignes impersonnables, confirm) |
| `apps/web/src/components/nav-user.tsx` | Neutraliser « Déconnexion » en impersonation |
| `apps/web/src/proxy.ts` | Teardown TTL + tripwire rôle |
| `apps/web/src/app/(dash)/layout.tsx` | Montage bandeau |
| `apps/web/src/features/members/{actions.ts, authz.ts}` | Garde impersonation sur mutations + attribution Sentry |

---

## Task 1 : Migration `impersonation_sessions`

**Files:** Create `packages/db/supabase/migrations/0081_impersonation_sessions.sql` ; Modify `packages/db/src/types.ts` (regen).

**Produces:** table `public.impersonation_sessions(id uuid pk, actor_id uuid, target_id uuid, actor_email text, target_email text, started_at timestamptz, expires_at timestamptz, ended_at timestamptz null)`.

- [ ] **Step 1** — Écrire la migration (pattern `0067_todos.sql` : table + `enable row level security` + policy select ; pas de policy write → écriture via service-role uniquement) :
```sql
-- 0081 — État d'impersonation (source de vérité + teardown/TTL + audit). Écriture: service-role
-- (Server Actions) uniquement → aucune policy insert/update/delete. Lecture: admin/superadmin.
create table public.impersonation_sessions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references public.profiles(id) on delete cascade,
  target_id    uuid not null references public.profiles(id) on delete cascade,
  actor_email  text not null,
  target_email text not null,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  ended_at     timestamptz
);
create index impersonation_sessions_active_idx on public.impersonation_sessions (id) where ended_at is null;
alter table public.impersonation_sessions enable row level security;
create policy impersonation_sessions_read on public.impersonation_sessions for select to authenticated
  using ((select public.is_admin()));
```
- [ ] **Step 2** — Appliquer sur l'**UAT** (jamais prod ici) : `cd packages/db && echo y | supabase db push --db-url "$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')"`. Attendu : « Applying migration 0081… ».
- [ ] **Step 3** — Régénérer les types : `pnpm db:types` (ou ajouter manuellement le type `impersonation_sessions` à `packages/db/src/types.ts` si le générateur n'est pas câblé au remote). Vérifier que `Database['public']['Tables']['impersonation_sessions']` existe.
- [ ] **Step 4** — Commit : `git add -A && git commit -m "feat(db): impersonation_sessions (état + audit) [0081]"`.

---

## Task 2 : Règles pures (packages/core) — testées

**Files:** Create `packages/core/src/impersonation/rules.ts`, `packages/core/src/impersonation/rules.test.ts` ; Modify `packages/core/src/index.ts`.

**Produces:**
- `IMPERSONATION_ROLES = ['manager','sous-manager','police','chatteur'] as const`
- `isImpersonatable(role: string | null | undefined): boolean`
- `signState(payload: {sid: string; exp: number}, secret: string): string` (format `base64url(json).hmacHex`)
- `verifyState(cookie: string | undefined, secret: string): {sid: string; exp: number} | null` (HMAC `timingSafeEqual`, retourne null si signature/format KO)
- `isExpired(exp: number, nowMs: number): boolean`

**Interfaces:** dépend uniquement de `node:crypto` (`createHmac`, `timingSafeEqual`). Pur → testable Vitest.

- [ ] **Step 1** — Écrire le test (échoue d'abord) `rules.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { isImpersonatable, signState, verifyState, isExpired } from './rules'
const SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx'
describe('isImpersonatable', () => {
  it('accepte les rôles opérationnels', () => {
    for (const r of ['manager','sous-manager','police','chatteur']) expect(isImpersonatable(r)).toBe(true)
  })
  it('refuse admin/superadmin/user/null (fail-closed)', () => {
    for (const r of ['admin','superadmin','user','',null,undefined]) expect(isImpersonatable(r as string)).toBe(false)
  })
})
describe('signState/verifyState', () => {
  it('round-trip', () => {
    const s = signState({ sid: 'abc', exp: 123 }, SECRET)
    expect(verifyState(s, SECRET)).toEqual({ sid: 'abc', exp: 123 })
  })
  it('rejette signature falsifiée', () => {
    const s = signState({ sid: 'abc', exp: 123 }, SECRET)
    expect(verifyState(s.slice(0, -2) + 'ff', SECRET)).toBeNull()
    expect(verifyState(s, SECRET + 'x')).toBeNull()
    expect(verifyState(undefined, SECRET)).toBeNull()
    expect(verifyState('garbage', SECRET)).toBeNull()
  })
})
describe('isExpired', () => {
  it('vrai après exp', () => { expect(isExpired(1000, 1001)).toBe(true); expect(isExpired(1000, 999)).toBe(false) })
})
```
- [ ] **Step 2** — Lancer, vérifier l'échec : `pnpm --filter @glagency/core test`. Attendu : FAIL (module introuvable).
- [ ] **Step 3** — Implémenter `rules.ts` (allowlist en dur, HMAC base64url + `timingSafeEqual`, parse défensif) :
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
export const IMPERSONATION_ROLES = ['manager', 'sous-manager', 'police', 'chatteur'] as const
export function isImpersonatable(role: string | null | undefined): boolean {
  return role != null && (IMPERSONATION_ROLES as readonly string[]).includes(role)
}
const b64u = (s: string) => Buffer.from(s).toString('base64url')
function hmac(data: string, secret: string) { return createHmac('sha256', secret).update(data).digest('hex') }
export function signState(payload: { sid: string; exp: number }, secret: string): string {
  const body = b64u(JSON.stringify(payload))
  return `${body}.${hmac(body, secret)}`
}
export function verifyState(cookie: string | undefined, secret: string): { sid: string; exp: number } | null {
  if (!cookie || !cookie.includes('.')) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  const expected = hmac(body, secret)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (typeof p?.sid === 'string' && typeof p?.exp === 'number') return { sid: p.sid, exp: p.exp }
  } catch { /* falsifié */ }
  return null
}
export function isExpired(exp: number, nowMs: number): boolean { return nowMs >= exp }
```
- [ ] **Step 4** — Lancer, vérifier le succès : `pnpm --filter @glagency/core test`. Attendu : PASS.
- [ ] **Step 5** — Ré-exporter dans `packages/core/src/index.ts` : `export * from './impersonation/rules'`.
- [ ] **Step 6** — Commit : `git add -A && git commit -m "feat(core): règles impersonation (allowlist + cookie signé) — testé"`.

---

## Task 3 : Env + config

**Files:** Modify `apps/web/.env.example`, `apps/web/src/lib/env.ts` (env serveur), `apps/web/next.config.ts`, racine `.env` + `.env.local` (valeurs réelles, non commitées).

**Interfaces:** Produces `getServerEnv().impersonationCookieSecret` (ou lecture directe `process.env.IMPERSONATION_COOKIE_SECRET` validée).

- [ ] **Step 1** — `.env.example` : ajouter une section
```
# ─── Impersonation ──
# Secret HMAC dédié pour signer le cookie d'état (≠ clés Supabase). openssl rand -hex 32
IMPERSONATION_COOKIE_SECRET=
```
- [ ] **Step 2** — Générer les valeurs et les poser dans `.env` (prod runtime) ET `.env.local` (UAT/local) à la racine : `openssl rand -hex 32`. (Ne pas committer ; Vercel : ajouter la var côté dashboard Production + Preview.)
- [ ] **Step 3** — `lib/env.ts` : ajouter la validation server-side (le fichier valide déjà les clés Supabase via Zod). Exposer un getter `getImpersonationSecret(): string` qui throw si absent/trop court (`min(32)`).
- [ ] **Step 4** — `next.config.ts` : ajouter dans `nextConfig` (top-level, Next 16) :
```ts
serverActions: { allowedOrigins: ['glagencyapp-web.vercel.app'] },
```
- [ ] **Step 5** — `pnpm --filter @glagency/web typecheck` (vert) ; commit `chore(config): secret impersonation + allowedOrigins`.

---

## Task 4 : Glue session (`lib/impersonation/session.ts`)

**Files:** Create `apps/web/src/lib/impersonation/session.ts`.

**Interfaces — Produces (signatures consommées par Task 5/6/7) :**
- `forgeSessionInto(email: string, expectedUserId: string): Promise<void>` — generateLink('magiclink')+verifyOtp('magiclink') sur un **client SSR dédié non-cache lié aux cookies mutables**, assert `getClaims().sub===expectedUserId`, throw sinon.
- `revokeForged(accessToken: string): Promise<void>` — `createAdminClient().auth.admin.signOut(accessToken, 'local')`, best-effort.
- `readForgedAccessToken(): Promise<string | null>` — lit le cookie de session courant (le forgé) pour snapshot.
- `setStateCookie(sid: string, expMs: number): Promise<void>` / `clearStateCookie(): Promise<void>` — pose/efface `imp_sid` signé (helpers core + `getImpersonationSecret`), `httpOnly secure sameSite=lax maxAge=1800`.
- `readStateCookie(): Promise<{sid: string; exp: number} | null>` — `verifyState` du cookie.
- `createRow(actor, target): Promise<string>` (retourne sid) / `endRow(sid)` / `getActorForSid(sid): Promise<{actorId, expiresAt} | null>` — CRUD service-role sur `impersonation_sessions`.

**Interfaces — Consumes:** `createAdminClient` (`@glagency/db`), `createServerClient` (`@supabase/ssr`) avec un `cookies()` mutable dédié (PAS `lib/supabase/server.ts` qui est `cache()` + swallow), `signState/verifyState/isExpired` (`@glagency/core`), `getImpersonationSecret` (Task 3).

- [ ] **Step 1** — Implémenter le **client SSR dédié** (non mémoïsé) dont `setAll` **throw** en cas d'échec (contrairement à `server.ts:32`), lié à `await cookies()` :
```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'
async function forgeClient() {
  const store = await cookies()
  const env = getPublicEnv()
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { for (const { name, value, options } of list) store.set(name, value, options) }, // throw si KO
    },
  })
}
```
- [ ] **Step 2** — `forgeSessionInto(email, expectedUserId)` : `admin.auth.admin.generateLink({ type:'magiclink', email })` → `token_hash = data.properties.hashed_token` ; `client = await forgeClient()` ; `await client.auth.verifyOtp({ type:'magiclink', token_hash })` ; `const { data: { claims } } = await client.auth.getClaims()` ; `if (claims?.sub !== expectedUserId) throw new Error('forge:sub-mismatch')`. **Jamais** logger `token_hash`.
- [ ] **Step 3** — `revokeForged`, `readForgedAccessToken` (lire le cookie `sb-<ref>-auth-token` via `getAll()` et en extraire l'access token, ou `client.auth.getSession()` sur un client lié aux cookies), `set/clear/readStateCookie` (helpers core + secret), CRUD row (service-role).
- [ ] **Step 4** — `pnpm --filter @glagency/web typecheck` (vert). Pas de test unit possible ici (pas de runner apps/web + effets cookies/réseau) → couvert e2e/manuel (Task 11).
- [ ] **Step 5** — Commit : `feat(impersonation): helpers session (forge/révoque/cookie signé/état)`.

---

## Task 5 : Server Actions `start`/`stop`

**Files:** Create `apps/web/src/features/impersonation/actions.ts`.

**Interfaces — Produces:** `startImpersonation(targetId: string): Promise<ActionResult>`, `stopImpersonation(): Promise<ActionResult>`.
**Consumes:** Task 4 (session helpers), `getProfile` (`@/lib/auth`), `createAdminClient`, `adminGuard`/`runAction`/`BusinessError` (`@/lib/actions`), `isImpersonatable` (`@glagency/core`), `redirect` (`next/navigation`), `Sentry` (`@sentry/nextjs`).

- [ ] **Step 1** — `startImpersonation` (ordre : garde appelant → nesting → résoudre cible par id → allowlist rôle brut → row → forge (rollback si échec) → cookie → Sentry → redirect) :
```ts
'use server'
export async function startImpersonation(targetId: string): Promise<ActionResult> {
  return runAction({
    schema: z.uuid(), input: targetId, guard: adminGuard,
    handler: async (id) => {
      const caller = await getProfile()
      if (!caller || caller.role !== 'admin') throw new BusinessError('Accès refusé')
      if (await readStateCookie()) throw new BusinessError('Déjà en consultation') // no nesting
      const admin = createAdminClient()
      // cible: rôle BRUT via profiles + email COURANT via getUserById (fail-closed)
      const { data: prof } = await admin.from('profiles').select('role').eq('id', id).single()
      if (!isImpersonatable(prof?.role)) throw new BusinessError('Membre non consultable')
      const { data: tu } = await admin.auth.admin.getUserById(id)
      if (!tu?.user?.email || !tu.user.email_confirmed_at) throw new BusinessError('Compte cible sans email confirmé')
      const { data: au } = await admin.auth.admin.getUserById(caller.id) // email admin (re-mint à la sortie)
      const sid = await createRow({ id: caller.id, email: au!.user!.email! }, { id, email: tu.user.email })
      try {
        await forgeSessionInto(tu.user.email, id) // écrase le cookie d'auth par la session cible
      } catch (e) {
        // rollback : re-mint admin + fermer la row
        await forgeSessionInto(au!.user!.email!, caller.id).catch(() => {})
        await endRow(sid)
        throw new BusinessError('Impossible de démarrer la consultation')
      }
      await setStateCookie(sid, Date.now() + 30 * 60_000)
      Sentry.captureMessage('impersonate:start', { level: 'info', extra: { actor_id: caller.id, target_id: id } })
      redirect('/')
    },
  })
}
```
- [ ] **Step 2** — `stopImpersonation` (snapshot forgé AVANT restore → re-mint admin + assert → révoquer forgé → endRow → clear cookie → Sentry ; fallback logout sur toute erreur) :
```ts
export async function stopImpersonation(): Promise<ActionResult> {
  return runAction({
    schema: z.void(), input: undefined, guard: async () => ({ ok: true }),
    handler: async () => {
      const state = await readStateCookie()
      if (!state) { await fullLogout(); return }
      const row = await getActorForSid(state.sid)
      const forged = await readForgedAccessToken()
      try {
        if (!row) throw new Error('row introuvable')
        const admin = createAdminClient()
        const { data: au } = await admin.auth.admin.getUserById(row.actorId)
        if (!au?.user?.email) throw new Error('admin sans email')
        await forgeSessionInto(au.user.email, row.actorId) // re-mint admin, assert sub===actorId
        const { data: prof } = await admin.from('profiles').select('role').eq('id', row.actorId).single()
        if (prof?.role !== 'admin' && prof?.role !== 'superadmin') throw new Error('acteur non-admin')
        if (forged) await revokeForged(forged)
        await endRow(state.sid)
        await clearStateCookie()
        Sentry.captureMessage('impersonate:stop', { level: 'info', extra: { actor_id: row.actorId } })
      } catch {
        if (forged) await revokeForged(forged).catch(() => {})
        await fullLogout() // clear TOUS cookies (auth + imp_*)
      }
      redirect('/chatter/members')
    },
  })
}
```
- [ ] **Step 3** — `fullLogout()` : effacer les cookies `sb-*-auth-token*` + `imp_sid` (via `cookies().delete`). Typecheck vert.
- [ ] **Step 4** — Commit : `feat(impersonation): actions start/stop (gardes fail-closed, re-mint, révocation)`.

---

## Task 6 : Teardown TTL + tripwire (`proxy.ts`)

**Files:** Modify `apps/web/src/proxy.ts`.

**Interfaces — Consumes:** `readStateCookie`, `isExpired` (`@glagency/core`), `createAdminClient`, `isImpersonatable`. Produces : rien (effet de bord = force stop via redirect `/chatter/members?imp_expired=1` ou nettoyage cookies dans la réponse).

- [ ] **Step 1** — Après `getClaims()` dans `proxy`, si `imp_sid` présent : `state = verifyState(cookie, secret)` ; si `!state` **ou** `isExpired(state.exp, Date.now())` → effacer `imp_sid` + les cookies d'auth sur la réponse (teardown côté proxy ; la révocation GoTrue best-effort se fait au prochain `stop`/expire du JWT) et rediriger vers `/login` si plus de session valide, sinon `/chatter/members`.
- [ ] **Step 2** — Tripwire (léger) : si `state` valide, relire le rôle de la cible (`getActorForSid`→ row.targetId → `profiles.role` via admin) **au plus une fois par navigation** ; si `!isImpersonatable(role)` → forcer teardown. (Optimisation possible : ne vérifier que sur les navigations de page, pas les assets — déjà exclus par le matcher.)
- [ ] **Step 3** — Vérifier que le bypass `/api/ping`,`/api/revalidate` reste en tête (inchangé). Typecheck + `pnpm --filter @glagency/web build` (vert — proxy compile).
- [ ] **Step 4** — Commit : `feat(impersonation): teardown TTL + tripwire rôle dans le proxy`.

---

## Task 7 : Bandeau + compteur + état lisible

**Files:** Create `apps/web/src/features/impersonation/read-state.ts`, `.../components/impersonation-banner.tsx`, `.../components/countdown.tsx` ; Modify `apps/web/src/app/(dash)/layout.tsx`.

**Interfaces — Produces:** `getImpersonationState(): Promise<{active: boolean; targetName?: string; expiresAt?: number}>` ; `<ImpersonationBanner />` (Server Component).
**Consumes:** `readStateCookie`, row lookup (nom cible), `stopImpersonation` (form action).

- [ ] **Step 1** — `read-state.ts` : `getImpersonationState()` lit `readStateCookie()`, charge la row (nom cible via `profiles.display_name` service-role), retourne `{active, targetName, expiresAt: state.exp}`.
- [ ] **Step 2** — `countdown.tsx` (`'use client'`) : reçoit `expiresAt`, `useEffect` tick 1 s, affiche `MM:SS`, à 0 → `router.refresh()`.
- [ ] **Step 3** — `impersonation-banner.tsx` (Server Component) : `const s = await getImpersonationState(); if (!s.active) return null;` → bandeau sobre (fond ambre discret, cohérent design projet, **zéro ornement**) : « Consultation en tant que **{targetName}** · <Countdown expiresAt={s.expiresAt}/> · <form action={stopImpersonation}><button>Quitter</button></form> ».
- [ ] **Step 4** — Monter dans `layout.tsx` (`DashDynamic`) juste après le `<header>` (`:60`), avant le `<div className="relative flex …">` (`:69`) : `<ImpersonationBanner />`.
- [ ] **Step 5** — Typecheck + build. Vérif manuelle : en impersonation le bandeau + compteur s'affichent sur toutes les pages du dash. Commit : `feat(impersonation): bandeau + compte à rebours`.

---

## Task 8 : Déclencheur dans Membres

**Files:** Create `apps/web/src/features/members/components/impersonate-button.tsx` ; Modify `apps/web/src/features/members/components/members-table.tsx`.

**Interfaces — Consumes:** `startImpersonation` (Task 5), `isImpersonatable` (`@glagency/core`), `viewer` (déjà passé à `members-table` : `'admin'`).

- [ ] **Step 1** — `impersonate-button.tsx` (`'use client'`) : icône « 👁 » (`Eye` lucide), `AlertDialog`/`confirm` (« Consulter en tant que {nom} ? »), puis `startImpersonation(memberId)` via un `<form action>` ou `startTransition`. N'affiché que si `viewer === 'admin'` **et** `isImpersonatable(row.role)`.
- [ ] **Step 2** — `members-table.tsx` : ajouter le bouton dans la colonne actions des lignes (à côté de l'édition), gardé `viewer === 'admin' && isImpersonatable(row.original.role)`. (Le `role` de la ligne est le libellé humain — vérifier le champ brut ; sinon mapper. La garde SERVEUR reste la vraie barrière, l'UI est optimiste.)
- [ ] **Step 3** — Typecheck + build. Vérif manuelle : bouton visible seulement sur manager/sous-manager/police/chatteur pour un admin, absent pour admin/superadmin et pour un manager. Commit : `feat(impersonation): déclencheur « consulter en tant que » dans Membres`.

---

## Task 9 : Neutraliser « Déconnexion » sidebar

**Files:** Modify `apps/web/src/components/nav-user.tsx`, `apps/web/src/app/(dash)/layout.tsx` (passer le flag).

**Interfaces — Consumes:** `getImpersonationState().active`.

- [ ] **Step 1** — `layout.tsx` : passer `impersonating={s.active}` à `<NavUser />` (la donnée est déjà chargée pour le bandeau).
- [ ] **Step 2** — `nav-user.tsx` : ajouter prop `impersonating?: boolean`. Si `impersonating`, le `DropdownMenuItem` « Déconnexion » **appelle `stopImpersonation()`** (et libellé « Quitter la consultation ») au lieu du `signOut()` global — **jamais** de `signOut()` global sur une session forgée (sinon déconnexion globale de la vraie cible).
- [ ] **Step 3** — Typecheck + build. Vérif manuelle : en impersonation, « Déconnexion » ne déconnecte pas la cible, il quitte l'impersonation. Commit : `fix(impersonation): sidebar Déconnexion neutralisée en consultation`.

---

## Task 10 : Write-attribution + garde mutations

**Files:** Modify `apps/web/src/features/members/actions.ts` (+ éventuellement `authz.ts` pour centraliser), `apps/web/src/lib/actions.ts` (breadcrumb générique optionnel).

**Interfaces — Consumes:** `readStateCookie` / `getActorForSid` (Task 4), `BusinessError`.

- [ ] **Step 1** — Garde « bloqué en impersonation » : helper `assertNotImpersonating()` (dans `lib/impersonation/session.ts` ou `authz.ts`) → `if (await readStateCookie()) throw new BusinessError('Action indisponible en consultation (mode « en tant que »)')`. L'appeler en tête du `handler` de `deleteMember` (`:300`), `createMember` (`:85`), `updateMember` (`:200`).
- [ ] **Step 2** — Attribution : dans `runAction` (`lib/actions.ts`), sur toute action mutante, si `imp_sid` présent, `Sentry.addBreadcrumb({ category:'impersonation', data:{ real_actor: <actorId de la row>, target: <targetId>, action: <nom> } })` avant le handler. (Alternative minimale : breadcrumb seulement dans les actions sensibles listées.)
- [ ] **Step 3** — Typecheck + build. Vérif manuelle : `deleteMember` refusé en impersonation ; une écriture autorisée laisse un breadcrumb `real_actor`. Commit : `feat(impersonation): mutations sensibles bloquées + attribution Sentry`.

---

## Task 11 : Vérification (e2e + manuel)

**Files:** (selon décision infra — voir handoff) Create `apps/web/e2e/impersonation.spec.ts` si l'infra e2e est restaurée.

- [ ] **Step 1 (manuel, UAT/preview)** — Checklist : (a) admin impersonne un chatteur → nav/pages du chatteur, bandeau+compteur ; (b) « Quitter » → redevient admin ; (c) fermer l'onglet, revenir après 30 min → teardown (retour admin/login) ; (d) « Déconnexion » en impersonation ne déconnecte pas la cible ; (e) 2e onglet resté admin ne mute pas en tant que cible ; (f) `deleteMember` refusé en impersonation ; (g) tenter d'impersonner un admin/superadmin → refusé.
- [ ] **Step 2 (e2e, si infra dispo)** — Spec `impersonation.spec.ts` (fixture `./fixtures`, storageState admin) : start → `expect` heading/pages cible → Quitter → `expect` retour admin. Test négatif : garde refuse (rôle non-admin, cible admin).
- [ ] **Step 3** — Commit : `test(impersonation): checklist manuelle + spec e2e`.

---

## Self-Review (fait)

- **Couverture spec** : mécanisme (T4/T5), état serveur+cookie (T1/T4), gardes fail-closed (T5), teardown/TTL/tripwire (T6), re-mint (T5), révocation (T5), bandeau+compteur (T7), déclencheur (T8), sidebar (T9), write-attribution+deleteMember (T10), CSRF/env/secret (T3), tests (T2 pur + T11). ✅
- **Type-cohérence** : `signState/verifyState` (T2) ↔ `set/readStateCookie` (T4) ↔ `imp_sid` (T6/T7). `forgeSessionInto(email, expectedUserId)` signature unique (T4↔T5). `getImpersonationState` (T7↔T9). ✅
- **Placeholders** : aucun TODO/TBD ; le code des points sensibles est fourni ; les parties UI mécaniques renvoient aux fichiers/patterns exacts du recon. ✅
- **Points à trancher au handoff** : (a) stratégie de test (infra e2e absente du working tree) ; (b) confirmer l'existence/route `/auth/confirm` (verifyOtp) réutilisable ; (c) valeur exacte de `allowedOrigins` (domaine prod).
