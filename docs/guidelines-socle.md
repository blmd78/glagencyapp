# Guidelines — socle transverse (batch 0)

Les briques transverses posées au **batch 0** du chantier standard-feature (spec
`docs/superpowers/specs/2026-07-16-standard-feature-design.md` §2.4-2.7). Contrairement à
`guidelines-standard-feature.md` (contrat répliqué *par feature*), elles ne se répliquent
pas : ce sont les fondations globales de `apps/web`. Doc **as-built** — reflète l'état réel du
code (vérifié 2026-07-18). En cas d'écart code↔doc, le code fait foi (corriger la doc).

---

## 1. Sentry serveur — errors-only, sans PII

- `src/instrumentation.ts` : `register()` importe `sentry.server.config` (runtime `nodejs`) ou
  `sentry.edge.config` (`edge`) ; `export const onRequestError = Sentry.captureRequestError`
  capture toute erreur serveur non catchée (RSC, Route Handlers, Server Actions).
- `sentry.server.config.ts` / `sentry.edge.config.ts` (identiques) : `Sentry.init({ dsn,
  enabled: NODE_ENV === 'production', environment })`. **Errors-only** = `tracesSampleRate`
  **omis** (pas `=0`) ; **pas** de `sendDefaultPii` ni `dataCollection` (ils opteraient dans
  des défauts PII plus permissifs : cookies, headers, userInfo).
- `src/instrumentation-client.ts` : `Sentry.init` idem (tracesSampleRate omis), SDK lazy-loadé
  après idle — conservé tel quel.
- `next.config.ts` : `withSentryConfig` réactivé (org/project/`SENTRY_AUTH_TOKEN` en env, upload
  sourcemaps ; Turbopack supporté dev + build).
- Boundaries d'erreur côté rendu : voir `guidelines-standard-feature.md` §3 (`ErrorFallback` +
  `error.tsx` par workspace + `unstable_retry`).

## 2. Cache & invalidation par l'ingestion

- **Une seule** lecture cachée : `features/insights/services/get-ranking.ts` — `'use cache'`
  sur une lecture **100 % GLOBALE** via `createAdminClient()` (hors RLS), `cacheLife('hours')`
  + `cacheTag('facts-daily')`. **Jamais** `use cache` sur une lecture RLS cookie-bound (fuite
  inter-modèles) — cf. `guidelines-data-loading.md` §4.
- Route Handler `src/app/api/revalidate/route.ts` (`POST`) = le chaînon d'invalidation. Auth par
  secret partagé (header `x-revalidate-secret` + env `REVALIDATE_SECRET`), comparaison
  **timing-safe** (`crypto.timingSafeEqual`, garde de longueur), **allow-list fermée** de tags
  (`['facts-daily']`), `revalidateTag(tag, 'max')` (forme 2 args, profil SWR non bloquant).
  `apps/ingestion` l'appelle en fin de run — sans lui, `get-ranking` sert des données périmées
  jusqu'à expiration de `cacheLife`.
- Mutations : `revalidatePath` (+ `updateTag(tag)` si la donnée mutée alimente un cache taggé —
  pas encore de cas dans le repo). Détails : `guidelines-standard-feature.md` §4.

## 3. Config Next & sécurité

- `next.config.ts` : `cacheComponents: true` (PPR — shell statique + streaming), `typedRoutes:
  true` (href typés sur toutes les routes), `reactCompiler: true`.
- ⚠️ **Piège cacheComponents** : aucun accès à une donnée **dynamique** (cookies / `getProfile`)
  **hors `<Suspense>`** dans une page racine **prérendue** (`app/page.tsx`) → erreur de build
  « Uncached data accessed outside of `<Suspense>` ». Garder les redirections racines (`/`,
  `/chatter`, login, callback) **STATIQUES** ; faire la résolution dynamique (rôle/pages) dans
  les **gardes runtime** (`requireAccess`…). Les pages `(dash)` sont déjà dynamiques (OK).
- **Headers de sécurité** (`next.config.ts`, `headers()` sur `source: '/(.*)'`) : CSP
  `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(),
  geolocation=()`. **`robots: { index: false, follow: false }`** dans `src/app/layout.tsx`
  (dashboard financier sur URL publique). CSP simple **sans nonce** (le nonce est incompatible
  PPR/cacheComponents).

## 4. Env & auth (gardes de page)

- `src/lib/env.ts` : `publicEnvSchema.safeParse` → **throw explicite** si une `NEXT_PUBLIC_*`
  manque. Nuance : le throw est **lazy au 1er appel** de `getPublicEnv()` (résultat mémoïsé),
  pas au module-eval ; déclenché dès la 1re création de client Supabase
  (`lib/supabase/server.ts`, `lib/supabase/client.ts`). Accès **statiques** aux
  `NEXT_PUBLIC_*` (inlinées au build — jamais d'accès dynamique par clé).
- `src/lib/auth/index.ts` : gardes de page RSC — `requireUser`, `requireAccess(slug)`,
  `requireAdmin`, `requireAdminOrManager`, `requireSuperadmin` (elles font un `redirect()` →
  voir le piège de nommage, `guidelines-standard-feature.md` §4) + prédicats
  `hasPageAccess(profile, slug)` et `hasWriteAccess(profile, slug)`. L'atterrissage post-login
  passe par `landingHref` (`config/workspaces.ts`) — **source unique** partagée avec le filtre
  de la sidebar via `canAccessNav`.

## 5. `lib/actions.ts` — socle mutations

`ActionResult<T>`, `runAction`, `BusinessError`, et les **3 gardes** de `runAction` :

| Garde | Autorise | Usage |
|---|---|---|
| `adminGuard` | admin seul | actions admin-only |
| `pageGuard(slug)` | admin **ou** page autorisée (chatteur inclus) | **lectures** / actions ouvertes (ex. relances) |
| `managerPageGuard(slug)` | admin **ou** manager/sous-manager ayant la page | **écritures** réservées — miroir de la RLS `can_write_page` (0060), chatteur exclu |

Détaillé dans `guidelines-standard-feature.md` §4 (dont la triade RLS→serveur→UI du gating
écriture).

## 6. Composants transverses

`components/error-fallback.tsx`, `components/action-button.tsx` (spinner + `disabled` piloté
par `pending`), `components/skeletons/` (`kpi-skeleton`, `table-skeleton`, `route-loading` —
a11y `role="status"` + `sr-only` portée par les skeletons), `<Toaster>` sonner monté au root
layout (`src/app/layout.tsx`).

## 7. Cible Vercel-only

`apps/web` n'a plus `wrangler` ni `@sentry/cloudflare` (reliquats Cloudflare retirés au
batch 0) — seul `@sentry/nextjs`. `apps/ingestion` garde son worker CF (gelé). `api/ping` =
health check prod (sha `VERCEL_GIT_COMMIT_SHA` + état `SNAP_CODES_SECRET`).
