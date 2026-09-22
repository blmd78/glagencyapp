---
name: archi-web
description: >
  Architecture par défaut pour une app web en Next.js 16 (App Router). Couvre la
  stack (React 19, Tailwind v4 + tw-animate-css, shadcn/ui Radix + cva, TanStack
  Query, RHF + Zod, Supabase (Auth OTP + RLS), Vitest, Sentry), le double mode 🅐 Consumer
  (consume API externe Hono) vs 🅑 Standalone (supabase-js direct + RLS, mutations
  en Server Actions), la structure feature-based (Bulletproof React), Server Components par
  défaut + 'use client' au plus bas, le pattern prefetch + HydrationBoundary pour
  TanStack Query côté client, la règle "mutations en Server Actions" (RLS = garde-fou ;
  Route Handlers réservés aux cas spéciaux webhooks/OAuth/IA, aligné avec archi-api), proxy.ts pour les redirections
  optimistes par cookie, le caching
  opt-in Next 16 (use cache directive, cacheLife, cacheTag, revalidateTag, PPR), le
  streaming via Suspense + loading.tsx + error.tsx. À invoquer dès qu'on travaille
  sur un projet Next.js — création de pages/layouts, Route Handlers, Server Components,
  Tailwind v4 + shadcn/ui, proxy.ts, ou tout fichier dans un dossier web/, apps/vitrine/,
  apps/ecommerce/ ou tout projet avec Next.js App Router.
---

# Archi web — Next.js App Router

