# Standard feature — Socle (batch 0) + Pilote `/chatter/chatters` (batch 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le socle transversal du standard feature (Sentry serveur, contrat d'action, erreurs, skeletons, caching/invalidation, ESLint/CI, sécurité, fuseau) puis refactoriser la page pilote `/chatter/chatters` comme exemple canonique.

**Architecture:** Deux PRs. PR 1 (`feat/standard-feature`, déjà créée) = batch 0, briques transversales qui bénéficient à toutes les pages sans changer leur comportement visuel. PR 2 (`feat/standard-feature-pilote`, à créer depuis `main` après merge de la PR 1) = batch 1, le pilote. Spec de référence : `docs/superpowers/specs/2026-07-16-standard-feature-design.md`.

**Tech Stack:** Next.js 16.2.10 (App Router, `cacheComponents`, React Compiler), React 19, TypeScript strict, Zod ^4.4.3 (import root), @sentry/nextjs ^10.63, @supabase/ssr ^0.12, shadcn/ui (Radix), react-hook-form ^7.54 + @hookform/resolvers ^5.4, Vitest (packages/core uniquement), pnpm workspaces.

## Global Constraints

- **Commits : demander l'accord de Benoit avant CHAQUE commit** (règle projet absolue). Grouper les changements d'une task en un commit et demander une fois par task.
- **Ne pas toucher au design/styling existant** (couleurs, spacing, composants visuels) — les seuls ajouts visuels autorisés sont ceux du plan (toasts, skeletons, messages d'erreur), déjà validés en spec.
- **Zéro texte UI en anglais** : tous les libellés utilisateur en français.
- **Jamais `error.message` Supabase brut affiché à l'utilisateur** — message générique + `Sentry.captureException`.
- **Zod v4 uniquement** : `z.uuid()`, `z.url()`, `z.flattenError()` — jamais `.uuid()`/`.url()` chaînés ni `.flatten()`.
- **`apps/web` n'a pas d'infra de test** (choix spec §6) : la vérification des tasks web = `pnpm --filter @glagency/web typecheck` + `lint` + `build` + vérification manuelle décrite. `packages/core` a Vitest → TDD obligatoire (Task 1).
- **Pas de nouvelle dépendance** hors celles du plan : `sonner`, `@eslint/eslintrc`, `eslint-plugin-import-x`.
- **RLS et migrations : intouchées** — aucun changement de schéma DB dans ce plan.
- Env : extraire `DATABASE_URL` en brut si besoin (`grep '^DATABASE_URL=' .env | cut -d= -f2-`), jamais `source .env`.

---

# BATCH 0 — Socle (PR 1, branche `feat/standard-feature`)

### Task 1: Fuseau « jour métier » Europe/Paris — `todayParis()` (TDD) + correction des 7 sites UTC

Bug corrigé : « aujourd'hui » calculé en UTC → entre 00:00 et 02:00 heure de Paris, KPIs du jour vides/faux, bascule de semaine en retard (spec §2.1.6).

**Files:**
- Modify: `packages/core/src/domain/dates.ts` (ajout en fin de fichier)
- Create: `packages/core/src/domain/dates.test.ts`
- Modify: `packages/core/src/index.ts` (export)
- Modify: `apps/web/src/lib/period.ts:28`
- Modify: `apps/web/src/features/repos/services/get-repos.ts:27`, `apps/web/src/features/health/services/get-health.ts:50,148`, `apps/web/src/features/overview/services/get-overview.ts:108`, `apps/web/src/features/bilan/services/get-bilan.ts:54`, `apps/web/src/features/police/services/get-police.ts:21`

**Interfaces:**
- Produces: `todayParis(now?: Date): string` — jour civil Europe/Paris au format `YYYY-MM-DD`, exporté par `@glagency/core`. Les tasks suivantes et tous les futurs services DOIVENT l'utiliser pour « aujourd'hui » (jamais `isoDate(new Date())` ni `new Date()` nu).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/core/src/domain/dates.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { todayParis } from './dates'

describe('todayParis', () => {
  it('bascule au jour suivant à minuit Paris, pas à minuit UTC (été, CEST = UTC+2)', () => {
    // 22:30 UTC le 15/07 = 00:30 à Paris le 16/07
    expect(todayParis(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
    // 21:30 UTC le 15/07 = 23:30 à Paris le 15/07
    expect(todayParis(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-15')
  })
  it('gère l’heure d’hiver (CET = UTC+1)', () => {
    // 23:30 UTC le 15/01 = 00:30 à Paris le 16/01
    expect(todayParis(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
    expect(todayParis(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15')
  })
  it('format YYYY-MM-DD', () => {
    expect(todayParis(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `pnpm --filter @glagency/core test`
Expected: FAIL — `todayParis` is not exported / not a function.

- [ ] **Step 3: Implémenter**

Ajouter en fin de `packages/core/src/domain/dates.ts` :

```ts
/**
 * Jour civil « métier » de l'agence = Europe/Paris (YYYY-MM-DD).
 * À utiliser pour TOUT « aujourd'hui » — jamais `isoDate(new Date())` (UTC : entre
 * minuit et 2h heure de Paris, le jour UTC est encore la veille → KPIs du jour faux).
 * `en-CA` : locale dont le format court est déjà YYYY-MM-DD.
 */
export const todayParis = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
```

Dans `packages/core/src/index.ts`, ajouter `todayParis,` à la liste d'exports de `'./domain/dates'` (après `isoDate,`).

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @glagency/core test`
Expected: PASS (3 tests).

- [ ] **Step 5: Brancher `resolvePeriod`**

Dans `apps/web/src/lib/period.ts`, remplacer la ligne 28 (`const now = new Date()`) :

```ts
import { todayParis } from '@glagency/core'
// … dans resolvePeriod() :
  // Jour métier Europe/Paris (pas UTC) : sur Vercel, `new Date()` bascule à minuit UTC,
  // soit 2h du matin à Paris en été — la fin de période par défaut était fausse la nuit.
  const now = new Date(`${todayParis()}T00:00:00`)
```

(l'import s'ajoute en haut du fichier avec les imports existants.)

- [ ] **Step 6: Corriger les 6 sites `isoDate(new Date())` dans les services**

Remplacement mécanique `isoDate(new Date())` → `todayParis()` (+ import `todayParis` depuis `@glagency/core`, retirer `isoDate` de l'import s'il devient inutilisé) dans :

- `apps/web/src/features/repos/services/get-repos.ts:27`
- `apps/web/src/features/health/services/get-health.ts:50` et `:148`
- `apps/web/src/features/overview/services/get-overview.ts:108`
- `apps/web/src/features/bilan/services/get-bilan.ts:54`
- `apps/web/src/features/police/services/get-police.ts:21`

Vérifier qu'il ne reste aucun site : `grep -rn "isoDate(new Date())" apps/web/src` → aucun résultat.
(`apps/ingestion` n'a aucun site — vérifié. Ne pas toucher aux usages `isoDate(d)` sur des dates déjà connues.)

- [ ] **Step 7: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/core test`
Expected: PASS les deux.

- [ ] **Step 8: Commit (après accord Benoit)**

```bash
git add packages/core/src apps/web/src/lib/period.ts apps/web/src/features
git commit -m "fix(dates): jour métier Europe/Paris — todayParis() dans core + resolvePeriod et 6 services (KPIs du jour faux entre 0h et 2h Paris)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Sentry serveur — instrumentation + `withSentryConfig`

Spec §2.4.1. Le serveur était désactivé pour une contrainte Workers caduque (`src/instrumentation.ts` vide).

**Files:**
- Create: `apps/web/sentry.server.config.ts`
- Create: `apps/web/sentry.edge.config.ts`
- Modify: `apps/web/src/instrumentation.ts` (réécriture complète)
- Modify: `apps/web/src/instrumentation-client.ts:24` (retirer `tracesSampleRate: 0`)
- Modify: `apps/web/next.config.ts` (wrap `withSentryConfig`)
- Modify: `.env.example` (documenter `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`)

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (existants).
- Produces: capture serveur automatique (RSC, Route Handlers, Server Actions non catchées) via `onRequestError`. Les tasks 7/9 s'appuient dessus.

- [ ] **Step 1: Créer `apps/web/sentry.server.config.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

// Errors-only : ni tracesSampleRate ni tracesSampler → tracing désactivé (doc Sentry).
// Pas de PII : ne passer NI sendDefaultPii NI dataCollection (dataCollection, même
// partiel, opte dans des défauts plus permissifs — cookies/headers/userInfo collectés).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === 'development' ? 'development' : 'production'),
})
```

- [ ] **Step 2: Créer `apps/web/sentry.edge.config.ts`** (même contenu exactement — le runtime edge ne sert que si un segment y bascule un jour).

- [ ] **Step 3: Réécrire `apps/web/src/instrumentation.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

// Sentry SERVEUR (réactivé depuis le passage Vercel — la limite 3 MiB Workers est caduque).
// `onRequestError` capture toutes les erreurs serveur non catchées : RSC (routeType
// 'render'), Route Handlers ('route'), Server Actions ('action'), proxy ('proxy').
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config')
}

export const onRequestError = Sentry.captureRequestError
```

- [ ] **Step 4: `instrumentation-client.ts`** — supprimer la ligne 24 `tracesSampleRate: 0,` et son commentaire ligne 23 (définir l'option à 0 ≠ l'omettre ; errors-only = omission, cohérent serveur/client).

- [ ] **Step 5: `next.config.ts`** — remplacer le bloc export (lignes 20-24) :

```ts
import { withSentryConfig } from '@sentry/nextjs'

// … nextConfig inchangé …

// Sentry build plugin : upload des sourcemaps (Debug IDs natifs Turbopack, Next ≥ 15.6).
// Sans SENTRY_AUTH_TOKEN (dev local), le plugin ne fait rien — safe par défaut.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
})
```

- [ ] **Step 6: `.env.example`** — ajouter :

```
# Sentry (upload sourcemaps au build — valeurs dans le dashboard Sentry ; vides en dev)
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 7: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web build`
Expected: build OK (warnings Sentry « auth token missing » acceptables en local).
Rappel Vercel : ajouter `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` dans les env du projet Vercel (action manuelle Benoit, à signaler à la fin de la task).

- [ ] **Step 8: Commit (après accord Benoit)** — message : `feat(observabilite): Sentry serveur (onRequestError + withSentryConfig), errors-only sans PII`

---

### Task 3: Socle ESLint (flat config) + frontières d'imports

Spec §3.3. Aucune config ESLint n'existe et `next lint` est supprimé en Next 16.

**Files:**
- Create: `apps/web/eslint.config.mjs`
- Modify: `apps/web/package.json` (script `lint`, devDeps `@eslint/eslintrc` + `eslint-plugin-import-x`)
- Modify: `apps/web/src/features/insights/actions.ts:8` (eslint-disable temporaire documenté)

**Interfaces:**
- Produces: `pnpm --filter @glagency/web lint` fonctionnel, frontières `lib → features → app` + cross-feature interdit. La CI (Task 4) l'exécute.

- [ ] **Step 1: Installer les deps**

```bash
pnpm --filter @glagency/web add -D @eslint/eslintrc eslint-plugin-import-x
```

- [ ] **Step 2: Créer `apps/web/eslint.config.mjs`**

```js
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import * as importX from 'eslint-plugin-import-x'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// Une zone par feature : une feature ne peut importer AUCUNE autre feature.
// Liste dérivée du filesystem → zéro drift quand une feature est ajoutée/supprimée.
const features = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { 'import-x': importX },
    rules: {
      // Frontières (Bulletproof React) : lib → features → app, unidirectionnel.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            // Personne n'importe app/
            { target: './src/features', from: './src/app' },
            { target: './src/components', from: './src/app' },
            { target: './src/lib', from: './src/app' },
            // lib et components (partagés) n'importent pas les features
            { target: './src/lib', from: './src/features' },
            { target: './src/components', from: './src/features' },
            // Cross-feature interdit
            ...features.map((f) => ({
              target: `./src/features/${f}`,
              from: './src/features',
              except: [`./${f}`],
            })),
          ],
        },
      ],
    },
  },
]
```

- [ ] **Step 3: `apps/web/package.json`** — remplacer `"lint": "next lint"` par `"lint": "eslint ."`.

- [ ] **Step 4: Exception temporaire documentée** — dans `apps/web/src/features/insights/actions.ts`, au-dessus de la ligne 8 :

```ts
// eslint-disable-next-line import-x/no-restricted-paths -- lecture partagée : promue
// dans lib/services/ à la PR pilote (plan 2026-07-16, Task 13) ; disable retiré là-bas.
import { getChatters } from '@/features/chatters/services/get-chatters'
```

- [ ] **Step 5: Lint + corrections**

Run: `pnpm --filter @glagency/web lint`
Expected: 0 erreur de frontières. S'il reste des erreurs `next/typescript` héritées (unused vars, etc.), les corriger si triviales (< 10) ; sinon les lister et demander à Benoit avant de désactiver une règle.

- [ ] **Step 6: Commit (après accord Benoit)** — `chore(lint): eslint.config.mjs flat + frontières d'imports (lib→features→app, cross-feature interdit)`

---

### Task 4: CI GitHub Actions — SUPPRIMÉE (décision Benoit, 2026-07-16)

Pas de CI. Les vérifications (`next typegen` + `tsc --noEmit`, `eslint .`, Vitest core)
restent exécutées LOCALEMENT à la fin de chaque task et en fin de PR — inchangé.

---

### Task 5: `typedRoutes` + headers de sécurité + noindex

Spec §2.7. CSP à nonce incompatible PPR → headers statiques.

**Files:**
- Modify: `apps/web/next.config.ts` (dans `nextConfig`)
- Modify: `apps/web/src/app/layout.tsx` (metadata robots)
- Modify (si typecheck l'exige): `apps/web/src/config/workspaces.ts` (type des `href`)

- [ ] **Step 1: `next.config.ts`** — ajouter dans `nextConfig` (après `reactCompiler: true,`) :

```ts
  // Liens typés : un href inexistant = erreur de typecheck (filet pour la réorg des routes).
  typedRoutes: true,
  // Dashboard interne sur URL publique : anti-embed/sniff/leak. CSP volontairement sans
  // nonce (le nonce force le rendu dynamique — incompatible PPR/cacheComponents).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
```

- [ ] **Step 2: `layout.tsx`** — ajouter à l'objet `metadata` :

```ts
  // Dashboard privé : jamais indexé.
  robots: { index: false, follow: false },
```

- [ ] **Step 3: Typegen + typecheck**

Run: `pnpm --filter @glagency/web exec next typegen && pnpm --filter @glagency/web typecheck`
Expected: si des erreurs `href` apparaissent (string non assignable à `Route`), corriger à la SOURCE : dans `config/workspaces.ts`, typer les champs `href` en `Route` (`import type { Route } from 'next'`), et pour les URLs construites dynamiquement (`lib/nav.ts` `withPeriod`) caster le retour `as Route` avec un commentaire une ligne. Ne PAS caster dans les composants consommateurs.

- [ ] **Step 4: Vérif manuelle** — `pnpm dev`, ouvrir une page, onglet Réseau : les 4 headers présents sur la réponse document.

- [ ] **Step 5: Commit (après accord Benoit)** — `feat(securite): headers statiques (CSP frame-ancestors, nosniff, referrer, permissions) + noindex + typedRoutes`

---

### Task 6: `lib/env.ts` réellement branché

Spec §2.7 — le schéma existe mais `getPublicEnv()` n'appelle jamais `parse`.

**Files:**
- Modify: `apps/web/src/lib/env.ts` (réécriture complète)
- Modify: `apps/web/src/lib/supabase/server.ts`, `apps/web/src/lib/supabase/client.ts`

**Interfaces:**
- Produces: `getPublicEnv(): { url: string; publishableKey: string }` — throw explicite au premier appel si l'env est invalide.

- [ ] **Step 1: Réécrire `apps/web/src/lib/env.ts`**

```ts
import { z } from 'zod'

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

let cached: { url: string; publishableKey: string } | null = null

/**
 * Env public validé (client + serveur). Accès STATIQUES aux NEXT_PUBLIC_* (inlinées au
 * build par Next — un accès dynamique par clé renverrait undefined côté client).
 * Env invalide → throw au premier appel : crash explicite au boot, pas d'undefined silencieux.
 */
export function getPublicEnv() {
  if (cached) return cached
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  if (!parsed.success) throw new Error(`Env public invalide :\n${z.prettifyError(parsed.error)}`)
  cached = {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }
  return cached
}
```

- [ ] **Step 2: Consommer dans les clients Supabase**

`server.ts` : remplacer les deux arguments `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!` par :

```ts
  const env = getPublicEnv()
  return createServerClient<Database>(env.url, env.publishableKey, { /* cookies inchangé */ })
```

`client.ts` : idem avec `const env = getPublicEnv()` puis `createBrowserClient<Database>(env.url, env.publishableKey)`. Ajouter l'import `import { getPublicEnv } from '@/lib/env'` dans les deux.

- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`, puis `pnpm dev` + login OTP → session OK.

- [ ] **Step 4: Commit (après accord Benoit)** — `fix(env): validation Zod effective de l'env public (z.url, crash explicite) branchée dans les clients Supabase`

---

### Task 7: `lib/actions.ts` — `ActionResult<T>` + `runAction`

Spec §2.5.1-2. Remplace les 13 contrats locaux (migration des features aux batches suivants ; le pilote l'adopte en Task 14).

**Files:**
- Create: `apps/web/src/lib/actions.ts`

**Interfaces:**
- Produces (consommé par Task 14 puis toutes les actions) :
  - `type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string; fieldErrors?: Record<string, string[]> }`
  - `runAction({ schema, input, guard, handler }): Promise<ActionResult<T>>`

- [ ] **Step 1: Créer `apps/web/src/lib/actions.ts`**

```ts
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

/** Contrat de retour UNIQUE des Server Actions (spec 2026-07-16 §2.5). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * Enchaîne les obligations d'une Server Action : garde d'auth → validation Zod →
 * handler. Erreur MÉTIER = retour typé (guard/fieldErrors) ; erreur TECHNIQUE =
 * capturée Sentry + message générique (jamais un message Supabase brut à l'écran).
 * La RLS reste le garde-fou réel — la garde ici est la défense en profondeur.
 */
export async function runAction<S extends z.ZodType, T = void>(opts: {
  schema: S
  input: unknown
  guard: () => Promise<{ ok: true } | { ok: false; error: string }>
  handler: (values: z.infer<S>) => Promise<T>
}): Promise<ActionResult<T>> {
  const gate = await opts.guard()
  if (!gate.ok) return { success: false, error: gate.error }

  const parsed = opts.schema.safeParse(opts.input)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return {
      success: false,
      error: 'Saisie invalide',
      fieldErrors: fieldErrors as Record<string, string[]>,
    }
  }

  try {
    return { success: true, data: await opts.handler(parsed.data) }
  } catch (err) {
    Sentry.captureException(err)
    return { success: false, error: 'Erreur inattendue — réessaie ou préviens l’admin.' }
  }
}
```

- [ ] **Step 2: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` : PASS.

- [ ] **Step 3: Commit (après accord Benoit)** — `feat(actions): contrat ActionResult<T> partagé + runAction (zod, garde, capture Sentry, message générique)`

---

### Task 8: sonner — toasts globaux

Spec §2.5.4. Seule nouvelle dépendance UI. Vigilance : shadcn a basculé sur Base UI par défaut en juillet 2026 — notre `components.json` (style Radix existant) doit continuer à servir du Radix ; si le composant généré importe `@base-ui/*`, s'arrêter et le signaler.

**Files:**
- Create: `apps/web/src/components/ui/sonner.tsx` (via CLI shadcn)
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Installer**

```bash
cd apps/web && pnpm dlx shadcn@latest add sonner
```

Expected: crée `src/components/ui/sonner.tsx` (wrapper `next-themes`) + ajoute `sonner` aux dependencies. Inspecter le fichier généré : imports = `sonner` + `next-themes` uniquement.

- [ ] **Step 2: Monter le Toaster** — dans `apps/web/src/app/layout.tsx`, ajouter `import { Toaster } from '@/components/ui/sonner'` puis, dans le JSX, après `</ThemeProvider>` et avant `<Analytics />` :

```tsx
        <Toaster position="top-right" richColors />
```

- [ ] **Step 3: Vérifier** — `pnpm dev` : l'app démarre, aucun changement visuel (le Toaster est invisible sans toast).

- [ ] **Step 4: Commit (après accord Benoit)** — `feat(ui): sonner + Toaster global (feedback des mutations)`

---

### Task 9: Boundaries d'erreur — `ErrorFallback` partagé + `error.tsx` par workspace

Spec §2.4.2. `unstable_retry` (Next 16.2) re-fetch le segment ; `reset()` ne re-fetchait pas.

**Files:**
- Create: `apps/web/src/components/error-fallback.tsx`
- Create: `apps/web/src/app/(dash)/chatter/error.tsx`
- Create: `apps/web/src/app/(dash)/marketing/error.tsx`
- Modify: `apps/web/src/app/(dash)/error.tsx` (réécriture sur le composant partagé)

- [ ] **Step 1: Créer `apps/web/src/components/error-fallback.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

/**
 * Fallback partagé des error.tsx. Capture Sentry ici (les erreurs attrapées par une
 * boundary n'atteignent JAMAIS le handler global — doc Sentry) ; côté serveur,
 * onRequestError a déjà capturé l'erreur d'origine (ici on ne voit que le digest).
 */
export function ErrorFallback({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      <div>
        <h2 className="text-lg font-semibold">Une erreur est survenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette section n’a pas pu se charger. Réessaie, ou recharge la page si le problème
          persiste.
        </p>
      </div>
      <Button onClick={retry} variant="outline" size="sm">
        Réessayer
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Créer `apps/web/src/app/(dash)/chatter/error.tsx`**

```tsx
'use client'

import { ErrorFallback } from '@/components/error-fallback'

// unstable_retry (Next 16.2) : re-fetch + re-render du segment (reset() ne re-fetch pas).
export default function ChatterError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <ErrorFallback error={error} retry={unstable_retry} />
}
```

- [ ] **Step 3: Créer `apps/web/src/app/(dash)/marketing/error.tsx`** — même contenu, composant nommé `MarketingError`.

- [ ] **Step 4: Réécrire `apps/web/src/app/(dash)/error.tsx`** (filet du dash) sur le même modèle : garder le commentaire de tête existant, composant `DashError`, props `{ error, unstable_retry }`, retour `<ErrorFallback error={error} retry={unstable_retry} />`. Supprimer le `useEffect`/`Sentry`/JSX locaux (portés par `ErrorFallback`).

- [ ] **Step 5: Vérif manuelle** — dans `lib/services` n'existe pas encore : ajouter temporairement `throw new Error('test boundary')` en tête de `getChatters` (`features/chatters/services/get-chatters.ts:64`), `pnpm dev`, ouvrir `/chatter/chatters` : le fallback s'affiche (sidebar intacte), « Réessayer » re-tente. RETIRER le throw ensuite.

- [ ] **Step 6: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` : PASS.

- [ ] **Step 7: Commit (après accord Benoit)** — `feat(erreurs): ErrorFallback partagé (Sentry + unstable_retry + role=alert) + error.tsx par workspace`

---

### Task 10: Skeletons dimensionnés + a11y

Spec §2.3.3. Utilisés par le pilote (Task 17) puis toutes les migrations.

**Files:**
- Create: `apps/web/src/components/skeletons/table-skeleton.tsx`
- Create: `apps/web/src/components/skeletons/kpi-skeleton.tsx`
- Modify: `apps/web/src/components/page-skeleton.tsx` (a11y)
- Modify: `apps/web/src/app/globals.css` (reduced motion)

**Interfaces:**
- Produces: `<TableSkeleton rows?: number />` (silhouette toolbar + table), `<KpiSkeleton count?: number />` (rangée de cartes). Fallbacks de `<Suspense>` et des `loading.tsx`.

- [ ] **Step 1: Créer `table-skeleton.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette d'une table du dash (toolbar + header + lignes), dimensions ~ contenu final (anti-CLS). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer `kpi-skeleton.tsx`**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette d'une rangée de cartes KPI, dimensions ~ kpi-card (anti-CLS). */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-28" />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: `page-skeleton.tsx`** — envelopper le JSX existant : `role="status"` sur le div racine, `<span className="sr-only">Chargement…</span>` en premier enfant, `aria-hidden="true"` sur le conteneur des Skeleton. Aucune classe visuelle modifiée.

- [ ] **Step 4: `globals.css`** — ajouter à la fin :

```css
/* a11y : pas d'animation de skeleton pour prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .animate-pulse {
    animation: none;
  }
}
```

- [ ] **Step 5: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` : PASS (les composants seront consommés en Task 17 — l'import inutilisé n'existe pas encore, c'est normal).

- [ ] **Step 6: Commit (après accord Benoit)** — `feat(ui): TableSkeleton + KpiSkeleton dimensionnés (role=status, sr-only, reduced-motion)`

---

### Task 11: `api/revalidate` + appel en fin d'ingestion

Spec §2.2.1 — le chaînon manquant : `cacheTag('facts-daily')` n'est jamais invalidé.

**Files:**
- Create: `apps/web/src/app/api/revalidate/route.ts`
- Modify: `apps/web/src/proxy.ts:11` (early-return `/api/revalidate`)
- Modify: `apps/ingestion/src/main.ts` (appel post-run)
- Modify: `.env.example` (`REVALIDATE_SECRET`, `REVALIDATE_URL`)

**Interfaces:**
- Produces: `POST /api/revalidate` — header `x-revalidate-secret`, body `{ "tags": ["facts-daily"] }` → `revalidateTag(tag, 'max')` (SWR assumé : 1 vue potentiellement périmée post-cron, non bloquante — spec §2.2.1).

- [ ] **Step 1: Créer `apps/web/src/app/api/revalidate/route.ts`**

```ts
import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

/** Tags invalidables de l'extérieur — liste FERMÉE (pas de revalidation arbitraire). */
const ALLOWED_TAGS = ['facts-daily'] as const

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Appelé par apps/ingestion en fin de run : expire les caches `use cache` taggés
 * (profil 'max' = stale-while-revalidate, non bloquant). Secret partagé en header
 * (pas en query — les query params fuitent dans les logs), comparé en timing-safe.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const got = req.headers.get('x-revalidate-secret')
  if (!secret || !got || !safeEqual(got, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { tags?: unknown } | null
  const asked = Array.isArray(body?.tags) ? body.tags.filter((t) => typeof t === 'string') : []
  const tags = asked.filter((t): t is (typeof ALLOWED_TAGS)[number] =>
    (ALLOWED_TAGS as readonly string[]).includes(t),
  )
  if (tags.length === 0) return NextResponse.json({ error: 'no valid tags' }, { status: 400 })
  for (const tag of tags) revalidateTag(tag, 'max')
  return NextResponse.json({ revalidated: tags })
}
```

- [ ] **Step 2: `proxy.ts`** — remplacer la ligne 11 :

```ts
  // Routes machine-à-machine (keep-alive, webhook de revalidation) : pas de session.
  if (['/api/ping', '/api/revalidate'].includes(request.nextUrl.pathname)) return NextResponse.next()
```

(La route reste protégée par son secret — le proxy ne doit juste pas la rediriger vers /login.)

- [ ] **Step 3: `apps/ingestion/src/main.ts`** — ajouter avant l'appel `runPipeline` :

```ts
/** Prévient le dashboard qu'un run vient d'écrire des faits → expire les caches taggés. */
async function pingRevalidate(): Promise<void> {
  const url = process.env.REVALIDATE_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!url || !secret) return // env absente (dev) : no-op silencieux
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: ['facts-daily'] }),
    })
    if (!res.ok) console.warn(`[ingestion] revalidate KO (${res.status})`)
  } catch (e) {
    console.warn('[ingestion] revalidate injoignable', e)
  }
}
```

et dans le `.then` du run, après `await recordRun('local', startedAt, { summary })` :

```ts
    await pingRevalidate()
```

- [ ] **Step 4: `.env.example`** — ajouter :

```
# Revalidation du cache web après ingestion (secret partagé web ↔ worker)
REVALIDATE_SECRET=
REVALIDATE_URL= # ex. https://<app>.vercel.app/api/revalidate
```

- [ ] **Step 5: Vérif manuelle** — `pnpm dev` + `REVALIDATE_SECRET=test` dans `.env.local` :

```bash
curl -s -X POST localhost:3000/api/revalidate -H 'x-revalidate-secret: test' -H 'content-type: application/json' -d '{"tags":["facts-daily"]}'
# → {"revalidated":["facts-daily"]}
curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/revalidate -H 'x-revalidate-secret: faux' -d '{}'
# → 401
```

Rappel : ajouter `REVALIDATE_SECRET` aux env Vercel + `REVALIDATE_URL`/`REVALIDATE_SECRET` à l'env du worker d'ingestion (action manuelle Benoit).

- [ ] **Step 6: Commit (après accord Benoit)** — `feat(cache): POST /api/revalidate (secret timing-safe, tags fermés) + appel en fin d'ingestion — facts-daily enfin invalidé`

---

### Task 12: Nettoyage deps Cloudflare (web)

**Files:**
- Modify: `apps/web/package.json` (retirer `@sentry/cloudflare` des dependencies, `wrangler` des devDependencies)

- [ ] **Step 1: Vérifier zéro usage** — `grep -rn "@sentry/cloudflare\|wrangler" apps/web/src apps/web/*.ts apps/web/*.mjs` → aucun résultat (le commentaire wrangler de `instrumentation.ts` a été réécrit en Task 2).
- [ ] **Step 2: Retirer** — supprimer les deux lignes de `apps/web/package.json`, puis `pnpm install` (met le lockfile à jour). `apps/ingestion` garde les siens.
- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/web build` : PASS.
- [ ] **Step 4: Commit (après accord Benoit)** — `chore(deps): retrait wrangler + @sentry/cloudflare de apps/web (reliquats Cloudflare, cible Vercel)`

---

### Fin de PR 1 — vérification globale

- [ ] `pnpm --filter @glagency/web exec next typegen && pnpm typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/core test && pnpm --filter @glagency/web build` — tout PASS.
- [ ] Vérif manuelle `pnpm dev` : login, navigation chatter + marketing, aucun changement visuel hors plan.
- [ ] Rappeler à Benoit les actions manuelles (dashboard) : env Vercel `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` + `REVALIDATE_SECRET` (et `REVALIDATE_URL`/`REVALIDATE_SECRET` côté worker d'ingestion) ; vérifier au Dashboard Supabase que les **clés JWT asymétriques** sont actives (sinon `getClaims` = 1 aller-retour réseau/requête, spec §5) ; vérifier le **plan de backups Supabase** (tables mutées par l'app non ré-ingérables, spec §2.7).
- [ ] Invoquer `superpowers:requesting-code-review`, puis ouvrir la PR (`gh pr create`) **après accord Benoit**.

---

# BATCH 1 — Pilote `/chatter/chatters` (PR 2, branche `feat/standard-feature-pilote` depuis `main` après merge PR 1)

### Task 13: Promotion `get-chatters` → `lib/services/` + RPC typé + erreur avalée corrigée

Spec §2.1.1-2, §3.3. La lecture est partagée (chatters + insights) → elle monte dans `lib/`. Ses types domaine montent avec elle (une `lib/` n'importe pas `features/`).

**Files:**
- Create: `apps/web/src/lib/types/revenue.ts` (type `RevenueScope` déplacé)
- Move: `apps/web/src/features/chatters/types.ts` → `apps/web/src/lib/types/chatters.ts`
- Move: `apps/web/src/features/chatters/services/get-chatters.ts` → `apps/web/src/lib/services/get-chatters.ts`
- Modify: `apps/web/src/components/revenue-scope-note.tsx`, `apps/web/src/app/(dash)/chatter/chatters/page.tsx`, `apps/web/src/features/insights/actions.ts`, `apps/web/src/features/chatters/schema.ts`, `apps/web/src/features/chatters/components/*.tsx`, `apps/web/src/features/chatters/ChattersTemplate.tsx` (imports)

**Interfaces:**
- Produces: `getChatters(period: Period, opts?: { restricted?: boolean }): Promise<ChattersData>` depuis `@/lib/services/get-chatters` ; types domaine (`ChattersData`, `ChatterRow`, `ChatterModel`, `DailyRanking`, `CrmRole/Team/Shift`, constantes `CRM_*`) depuis `@/lib/types/chatters` ; `RevenueScope` depuis `@/lib/types/revenue`.

- [ ] **Step 1: Extraire `RevenueScope`** — créer `apps/web/src/lib/types/revenue.ts` avec l'interface `RevenueScope` copiée depuis `components/revenue-scope-note.tsx` (la retirer de là, l'importer depuis lib). Mettre à jour TOUS les importeurs : `grep -rn "RevenueScope" apps/web/src` et remplacer par `import type { RevenueScope } from '@/lib/types/revenue'`.

- [ ] **Step 2: Déplacer les types** — `git mv apps/web/src/features/chatters/types.ts apps/web/src/lib/types/chatters.ts`, y corriger l'import `RevenueScope` (→ `@/lib/types/revenue`). Mettre à jour les importeurs (`grep -rn "from '../types'\|features/chatters/types" apps/web/src`) → `@/lib/types/chatters`.

- [ ] **Step 3: Déplacer le service** — `git mv apps/web/src/features/chatters/services/get-chatters.ts apps/web/src/lib/services/get-chatters.ts`, puis remplacer sa section fetch (lignes 60-84 d'origine) par :

```ts
export async function getChatters(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<ChattersData> {
  const restricted = opts.restricted ?? false
  const supabase = await createClient()

  // Champs closing CRM (chatters.role/team/shift, migration 0029) — hors RPC pour ne pas
  // toucher chatters_report ; lecture couverte par la policy chatters_scoped_read.
  const [rpcRes, crmRes] = await Promise.all([
    supabase
      .rpc('chatters_report', { p_from: period.from, p_to: period.to })
      // Le RPC renvoie du Json : on applique le contrat local via le modifier officiel.
      .overrideTypes<Report | null, { merge: false }>(),
    supabase.from('chatters').select('id, role, team, shift'),
  ])
  if (rpcRes.error) throw new Error(rpcRes.error.message)
  if (crmRes.error) throw new Error(crmRes.error.message)
  const rep = rpcRes.data ?? {
    totals: [],
    by_creator: [],
    chatters: [],
    scope: { attributed: 0, messaging: 0, all_accounts: 0 },
    ranking: null,
  }

  const chMeta = new Map(rep.chatters.map((c) => [c.id, c]))
  const crmById = new Map((crmRes.data ?? []).map((c) => [c.id, c]))
```

Le reste du fichier (agrégation, lignes 85-194 d'origine) est déplacé TEL QUEL. Corriger l'import types (`'../types'` → `'@/lib/types/chatters'`). Le commentaire périmé « chatters_report n'est pas dans les types générés » (lignes 67-70 d'origine) disparaît ; l'ancien docstring de la fonction (lignes 46-59) est conservé.

- [ ] **Step 4: Mettre à jour les 2 consommateurs** — `page.tsx` et `insights/actions.ts` : `import { getChatters } from '@/lib/services/get-chatters'`. Dans `insights/actions.ts`, RETIRER le `eslint-disable-next-line` posé en Task 3 (plus de violation).

- [ ] **Step 5: Vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Expected: PASS, zéro `as never` restant dans le fichier (`grep -n "as never" apps/web/src/lib/services/get-chatters.ts` → vide).
Manuel: `pnpm dev`, `/chatter/chatters` s'affiche à l'identique (mêmes chiffres), et l'onglet insights fonctionne (bouton bilan admin).

- [ ] **Step 6: Commit (après accord Benoit)** — `refactor(chatters): get-chatters promu dans lib/services (lecture partagée), RPC typé via overrideTypes, erreur du select CRM enfin propagée`

---

### Task 14: `schema.ts` Zod v4 + `actions.ts` sur `runAction`

**Files:**
- Modify: `apps/web/src/features/chatters/schema.ts`
- Modify: `apps/web/src/features/chatters/actions.ts` (réécriture complète)

**Interfaces:**
- Consumes: `runAction`/`ActionResult` (Task 7), `updateChatterCrmInput` (schema).
- Produces: `updateChatterCrm(raw: unknown): Promise<ActionResult>` — consommé par le dialog (Task 15).

- [ ] **Step 1: `schema.ts`** — remplacer `chatterId: z.string().uuid(),` par `chatterId: z.uuid(),` et corriger l'import types → `@/lib/types/chatters`.

- [ ] **Step 2: Réécrire `actions.ts`**

```ts
'use server'

// Server Action d'édition des champs closing d'un chatteur — supabase-js + RLS.
// Droit : admin ou page `chatters` (aligné sur la policy chatters_crm_update, 0029).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { runAction, type ActionResult } from '@/lib/actions'
import { updateChatterCrmInput } from './schema'

export async function updateChatterCrm(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateChatterCrmInput,
    input: raw,
    guard: async () => {
      const profile = await getProfile()
      return profile && (profile.role === 'admin' || profile.pages.includes('chatters'))
        ? { ok: true }
        : { ok: false, error: 'Accès refusé' }
    },
    handler: async (values) => {
      const supabase = await createClient()
      const { error } = await supabase
        .from('chatters')
        .update({ role: values.role, team: values.team, shift: values.shift })
        .eq('id', values.chatterId)
      // Erreur technique → throw : runAction capture (Sentry) + message générique.
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/chatters')
    },
  })
}
```

- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/web typecheck` : PASS (le dialog consomme encore `res.success`/`res.error` — compatibles).

- [ ] **Step 4: Commit (après accord Benoit)** — `refactor(chatters): action updateChatterCrm sur runAction (Sentry, message générique) + z.uuid()`

---

### Task 15: Dialog CRM → RHF + zodResolver + toasts

Spec §2.5.3-4. Remplace les `useState`×3 sans validation client.

**Files:**
- Modify: `apps/web/src/features/chatters/components/chatter-crm-dialog.tsx` (réécriture complète)

**Interfaces:**
- Consumes: `updateChatterCrm` (Task 14), `updateChatterCrmInput`/`UpdateChatterCrmInput` (schema), `toast` (sonner), types depuis `@/lib/types/chatters`.

- [ ] **Step 1: Réécrire le fichier**

```tsx
'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ActionButton } from '@/components/action-button'
import { updateChatterCrm } from '../actions'
import { updateChatterCrmInput, type UpdateChatterCrmInput } from '../schema'
import { CRM_ROLES, CRM_SHIFTS, CRM_TEAMS } from '@/lib/types/chatters'
import type { ChatterRow } from '@/lib/types/chatters'

const LABELS: Record<string, string> = {
  closer: 'Closer',
  setter: 'Setter',
  rouge: 'Rouge',
  bleue: 'Bleue',
  matin: 'Matin',
  aprem: 'Après-midi',
  soir: 'Soir',
}
const NONE = 'none' // valeur sentinelle des selects (Radix refuse la string vide)

function CrmSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: readonly string[]
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-sm text-muted-foreground">
            —
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-sm">
              {LABELS[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Crayon + dialog : édite rôle / équipe (rouge-bleue) / shift closing d'un chatteur. */
export function ChatterCrmDialog({ chatter }: { chatter: ChatterRow }) {
  const [open, setOpen] = useState(false)
  const form = useForm<UpdateChatterCrmInput>({
    resolver: zodResolver(updateChatterCrmInput),
    defaultValues: {
      chatterId: chatter.id,
      role: chatter.role,
      team: chatter.team,
      shift: chatter.shift,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await updateChatterCrm(values)
    if (!res.success) {
      // Erreur métier/technique : message de l'action (jamais un message Supabase brut).
      form.setError('root.serverError', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(`Closing de ${chatter.name} enregistré`)
    setOpen(false)
  })

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Réouverture : repartir des valeurs actuelles de la ligne (pas d'un vieux brouillon).
    if (next)
      form.reset({ chatterId: chatter.id, role: chatter.role, team: chatter.team, shift: chatter.shift })
  }

  const serverError = form.formState.errors.root?.serverError?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Éditer closing">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Closing — {chatter.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <CrmSelect label="Rôle" value={field.value} options={CRM_ROLES} onChange={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="team"
            render={({ field }) => (
              <CrmSelect label="Équipe" value={field.value} options={CRM_TEAMS} onChange={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="shift"
            render={({ field }) => (
              <CrmSelect label="Shift" value={field.value} options={CRM_SHIFTS} onChange={field.onChange} />
            )}
          />
          {serverError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {serverError}
            </p>
          )}
          <ActionButton type="submit" pending={form.formState.isSubmitting} className="self-end">
            Enregistrer
          </ActionButton>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Vérif manuelle** — `pnpm dev`, `/chatter/chatters` : éditer un closing → toast succès, valeurs mises à jour dans la table ; couper le réseau (devtools offline) et soumettre → toast d'erreur générique.

- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` : PASS.

- [ ] **Step 4: Commit (après accord Benoit)** — `refactor(chatters): dialog CRM sur RHF + zodResolver (schéma partagé exécuté client) + toasts sonner`

---

### Task 16: Split de `chatters-table.tsx` (351 l.) par responsabilité

Spec §3.5. DOM final identique — pur déplacement.

**Files:**
- Create: `apps/web/src/features/chatters/components/chatters-columns.tsx` (lignes 27-213 d'origine : `canExpand` + `columns`)
- Create: `apps/web/src/features/chatters/components/chatters-sub-rows.tsx` (lignes 215-261 : `chatterSubRows`)
- Create: `apps/web/src/features/chatters/components/download-ranking.ts` (lignes 263-279 : `downloadRanking`)
- Modify: `apps/web/src/features/chatters/components/chatters-table.tsx` (ne garde que le composant)

**Interfaces:**
- Produces: `columns: ColumnDef<ChatterRow>[]` + `canExpand(c: ChatterRow): boolean` (chatters-columns), `chatterSubRows(row: Row<ChatterRow>): ReactNode` (chatters-sub-rows), `downloadRanking(r: DailyRanking, top: number): void` (download-ranking). Consommés uniquement par `chatters-table.tsx`.

- [ ] **Step 1: `chatters-columns.tsx`** — `'use client'` en tête ; déplacer `canExpand` + `columns` avec leurs imports exacts : `ColumnDef` (@tanstack/react-table), `ChevronRight` (lucide), `Badge`, `Sortable`, `HeaderInfo`, `cn`, `modelColor`, `STATUS_COLORS`, `eur`, `pct`, `ChatterCrmDialog` (`'./chatter-crm-dialog'`), types depuis `@/lib/types/chatters`. Exporter `columns` et `canExpand`.
- [ ] **Step 2: `chatters-sub-rows.tsx`** — `'use client'` ; déplacer `chatterSubRows` avec `Row` (@tanstack/react-table), `TableCell`/`TableRow` (ui/table), `Badge`, `modelColor`, `eur`, `pct`, type `ChatterRow`. Exporter la fonction.
- [ ] **Step 3: `download-ranking.ts`** — pas de `'use client'` (fonction pure DOM appelée depuis un composant client) ; déplacer `downloadRanking` + import `frWeekdayDate` (@glagency/core) + type `DailyRanking` (`@/lib/types/chatters`). Exporter.
- [ ] **Step 4: Recomposer `chatters-table.tsx`** — le fichier ne garde que `ChattersTable` (lignes 281-351 d'origine) + ses imports (`useMemo`/`useState`, `Download` lucide, `Combobox`, `Button`, `DropdownMenu*`, `DataTable`, et les trois nouveaux modules). Résultat ≤ 100 lignes.
- [ ] **Step 5: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint` PASS ; `pnpm dev` : table identique (tri, filtre, expansion, sélecteur modèle, téléchargement classement Top 10/15 OK). `wc -l` des 4 fichiers : tous < 250.
- [ ] **Step 6: Commit (après accord Benoit)** — `refactor(chatters): split de chatters-table (columns / sub-rows / download-ranking) — DOM identique`

---

### Task 17: `page.tsx` — shell immédiat + `<Suspense>` + `TableSkeleton`

Spec §2.3.2, §4.5. Le h1 s'affiche sans attendre le RPC ; la table streame.

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/chatters/page.tsx` (réécriture complète)
- Modify: `apps/web/src/features/chatters/ChattersTemplate.tsx` (le h1 remonte dans la page)
- Modify: `apps/web/src/app/(dash)/chatter/chatters/loading.tsx` (reste, silhouette affinée)

**Interfaces:**
- Consumes: `TableSkeleton` (Task 10), `getChatters` depuis `@/lib/services/get-chatters` (Task 13), `ChattersData` depuis `@/lib/types/chatters`.

- [ ] **Step 1: Réécrire `page.tsx`**

```tsx
import { Suspense } from 'react'
import { getChatters } from '@/lib/services/get-chatters'
import { requireAccess } from '@/lib/auth'
import { ChattersTemplate } from '@/features/chatters/ChattersTemplate'
import { resolvePeriod } from '@/lib/period'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import type { ChattersData } from '@/lib/types/chatters'

export default async function ChattersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('chatters')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (pattern streaming, spec §2.3) : le shell (h1) s'affiche
  // immédiatement, la table streame dans son boundary quand le RPC répond.
  const data = getChatters(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Chatteurs</h1>
      <Suspense fallback={<TableSkeleton />}>
        <ChattersContent data={data} />
      </Suspense>
    </div>
  )
}

async function ChattersContent({ data }: { data: Promise<ChattersData> }) {
  return <ChattersTemplate data={await data} />
}
```

- [ ] **Step 2: Ajuster `ChattersTemplate.tsx`** — retirer le `<h1>` (remonté dans la page) et le wrapper extérieur qui le portait ; le Template rend désormais : sous-titre (`{data.period} · N chatteurs (M actifs)`), puis empty state OU (scope note + table), dans un `<div className="flex flex-col gap-6">` → structure DOM et classes inchangées par ailleurs. Fichier complet :

```tsx
import { ChattersTable } from './components/chatters-table'
import { RevenueScopeNote } from '@/components/revenue-scope-note'
import type { ChattersData } from '@/lib/types/chatters'

/** Template Chatteurs : compose la table à partir des données reçues. Aucun fetch. */
export function ChattersTemplate({ data }: { data: ChattersData }) {
  const active = data.chatters.filter((c) => c.active).length

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        {data.period} · {data.chatters.length} chatteurs ({active} actifs)
      </p>

      {data.chatters.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Aucune donnée chatteur sur cette période</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Aucune activité chatteur enregistrée sur la plage sélectionnée. Les données par
            chatteur sont ingérées chaque soir depuis le 30 juin — choisis une période couvrant
            ces jours.
          </p>
        </div>
      ) : (
        <>
          {data.scope && (
            <RevenueScopeNote scope={data.scope} active="attributed" periodLabel={data.period} />
          )}
          <ChattersTable chatters={data.chatters} dailyRanking={data.dailyRanking} />
        </>
      )}
    </div>
  )
}
```

(le `-mt-4` recolle le sous-titre au h1 comme avant — vérifier visuellement au Step 4 ; si le rendu diffère de l'existant, préférer passer le sous-titre en prop du h1 côté page.)

- [ ] **Step 3: `loading.tsx`** — remplacer `PageSkeleton` par la silhouette de CETTE page :

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <TableSkeleton />
    </div>
  )
}
```

- [ ] **Step 4: Vérif manuelle** — `pnpm dev` : (a) navigation depuis une autre page → h1 « Chatteurs » visible AVANT la table, skeleton de table puis données ; (b) throttle réseau (devtools Slow 3G) pour bien voir le streaming ; (c) empty state (période sans données) intact ; (d) aucun saut de layout visible (skeleton ≈ table).

- [ ] **Step 5: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build` : PASS (build : la page ne doit PAS lever d'erreur `blocking-route` — l'accès dynamique est bien sous Suspense).

- [ ] **Step 6: Commit (après accord Benoit)** — `feat(chatters): shell immédiat + Suspense/TableSkeleton (streaming par section, pilote du standard)`

---

### Task 18: Suppression des fixtures mortes `_data/`

Spec §3.1 (~24 000 lignes, zéro import — re-vérifier avant de supprimer).

**Files:**
- Delete: `apps/web/src/features/chatters/_data/`, `apps/web/src/features/models/_data/`, `apps/web/src/features/overview/_data/`

- [ ] **Step 1: Prouver zéro usage** — `grep -rn "_data" apps/web/src --include="*.ts" --include="*.tsx"` → aucun import. Si un import apparaît : STOP, signaler à Benoit.
- [ ] **Step 2: Supprimer** — `git rm -r apps/web/src/features/chatters/_data apps/web/src/features/models/_data apps/web/src/features/overview/_data`
- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web build` : PASS.
- [ ] **Step 4: Commit (après accord Benoit)** — `chore(features): suppression des fixtures _data mortes (chatters/models/overview, ~24k lignes)`

---

### Task 19: Documentation du standard

Spec §5 batch 1. La doc = le contrat que les batches 2-5 répliquent.

**Files:**
- Modify: `docs/guidelines-data-loading.md`
- Create: `docs/guidelines-standard-feature.md`
- Modify: `CLAUDE.md` (pointeur)

- [ ] **Step 1: `guidelines-data-loading.md`** — réécrire le passage « Tables hors types générés → cast `rpc('x' as never, ...)` » : les RPC sont désormais dans les types générés (`packages/db/src/types.ts`) → appel `supabase.rpc('nom', args)` typé + `.overrideTypes<T, { merge: false }>()` pour appliquer le contrat local au retour `Json` ; le cast `as never` ne se justifie que pour un objet réellement absent des types, avec TODO de régénération. Ajouter un § « Jour métier » : `todayParis()` (`@glagency/core`) obligatoire pour tout « aujourd'hui » — jamais `isoDate(new Date())` ni `new Date()` nu (bornes UTC fausses la nuit).

- [ ] **Step 2: Créer `docs/guidelines-standard-feature.md`** — contenu : le squelette canonique (§3 de la spec, copié), les règles loading (`loading.tsx` par route + Suspense par section + skeletons dimensionnés), erreurs (`ErrorFallback`, règles services/actions), mutations (`ActionResult` + `runAction` + toast sonner + revalidatePath/updateTag), forms (RHF + zodResolver + schema.ts partagé), filtres (`searchParams` + `useTransition`/`isPending` + `router.replace` — jamais de `useState` local pour un état partageable par URL, spec §2.3.4), images (convention avatars `<Image unoptimized>` de la spec §2.6, pour plus tard), la checklist « nouvelle feature » :

```markdown
## Checklist nouvelle feature
- [ ] Squelette : `<Feature>Template.tsx` + `services/` + `components/` (+ `actions.ts`/`schema.ts` si mutations/forms)
- [ ] `page.tsx` : garde d'accès + kickoff sans await + `<Suspense fallback={skeleton dimensionné}>`
- [ ] `loading.tsx` avec la silhouette de la page (route préfetchable)
- [ ] Lectures : RPC `SECURITY INVOKER` (agrégats) ou `fetchAll` ; TOUTE erreur destructurée et thrown ; « aujourd'hui » = `todayParis()`
- [ ] Mutations : `runAction` + `revalidatePath` (+ `updateTag` si cache taggé) + toast
- [ ] Forms : RHF + `zodResolver` + schéma partagé dans `schema.ts` (Zod v4 : `z.uuid()`, `z.flattenError()`)
- [ ] Aucun import d'une autre feature (ESLint le bloque) ; pas de barrel `index.ts`
- [ ] `pnpm --filter @glagency/web lint && typecheck` avant commit
```

- [ ] **Step 3: `CLAUDE.md`** — dans la section Règles, ajouter à la ligne data-loading existante : `+ docs/guidelines-standard-feature.md (squelette de feature, loading/erreurs/mutations/forms — checklist nouvelle feature)`.

- [ ] **Step 4: Commit (après accord Benoit)** — `docs: guidelines standard-feature (squelette + checklist) + data-loading à jour (RPC typés, jour métier Paris)`

---

### Fin de PR 2 — vérification globale et critères du pilote

- [ ] Vérification complète : `pnpm --filter @glagency/web exec next typegen && pnpm typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/core test && pnpm --filter @glagency/web build`.
- [ ] Critères de succès du pilote (spec §4) vérifiés à la main dans `pnpm dev` :
  - Navigation → skeleton instantané, h1 avant les données.
  - `throw` temporaire dans `getChatters` → boundary workspace + événement Sentry (vérifier le dashboard Sentry en préprod/prod) + « Réessayer » fonctionnel. Retirer le throw.
  - Dialog CRM : validation client, toast succès/erreur, jamais de message Supabase brut.
  - `grep -rn "as never" apps/web/src/lib/services/get-chatters.ts` → vide ; aucun fichier de la feature > 300 lignes (`wc -l`).
- [ ] Invoquer `superpowers:requesting-code-review` puis `superpowers:finishing-a-development-branch` (PR après accord Benoit).