**Prérequis — conventions TS + React.** S'appuie sur `conventions-code.md` et `conventions-react.md` (transverses, **source unique — non redupliquées ici**), normalement chargés via `@~/.claude/...` dans le `CLAUDE.md` du projet. **S'ils ne sont pas déjà en contexte** (skill auto-invoqué, ou projet sans l'import) → lis `~/.claude/conventions-code.md` et `~/.claude/conventions-react.md` avant de continuer.

## Mode (à cocher dans le `CLAUDE.md` projet)

Un projet web Next.js est soit l'un soit l'autre — pas les deux :

- **[ ] Consumer** d'une API externe (Hono ou autre back séparé). Server Components fetch l'API HTTP. Pas de Supabase/DB locale. **Ex** : back-office, dashboard admin.
- **[ ] Standalone** (fullstack intégré). Server Components query **supabase-js (RLS)** directement, **Server Actions** pour les mutations (Route Handlers pour les cas spéciaux). Pas d'API externe. **Ex** : dashboard, SaaS, vitrine.

Les règles communes s'appliquent partout. Les sections marquées 🅐 / 🅑 sont spécifiques au mode.

## Stack par défaut

Next.js 16 (App Router), React 19, TypeScript strict, **Tailwind v4** (`@import "tailwindcss"`, `tw-animate-css`, attributs `data-slot` sur primitives), shadcn/ui (Radix + cva), Lucide React, TanStack Query (côté Client Components), React Hook Form + Zod, **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`, Auth OTP, RLS), Vitest (tests), Sentry (`@sentry/nextjs`) pour error tracking.

**Dev = Turbopack** (défaut Next 16) : `"dev": "next dev"` — ne jamais forcer `--webpack`
(compilation des routes à la volée bien plus lente, ressenti « app lente » en localhost
alors que c'est le compilateur). Si un outil l'exige (rare), documenter POURQUOI dans le
script, sinon on ne sait plus le retirer.

**🅑 ajoute** : **Supabase Postgres** via supabase-js (RLS au niveau base), migrations SQL + types générés (`supabase gen types`).
**🅐 ajoute** : client HTTP typé vers l'API externe.

## Structure

Pattern **feature-based** (Bulletproof React, cohérent avec `archi-mobile`).

```
web/
├── app/                           # App Router — routes uniquement
│   ├── (auth)/                    # groupes (segments sans préfixe URL)
│   ├── (dashboard)/
│   ├── api/                       # 🅑 Route Handlers — cas spéciaux (webhooks, OAuth, IA, exports). 🅐 inutile (sauf BFF rare)
│   ├── layout.tsx                 # providers (QueryClient, Theme, Auth)
│   ├── globals.css
│   └── page.tsx
│
├── features/                      # 1 dossier par feature, auto-suffisant
│   └── <feature>/
│       ├── <Feature>Template.tsx  # fichier racine, PascalCase (cf. conventions noms ci-dessous)
│       ├── services/              # fonctions qui *call* l'API (côté client + queryOptions + hooks)
│       │   ├── get-<entité>.ts    # 🅐 fetch API ext.  /  🅑 supabase-js direct en RSC (RLS)
│       │   ├── create-<entité>.ts
│       │   └── ...
│       ├── components/            # composants métier (RSC + Client mélangés)
│       ├── <entité>.schema.ts     # schemas Zod RÉUTILISÉS (sinon inline — cf. règle Schemas Zod)
│       └── <entité>.keys.ts       # query keys factory (optionnel)
│
├── components/ui/                 # shadcn/ui (Button, Input, Dialog, etc.)
│
└── lib/
    ├── api.ts                     # 🅐 client HTTP vers API ext. + unwrap envelope (🅑 : rarement utile)
    ├── supabase/                  # 🅑 clients Supabase (@supabase/ssr)
    │   ├── server.ts              # createServerClient — RSC + Server Actions (session user → RLS)
    │   ├── client.ts              # createBrowserClient — Client Components
    │   └── admin.ts               # service-role (serveur uniquement, bypass RLS — usage rare)
    ├── db/                        # 🅑 migrations SQL + types générés
    │   ├── migrations/
    │   └── types.ts               # `Database` types (supabase gen types)
    ├── query-client.ts            # `getQueryClient()` factory pour RSC + Client
    ├── env.ts                     # validation Zod de process.env
    ├── types/                     # types transverses
    └── utils.ts                   # `cn`, formatters, helpers
```

**Règles d'import** (Bulletproof React) :
- `app/` peut importer depuis `features/` et `lib/`.
- `features/<a>/` ne peut **pas** importer depuis `features/<b>/` — si commun, ça monte dans `lib/` ou `components/ui/`.
- `features/` et `app/` importent depuis `lib/`, jamais l'inverse.

**Local vs partagé** — règle de décision :
> "Will this code disappear with the feature when the feature is obsolete?"
>
> - Oui → `features/<f>/...` (services, components, hooks de la feature)
> - Non (réutilisé par plusieurs features) → top-level (`lib/services/`, `lib/hooks/`, `components/`, `lib/types/`)

**`services/` (dans une feature) vs `app/api/` (Next.js)** — ne pas confondre :

| Dossier | Quoi | Quand |
|---|---|---|
| `features/<f>/services/` | Fonctions de **lecture** (RSC supabase-js, ou fetch API ext.) | Mode 🅐 ET 🅑 |
| `features/<f>/actions.ts` | **Server Actions** (`'use server'`) — mutations (supabase-js + RLS) | Mode 🅑 Standalone |
| `app/api/route.ts` | Route Handlers — cas spéciaux (webhooks, OAuth, IA, exports) | Mode 🅑 Standalone |

## Server vs Client Components

- **Server Components par défaut.** `'use client'` au plus bas dans l'arbre, uniquement si besoin d'interactivité, hooks, ou browser API.
- **Pas de `useEffect` pour fetcher** — fetch côté RSC, ou prefetch + hydrate pour TanStack Query.
- **Composants neutres** (Button, Input via shadcn) → restent Server par défaut, basculent Client si l'enfant l'exige.
- **`params` / `searchParams` sont des `Promise<...>`** depuis Next 15/16 — toujours `await`.

## Data fetching

### Règle simple — mutations en Server Actions (Supabase + RLS)

> **Choix opinionné (🅑 Supabase)** : les mutations passent par des **Server Actions** (`'use server'`) qui utilisent le client supabase-js serveur — la **RLS** est le garde-fou réel au niveau base. Les **Route Handlers** restent pour les cas spéciaux (webhooks, OAuth callbacks, endpoints IA, exports binaires, streaming, ou un endpoint consommé par un autre client type mobile). *(En 🅐 Consumer, pas de Server Actions : tout passe par l'API externe.)*

```
🅑 Standalone (Supabase):
  • Reads (RSC)     → supabase-js (server client) direct dans le Server Component (RLS scope)
  • Reads (Client)  → TanStack Query → supabase-js (browser client) ou Route Handler
  • Mutations       → Server Actions ('use server') + supabase-js server client (RLS)
  • Cas spéciaux    → Route Handlers (webhooks, OAuth, IA, exports, streaming)

🅐 Consumer:
  • Tout passe par lib/api.ts → API externe
  • Pas de Route Handlers métier (sauf rare BFF/proxy)
```

### 🅐 Mode Consumer — Server Component fetch API externe

```tsx
// app/(dashboard)/drones/page.tsx
import { getDrones } from '@/features/drones/services/get-drones'
import { DronesTable } from '@/features/drones/components/drones-table'

export default async function DronesPage() {
  const drones = await getDrones()  // service pur appelé depuis RSC
  return <DronesTable drones={drones} />
}
```

Le service `getDrones` reste le même que côté mobile : fetch HTTP + Zod parse. Si l'API renvoie un envelope `{ success, data }`, l'unwrap est dans `lib/api.ts` (cohérent avec `archi-mobile`).

### 🅑 Mode Standalone — Server Component query supabase-js direct

```tsx
// app/(dashboard)/drones/page.tsx
import { getDrones } from '@/features/drones/services/get-drones'

export default async function DronesPage() {
  const drones = await getDrones()  // query supabase-js directe (RLS applique le scope)
  return <DronesTable drones={drones} />
}
```

```ts
// features/drones/services/get-drones.ts
import { createClient } from '@/lib/supabase/server'

export async function getDrones() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('drones').select('*')
  if (error) throw error
  return data
}
```

Pas de HTTP : le client serveur lit la session (cookies) et la **RLS** filtre selon l'utilisateur. Les types viennent des types générés Supabase (`supabase gen types`). Zod reste pour la validation des **inputs** (forms côté client, Server Actions côté serveur).

### TanStack Query — quand l'utiliser sur le web

Inutile pour les Server Components purs (le RSC fait le job). Utile pour :
- **Client Components interactifs** (filtres, pagination, infinite scroll, optimistic updates) → `useQuery` + prefetch côté RSC + `HydrationBoundary`.
- **Mutations côté client** via `useMutation` qui appelle une **Server Action** (mode 🅑) ou l'API externe (mode 🅐).

Pattern prefetch + hydrate (standard 2026) :

```tsx
// app/(dashboard)/drones/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import { dronesQueryOptions } from '@/features/drones/services/get-drones'

export default async function DronesPage() {
  const queryClient = getQueryClient()
  await queryClient.prefetchQuery(dronesQueryOptions())
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DronesClient />  {/* Client Component avec useDronesQuery */}
    </HydrationBoundary>
  )
}
```

### 🅑 Mutations — Server Actions (supabase-js + RLS)

Mutations via Server Actions (`'use server'`) qui utilisent le client supabase-js serveur. La **RLS est la vraie barrière** : l'écriture échoue si la policy refuse, même si le code oublie un check. On garde quand même la vérif de session + la validation Zod (défense en profondeur).

Structure type : `features/<ressource>/actions.ts` (create/update/delete), co-localisé avec la feature.

> **Une Server Action = une entrée serveur appelable.** Mêmes obligations : valider l'input (Zod), vérifier l'auth, s'appuyer sur la RLS pour l'authorization.

```ts
// features/drones/actions.ts
'use server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createDroneSchema } from './drones.schema'

export async function createDrone(input: unknown) {
  const supabase = await createClient()

  // 1. Auth (session via cookies)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Login required' } }

  // 2. Validation input
  const values = createDroneSchema.parse(input)  // throw → à catcher côté appelant

  // 3. Insert — la RLS autorise (ou refuse) selon la policy
  const { data, error } = await supabase.from('drones').insert(values).select().single()
  if (error) return { success: false, error: { code: error.code, message: error.message } }

  revalidateTag('drones')
  return { success: true, data }
}
```

- **Jamais** se fier au TypeScript ou au filtrage UI — c'est la **RLS** qui protège (l'action est invocable directement).
- **`revalidateTag` / `revalidatePath`** après mutation pour invalider le cache RSC.
- Si TanStack Query est en place côté client : `queryClient.invalidateQueries(...)` après l'action.
- **Cas spéciaux** (webhooks, OAuth, IA, exports, client mobile) → **Route Handlers** sous `app/api/`, mêmes obligations (valider, auth, RLS).

### 🅐 Mode Consumer — pas de Route Handlers métier

En mode Consumer, **les mutations passent par le client API** qui hit l'API externe (cohérent avec mobile). Le Next n'orchestre que la UI. Pas de duplication de logique métier côté Next — elle vit dans l'API back.

Seule exception : un Route Handler **BFF/proxy** si tu dois traduire/agréger des appels avant de hitter l'API back (rare).

## Caching (Next.js 16)

Next 16 = caching **opt-in explicite** (gros changement vs Next 14).

- `fetch()` ne cache **plus** par défaut. Pour cacher : `fetch(..., { next: { revalidate: 60, tags: ['drones'] } })` ou `cache: 'force-cache'`.
- **`"use cache"`** directive (Cache Components) sur fonctions/composants serveur pour cache compilé avec clé auto-générée. `cacheLife('hours')`, `cacheTag('drones')` pour configurer.
- **Partial Pre-Rendering (PPR)** : shell statique + contenu dynamique streamé via Suspense. Activé via `cacheComponents: true` dans `next.config` (plus de flag `experimental.ppr` séparé en Next 16).
- **Invalidation** : `revalidateTag(...)` / `revalidatePath(...)` dans les Server Actions (ou Route Handlers) après les mutations.
- **React.cache** pour dédupliquer les fetch dans un même render server (ex: même query appelée dans le layout ET la page).

## Streaming & loading

- **Wrap les slow fetches dans `<Suspense>`** avec un `loading.tsx` ou un fallback inline. Le reste de la page s'affiche immédiatement.
- **`loading.tsx`** au niveau d'un segment → fallback pendant la résolution de `page.tsx`.
- **`error.tsx`** au niveau d'un segment → boundary d'erreur côté client.

## Routes (`app/`) — règles

- **Pages légères** : `page.tsx` importe ses composants depuis `features/`, garde la couche routing fine.
- **`layout.tsx`** : providers, navigation, structure persistante.
- **Groupes** `(auth)`, `(dashboard)` : pour structurer sans impacter l'URL.
- **Routes dynamiques** : `[id]`, `[...slug]`, `[[...optional]]`.
- **`route.ts` (Route Handlers)** : réservés aux **cas spéciaux** en mode 🅑 (webhooks, OAuth callbacks, endpoints IA, exports binaires, streaming, client mobile). Les mutations courantes passent par les **Server Actions**. Conventions alignées sur `archi-api` (envelope, validation, codes HTTP).

## Composants UI

- **shadcn/ui** dans `components/ui/` (Radix + cva). Composants copy-paste, à éditer librement.
- Helpers : `cn` (clsx + twMerge) dans `lib/utils.ts`.
- Icônes : `lucide-react`.
- Brand icons (Facebook/Instagram/Linkedin/Github) : SVG locaux via simpleicons.org — Lucide v1 les a retirés pour raison légale.

## Auth (Supabase Auth — OTP)

- **Server** : client supabase-js serveur dans `lib/supabase/server.ts` (`@supabase/ssr`, `createServerClient`) + **`proxy.ts`** à la racine pour protéger les segments (et rafraîchir la session cookie).
- **Client** : client navigateur dans `lib/supabase/client.ts` (`createBrowserClient`).
- **OTP email** : `supabase.auth.signInWithOtp({ email })` puis `verifyOtp({ email, token, type: 'email' })` (ou lien magique via `app/auth/callback`).
- **Session côté RSC / Server Action** : `await supabase.auth.getUser()` (revalide le JWT) — **pas** `getSession()` côté serveur pour les décisions de sécurité.
- **Session côté Client** : `supabase.auth.getUser()` / `onAuthStateChange`.
- **Authorization** : portée par la **RLS** (policies par rôle/scope) — l'app ne fait que de l'optimiste UI.
- **🅐 Mode Consumer** : l'auth vit côté API externe ; le Next transmet le token/cookie.
- **🅑 Mode Standalone** : Supabase Auth direct, RLS sur la même base.

### `proxy.ts` — règles importantes

`proxy.ts` s'exécute sur **toutes** les requêtes, y compris les prefetch. Donc :

- **Optimistic check uniquement** : lire la session depuis le cookie, pas de DB check. Rediriger si pas de cookie session.
- **Full session validation** (`supabase.auth.getUser()`) → dans les Server Components, Server Actions et Route Handlers concernés.
- `proxy.ts` tourne sur le runtime Node.js (l'option `runtime` n'y est **pas** configurable — la définir lève une erreur). Un DB check y est donc techniquement possible, mais garder l'optimistic check : proxy peut être déployé en edge/CDN devant l'app et s'exécute sur chaque requête.
- Garde `proxy.ts` léger : redirections, rewrites, vérification cookie. Pas d'agrégation, pas de calls externes.

## Conventions noms

Suit `conventions-code.md` (kebab-case fichiers, PascalCase composants). Spécifique web :

- **Pages** : `page.tsx` (convention Next), composants importés depuis `features/`.
- **Layouts** : `layout.tsx`, `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` (conventions Next).
- **Fichier racine d'une feature** : `<Feature>Template.tsx` en PascalCase (cf. `conventions-code.md`).
- **Services d'une feature** (côté client) : `get-<entité>.ts`, `create-<entité>.ts`, etc. dans `features/<feature>/services/`. Pragmatique : si peu d'opérations, regrouper dans `services/<entité>.ts`.
- **Server Actions** (🅑) : `features/<feature>/actions.ts` (`'use server'`) pour les mutations courantes.
- **Route Handlers** (🅑) : sous `app/api/<ressource>/route.ts` — uniquement cas spéciaux (webhooks, OAuth, IA, exports). Conventions alignées sur `archi-api`.
- **Schemas Zod** : **inline par défaut, fichier séparé seulement si réutilisé.**
  - Schema de form RHF mono-usage → inline dans le composant.
  - Schema d'input/output d'un service mono-usage → en haut du fichier service.
  - Schema réutilisé par ≥ 2 consommateurs OU schema d'entité partagé avec l'API → extraire dans `<entité>.schema.ts` (exporte `<entité>Schema` + `<Entité>` type inféré).
  - Schema transverse à plusieurs features → `lib/types/`.
  
  Objectif : éviter la prolifération de fichiers `.schema.ts` mono-usage. Une feature avec 4 forms a 4 schemas inline, pas 4 fichiers.
- **Query keys** : `<entité>.keys.ts` → exporte `<entité>Keys`.

## Sentry (error tracking)

`@sentry/nextjs`. Couvre client (Browser) + serveur (RSC, Server Actions, Route Handlers) en un seul SDK.

Setup via le wizard officiel :
```bash
npx @sentry/wizard@latest -i nextjs
```

Génère `instrumentation-client.ts` (init client browser), `sentry.server.config.ts` + `sentry.edge.config.ts` (init Node/edge, enregistrés via `instrumentation.ts`) et la config `next.config.js` pour upload sourcemaps automatique au build.

- **`tracesSampleRate: 0`** (errors only) — à forcer, le wizard met `1`/`0.1`.
- **`sendDefaultPii: false`** — à forcer aussi, le wizard met `true`. + `beforeSend` filtre pour drop les 4xx métier (cohérent avec `archi-api` / `archi-mobile`).
- **`error.tsx`** par segment doit appeler `Sentry.captureException(error)` dans son `useEffect`, sinon les crashes render ne remontent pas :
  ```tsx
  'use client'
  import { useEffect } from 'react'
  import * as Sentry from '@sentry/nextjs'

  export default function Error({ error, reset }: { error: Error; reset: () => void }) {
    useEffect(() => { Sentry.captureException(error) }, [error])
    return <button onClick={reset}>Réessayer</button>
  }
  ```
- **`app/global-error.tsx`** : point de capture que génère le wizard pour les erreurs du root layout — doit aussi appeler `Sentry.captureException`. Les `error.tsx` par segment le complètent, ne le remplacent pas.
- **Mutations TanStack côté client** : capture explicite des 5xx dans le dispatcher d'erreur (les erreurs TanStack ne bubble pas en unhandled, cf. skill `archi-mobile`).
- **`Sentry.setUser({ id })`** après login (server-side `headers()` ou client-side `useSession`). Pas d'email.
- **MutationCache global** : si TanStack Query est utilisé côté Client Components, brancher `MutationCache.onError` sur un dispatcher centralisé (cf. skill `archi-mobile`).

## Hors-scope

- **Hosting / deploy** (Vercel, Railway, self-hosted) : par projet.
- **CMS** (Sanity, Payload, Contentlayer, MDX) : par projet.
- **i18n** (next-intl, next-i18next) : par projet, structure `[locale]/` au besoin.
- **CDN images / OG generation** : par projet.
- **Sitemap, robots, manifest** : factory `@shared/seo` ou équivalent par projet.
