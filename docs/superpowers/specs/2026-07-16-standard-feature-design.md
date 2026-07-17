# Standard « feature » & réorganisation — design

**Date** : 2026-07-16 · **Statut** : design validé en session (Benoit), spec en
relecture · **Périmètre** : `apps/web` (+ 1 Route Handler consommé par `apps/ingestion`)
**Audit** : 48 affirmations vérifiées contre les sources primaires (passe adversariale
du 2026-07-16) — 0 réfutée ; les 11 nuances et les manques détectés sont intégrés ci-dessous.

## 1. Contexte & objectif

L'app compte 32 pages et 19 features qui suivent un même pattern de base
(`page.tsx` → `<Feature>Template.tsx` → composants) mais avec des trous transversaux
et de l'hétérogénéité : Sentry serveur désactivé, 1 seul `error.tsx` pour 32 pages,
contrat de Server Action redéclaré 13×, tag de cache jamais invalidé, 0 `<Suspense>`
granulaire, forms hétérogènes, 15 casts `as never` périmés, 8 fichiers > 300 lignes.

Objectif : définir **un standard de feature** (data, caching, loading, erreurs, forms,
images) aligné sur l'état de l'art de juillet 2026, l'appliquer sur un **pilote**
(`/chatter/chatters`), puis **migrer** toutes les features par batches, avec une
**réorganisation des dossiers** normalisée.

Décisions de cadrage (Benoit, 2026-07-16) :

- **Approche « consolider »** : pousser à fond les patterns déjà en place + boucher les
  trous. Robuste et scalable, sans sur-ingénierie. Pas de nouvelle lib lourde.
- **Pilote puis migration** par batches (pas de big-bang).
- **Fraîcheur des données : à la navigation** (pas de polling ni Realtime) — les données
  arrivent par le cron d'ingestion.
- **Stubs conservés** : `features/teams` et `features/compta` (+ routes placeholder)
  restent en place. Seules les fixtures mortes `_data/` sont supprimées (§ 3.1).
- **Marketing découpé** en features par sous-domaine pendant sa migration (§ 3.1).

## 2. Standard technique

### 2.1 Data (lectures)

Inchangé sur le principe — c'est déjà la guideline (`docs/guidelines-data-loading.md`) :
agrégats de tables de faits en RPC SQL `SECURITY INVOKER`, sinon `fetchAll`
(`lib/supabase/fetch-all.ts`), fetch uniquement dans `page.tsx` via
`features/<f>/services/get-*.ts`, Template = Server Component + feuille client.

Ce qui change :

1. **Suppression des casts `as never` périmés.** Les RPC (`chatters_report`,
   `health_report`, `models_report`, `bilan_report`, `overview_report`,
   `crm_spenders_tracker`) et la table `snap_codes` figurent désormais dans les types
   générés (`packages/db/src/types.ts:2040` pour `chatters_report`). Les 15 casts
   `rpc('x' as never, ... as never) as unknown as PromiseLike<...>` répartis sur
   7 fichiers sont du bruit obsolète. Le retour `Json` des RPC garde une interface TS
   locale (miroir main) — c'est inévitable et accepté. **Correctif d'implémentation
   (2026-07-16, pilote)** : `.overrideTypes<T>()` est INAPPLICABLE aux RPC déclarés
   `Returns: Json` — le garde `IsValidResultOverride` de postgrest-js 2.110 distribue
   sur l'union récursive `Json` et rejette tout override (vérifié, systémique aux 5
   RPC `*_report`). Pattern canonique : appel `supabase.rpc('nom', args)` **typé**
   (nom + args, plus de `as never`) puis cast documenté du data
   (`rpcRes.data as unknown as Report | null`), erreurs toujours destructurées.
2. **Jamais avaler une erreur de query.** Toute destructuration doit inclure `error` et
   le traiter (`throw`). Bug réel : `get-chatters.ts:71-77` ignore l'erreur du select
   `chatters` parallèle → colonnes CRM silencieusement nulles en cas d'échec.
3. **Borner ou paginer les 3 selects nus restants** (risque de troncature PostgREST à
   1000 lignes) : `insights/services/get-insights.ts:63-64` (`insight_states`,
   `profiles`), `repos/services/get-repos.ts:55` (`rest_planning_cells`),
   `snap-codes/services/get-snap-codes.ts:23`.
4. **Parallélisme** : requêtes indépendantes d'un même service en `Promise.all`
   (déjà pratiqué) ; pas de pattern `preload()` tant qu'aucun waterfall réel n'est mesuré.
5. **Mise à jour de `docs/guidelines-data-loading.md`** : le § « tables hors types
   générés → cast » est réécrit (les RPC sont désormais typés ; le cast ne se justifie
   que pour un objet réellement absent des types, avec TODO de régénération).
6. **Convention « jour métier » = Europe/Paris.** Bug réel détecté à l'audit :
   `isoDate` (`packages/core/src/domain/dates.ts:4`, basé `toISOString` = UTC) et
   `resolvePeriod` (`lib/period.ts:28`, `new Date()` = UTC sur Vercel) calculent
   « aujourd'hui » en UTC → entre 00:00 et 02:00 heure de Paris, les KPIs du jour sont
   vides/faux et la semaine bascule en retard le lundi. spenders fait déjà correct
   (`Intl.DateTimeFormat` + `timeZone: 'Europe/Paris'`, `spenders/types.ts:25`).
   Standard : helper unique `todayParis()` (+ dérivés semaine) dans `@glagency/core`,
   consommé par tous les services et `resolvePeriod`.

### 2.2 Caching & invalidation

Rappel (inchangé, confirmé par la doc Next 16) : **`use cache` uniquement sur des
lectures globales** via `createAdminClient` (hors RLS) — jamais sur une lecture
cookie-bound (interdit par Next : pas de `cookies()` dans `use cache` ; et cache partagé
entre users). Les pages RLS restent dynamiques : leur perçu vient de PPR
(`cacheComponents: true`, déjà actif) + streaming (§ 2.3).

Ce qui change :

1. **Invalidation du tag `facts-daily` par l'ingestion** — le chaînon manquant.
   Nouveau Route Handler `app/api/revalidate/route.ts` : `POST` authentifié par secret
   partagé (header + env `REVALIDATE_SECRET`), body `{ tags: string[] }`, appelle
   `revalidateTag(tag, 'max')` (profil SWR — forme à 2 arguments, la forme 1-arg est
   dépréciée). `apps/ingestion` l'appelle en fin de run. Sans ça, `get-ranking`
   (`use cache` + `cacheTag('facts-daily')`) sert des données périmées jusqu'à
   expiration de `cacheLife('hours')`. Choix assumé : `'max'` (SWR, non bloquant) —
   la première visite après le run peut encore servir l'ancienne donnée pendant le
   refresh en arrière-plan ; si la fraîcheur immédiate post-cron devient exigée, passer
   à `{ expire: 0 }` (bloquant — le pattern documenté pour les systèmes externes).
   Comparaison du secret en timing-safe (`crypto.timingSafeEqual`).
2. **Règle mutation** : chaque Server Action revalide la route affectée
   (`revalidatePath`) **et**, si la donnée mutée alimente un cache taggé, `updateTag(tag)`
   (stable Next 16, Server Actions only, read-your-own-writes dans la même requête).
   À connaître : `refresh()` (`next/cache`) est l'API dédiée au rafraîchissement des
   données **non cachées** d'une page — alternative si `revalidatePath` (qui sur-invalide,
   comportement temporaire documenté) se révèle trop grossier.
3. **Convention de tags** : kebab-case par domaine de données (`facts-daily` existant ;
   les nouveaux caches globaux définissent leur tag dans le service qui pose `cacheTag`).
4. **Amélioration ciblée, hors pilote** : tester `'use cache: remote'` sur `get-ranking`
   — en serverless Vercel, `use cache` simple est in-memory et produit peu de hits entre
   lambdas ; `remote` s'appuie sur le Runtime Cache Vercel, partagé entre les instances
   d'une région (parfait en mono-région cdg1) mais **régional, éphémère (éviction LRU) et
   facturé** — pas « durable » garanti. À mesurer avant généralisation.

Non retenus : `use cache: private` (expérimental, « not recommended for production »),
TanStack Query (voir Hors scope).

### 2.3 Loading UX

1. **`loading.tsx` sur chaque route.** C'est ce qui rend une route dynamique
   préfetchable par `<Link>` (layout + premier `loading.tsx`, au viewport ou au hover,
   prod uniquement) → navigation instantanée vers le skeleton. Avec PPR, les fallbacks
   `<Suspense>` de la page font aussi partie du shell préfetché — `loading.tsx` est le
   levier principal, pas le seul. 25/32 en ont déjà ; les 5 pages spenders manquantes
   seront couvertes par la normalisation de spenders (§ 3.1) ; `no-access` (cookie-bound
   via `requireUser`, donc pas statique) et les redirects `chatter/`/`marketing/` restent
   couverts par le boundary parent `(dash)/loading.tsx`.
2. **`<Suspense>` granulaire par section** sur les pages multi-blocs : le shell de la
   page (titre, filtres, KPI déjà connus) s'affiche immédiatement, chaque bloc lent
   streame dans son propre boundary. Pattern : kickoff des promises dans `page.tsx`
   **sans `await`**, chaque section async est wrappée dans son `<Suspense>` — ou la
   promise est passée à une feuille client qui fait `use(promise)`. Éviter le waterfall :
   requêtes **indépendantes** consommées par un même composant en `Promise.all`, sections
   indépendantes en boundaries sœurs ; une vraie dépendance séquentielle = composant
   async imbriqué derrière son propre `<Suspense>`.
3. **Skeletons dimensionnés** (anti-CLS) : nouveaux `components/skeletons/`
   (`table-skeleton.tsx`, `kpi-skeleton.tsx`, …) aux dimensions proches du contenu
   final, en remplacement progressif du `PageSkeleton` générique unique. Accessibilité
   intégrée une fois pour toutes dans ces composants partagés : conteneur `role="status"`
   + texte sr-only « Chargement… », squelettes `aria-hidden`, animation derrière
   `prefers-reduced-motion`.
4. **Filtres = `searchParams` + `useTransition`/`isPending` + `router.replace`** — le
   pattern déjà en place (date-range-picker, week-switcher) est codifié au standard :
   pas de `useState` local pour un état de filtre partageable par URL.

### 2.4 Erreurs & Sentry

1. **Réactiver Sentry serveur.** La désactivation (`src/instrumentation.ts` : `register()`
   vide) datait de la limite 3 MiB des Workers Cloudflare FREE — caduque depuis le
   passage à Vercel (2026-07-14). Setup officiel @sentry/nextjs ≥ 10.63 :
   - `instrumentation.ts` : `register()` importe `sentry.server.config.ts`
     (si `NEXT_RUNTIME === 'nodejs'`) et `sentry.edge.config.ts` (si `edge`) +
     `export const onRequestError = Sentry.captureRequestError` → capture toutes les
     erreurs serveur (RSC, Route Handlers, Server Actions non catchées).
   - `sentry.server.config.ts` / `sentry.edge.config.ts` : `Sentry.init({ dsn, enabled:
     prod })` — **errors-only : omettre `tracesSampleRate`** (sans `tracesSampleRate` ni
     `tracesSampler`, le tracing est désactivé ; corriger aussi le
     `instrumentation-client.ts` existant qui met `tracesSampleRate: 0` au lieu de
     l'omettre). **Pas de PII : ne passer ni `sendDefaultPii`** (déjà dépréciée en
     v10.6x, supprimée en v11) **ni `dataCollection`** — passer `dataCollection`, même
     partiel, opte dans des défauts PLUS permissifs (userInfo, cookies, headers
     collectés par défaut).
   - `next.config.ts` : réactiver `withSentryConfig` (org/project/`SENTRY_AUTH_TOKEN` en
     env, upload sourcemaps). Turbopack est supporté nativement dev **et** build prod.
   - Le client lazy-loadé actuel (`instrumentation-client.ts`) est conservé tel quel.
2. **`error.tsx` par workspace** : `app/(dash)/chatter/error.tsx` et
   `app/(dash)/marketing/error.tsx`, en plus du filet `(dash)/error.tsx` et du
   `global-error.tsx` existants. Tous : `Sentry.captureException(error)` dans
   `useEffect([error])` + bouton « Réessayer » branché sur **`unstable_retry()`**
   (Next 16.2 : re-fetch + re-render du segment ; `reset()` ne re-fetchait pas).
   Message dans un `role="alert"`, bouton focusable au libellé explicite.
3. **Règle services** : toute erreur de query est thrown → boundary. Pas de fallback
   silencieux.
4. **Règle actions** : erreur **métier/validation** = valeur de `return` typée (jamais
   `throw`) ; erreur **technique** = `Sentry.captureException(err)` puis `return` d'un
   message générique — fini le `error.message` Supabase brut affiché à l'utilisateur
   (fuite de détails techniques + illisible).

Non retenu : `unauthorized()`/`forbidden()` (expérimentaux en 16.2, derrière
`authInterrupts`) — on garde `redirect('/login')` + RLS.

### 2.5 Mutations & forms

1. **`ActionResult<T>` partagé** dans `src/lib/actions.ts` — remplace les 13
   redéclarations locales (et les variantes `ActionResult`/`SaveStaffResult`) :

   ```ts
   export type ActionResult<T = void> =
     | { success: true; data: T }
     | { success: false; error: string; fieldErrors?: Record<string, string[]> }
   ```

2. **Helper maison `runAction`** (même fichier, ~40 lignes — pas de next-safe-action) :
   enchaîne (a) garde d'auth (fonction passée, ex. `requireAccess`), (b)
   `schema.safeParse(input)` → échec = `fieldErrors` via `z.flattenError(...)`,
   (c) le handler — le tout sous `try/catch` → `Sentry.captureException` + erreur
   générique (capture aussi une garde qui `throw`). Chaque
   `actions.ts` l'utilise ; la RLS reste le garde-fou réel (défense en profondeur).
3. **Standard forms : RHF + `zodResolver` + schéma partagé dans `schema.ts`** — déjà le
   pattern de 8 forms sur 9. Le schéma est LE même objet côté client (resolver) et côté
   serveur (action). Les `fieldErrors` retournées par l'action sont mappées via
   `form.setError(path, { type: 'server', message })`. Le 9ᵉ form
   (`chatters/components/chatter-crm-dialog.tsx`, `useState`×3 sans validation client)
   migre sur ce standard (pilote).
   *Note* : shadcn a rendu ses composants de form agnostiques (famille `<Field />`,
   oct 2025, « works with all form libraries ») et documente RHF **en premier** dans son
   hub forms — le guide `useActionState` y est encore « Coming Soon » en juillet 2026.
   Uniformiser sur RHF (existant) est donc pleinement aligné, zéro churn. Détail
   d'implémentation : erreur globale serveur via `setError('root.serverError', …)` ;
   une erreur de champ posée par le serveur est effacée dès que le champ repasse la
   validation client (voulu — les erreurs non exprimables côté client, ex. unicité,
   sont re-mappées à chaque submit).
4. **Toasts `sonner`** (standard shadcn — seule nouvelle dépendance du chantier) :
   `<Toaster>` monté dans le root layout ; chaque mutation affiche
   `toast.success`/`toast.error` à partir du `ActionResult`. Le message d'erreur vient
   toujours du `return` de l'action, jamais d'un `throw`.
5. **Zod v4 — moderniser les usages dépréciés** au fil des migrations :
   `z.string().uuid()` → `z.uuid()` (idem `z.string().url()` → `z.url()` dans
   `lib/env.ts`) ; `.flatten()` déprécié — le remplaçant officiel est `z.treeifyError()`,
   et pour nos schémas de forms plats `z.flattenError()` (top-level, dispo en 4.4.x) est
   l'équivalent direct recommandé par la doc error-formatting ; param d'erreur unifié
   `error` (plus de `message:`/`invalid_type_error`).

### 2.6 Images (convention — rien à faire aujourd'hui)

L'app n'affiche **aucune image** (vérifié : zéro `<img>`/`next/image` dans `src/`).
Convention inscrite pour le jour où (avatars, logos créatrices…) :

- Petites images (< 10 Ko, avatars 32-64 px) : bucket Supabase **public** +
  `<Image unoptimized width height loading="lazy">` — recommandation Vercel (les petites
  images ne justifient pas l'optimisation facturée) ; dimensions obligatoires (anti-CLS).
- Pas de `placeholder="blur"` sur les petites images ; pas de signed URLs éphémères dans
  `next/image` optimisé (chaque URL unique = cache MISS facturé).
- Si un vrai besoin d'optimisation apparaît (grandes images) : loader custom Supabase
  `render/image` (plan Pro) plutôt que les transformations Vercel.

### 2.7 Divers infra

- **Brancher `lib/env.ts`** : le schéma Zod (`publicEnvSchema`/`getPublicEnv`) existe
  mais n'a aucun consommateur — et le `getPublicEnv()` actuel n'appelle jamais `parse`
  (il retourne `process.env.X ?? ''`). Le corriger pour appeler réellement `safeParse`
  (échec = crash explicite au boot) et l'utiliser dans les clients Supabase. Garder des
  accès **statiques** aux `NEXT_PUBLIC_*` (inlinées au build — jamais d'accès dynamique
  par clé).
- **Headers de sécurité + noindex** (rien n'est configuré aujourd'hui, pour un dashboard
  financier sur URL publique) : bloc `headers()` **statique** dans `next.config.ts` — la
  CSP à nonce est documentée incompatible avec PPR/`cacheComponents`, donc CSP simple
  sans nonce (a minima `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive ;
  + `robots: { index: false }` dans le root layout. ~20 lignes, une fois.
- **`typedRoutes: true`** (stable depuis 15.5, compatible Turbopack) : `href` typés sur
  les 32 routes — filet précieux pendant la réorg (routes déplacées aux batches 4-5) ;
  `next typegen` en CI pour valider hors build.
- **Ops/backups** : vérifier le plan Supabase (Free = aucun backup automatique) — les
  tables mutées par l'app (quotas, `rest_planning_cells`, `insight_states`, `profiles`,
  `snap_codes`, champs CRM de `chatters`) ne sont **pas** ré-ingérables depuis MyPuls,
  contrairement aux faits. Migrations forward-only : rollback = migration corrective,
  jamais d'édition d'une migration appliquée.
- **Retirer `wrangler`** (devDependencies) **et `@sentry/cloudflare`** (dependencies) de
  `apps/web` — reliquats Cloudflare, cible Vercel-only (`apps/ingestion` garde les
  siens : le worker CF y existe encore, gelé).
- **Fonts/design : non touchés** (stack système actuelle conservée — tout changement de
  design demande l'accord explicite de Benoit).
- Vigilance : shadcn/ui bascule sur **Base UI** comme lib par défaut (juillet 2026) —
  vérifier la compatibilité Radix avant tout futur `shadcn add`.

## 3. Squelette canonique d'une feature (phase 2 — réorg)

La structure actuelle est déjà alignée sur le consensus 2026 (feature-based type
Bulletproof React, kebab-case, pas de barrels). On **normalise**, on ne refond pas —
pas de renommage `services/` → `api/` (divergence purement cosmétique).

```
features/<f>/
├── <Feature>Template.tsx   # RSC racine — le seul fichier PascalCase (convention projet)
├── actions.ts              # mutations ('use server') — si la feature en a
├── schema.ts               # schémas Zod partagés client/serveur — si forms
├── types.ts                # contrat domaine local (types + constantes de domaine)
├── services/               # lectures — get-<entité>.ts, un fichier par lecture
└── components/             # composants de la feature (feuilles client, kebab-case)
```

Règles :

1. **Chaque feature adopte exactement ce squelette** (fichiers absents si non
   pertinents ; pas de fichiers surnuméraires à la racine — les cas type
   `planning/sections.ts`, `spenders/wire.ts` sont soit absorbés dans `types.ts`/un
   composant, soit justifiés par un commentaire d'en-tête).
2. **Schéma de form → `schema.ts`** dès qu'il est consommé des deux côtés
   (client RHF + action serveur), ce qui est toujours le cas d'un form. Une validation
   serveur-only mono-usage peut rester inline dans `actions.ts`. Les 4 features à Zod
   inline (infos-modeles, quotas, repos, snap-codes) sont réévaluées à leur migration.
3. **Frontières d'imports enforced par ESLint.** Préalable découvert à l'audit : le repo
   n'a **aucune** config ESLint et le script `lint` actuel (`next lint`) est mort — la
   commande est supprimée en Next 16. Batch 0 : créer `eslint.config.mjs` (flat config,
   base `eslint-config-next`) + script `"lint": "eslint ."`, puis la règle
   `no-restricted-paths` via **`eslint-plugin-import-x`** (fork maintenu — l'original
   `eslint-plugin-import` n'a pas publié depuis 13 mois) ou `eslint-plugin-boundaries` :
   `lib → features → app`, **cross-feature interdit**, personne
   n'importe `app/`. La violation existante (`insights/actions.ts:8` →
   `chatters/services/get-chatters`) se résout par la règle projet « réutilisé par
   plusieurs features → top-level » : `get-chatters` est promu dans `lib/services/`
   (les deux features l'importent de là).
4. **Pas de barrel files** (`index.ts`) — anti-pattern confirmé 2026 (tree-shaking,
   vitesse de build) ; imports directs.
5. **Fichiers > 300 lignes : à splitter par responsabilité.** Les 8 connus :
   `repos/planning-grid` 524, `insights/insight-card` 460, `marketing/va-view` 442,
   `infos-modeles-view` 403, `chatters-table` 351, `planning/planning-view` 341,
   `members/member-dialog` 321, `members/actions.ts` 304. Découpe type pour une table :
   `columns.tsx` (défs de colonnes), `toolbar.tsx`, sous-composants de lignes, logique
   d'export extraite du composant (util de feature).

### 3.1 Cas particuliers

- **spenders** : revenir au pattern standard — fetch dans chaque `page.tsx` (pas
  dans `layout.tsx`), suppression de l'encodage tuple `wire.ts` si possible, `loading.tsx`
  sur les 5 pages.
- **marketing** (§ 6.4) : découpage en features par sous-domaine alignées sur les routes
  (ex. `marketing-liens`, `marketing-social`, `marketing-staff`, `marketing-va`) — chaque
  nouvelle feature reprend le squelette canonique. Fait dans le batch marketing.
- **teams / compta** : stubs **conservés** (décision Benoit — compta est probablement le
  support de la feature daily-reports à venir). Non migrés tant qu'ils sont vides.
- **Fixtures `_data/`** : supprimées (mortes, zéro import vérifié) —
  `chatters/_data/june-chatters.json` (7 998 lignes), `models/_data/`, `overview/_data/`.

## 4. Pilote — `/chatter/chatters`

La page de référence, refactorisée à fond. Ce qui change concrètement :

1. `services/get-chatters.ts` : suppression du cast `as never` + du commentaire périmé
   (`:67-77`) — le RPC est typé (`packages/db/src/types.ts:2040`) ; l'erreur du select
   `chatters` parallèle est destructurée et thrown (`:76`).
2. `actions.ts` : passe sur `ActionResult<T>` partagé + `runAction` (validation Zod,
   garde, capture Sentry, message générique).
3. `components/chatter-crm-dialog.tsx` : RHF + `zodResolver` sur le schéma partagé
   `schema.ts` + `toast.success`/`toast.error`.
4. `components/chatters-table.tsx` (351 l.) : split — `columns.tsx`, `toolbar.tsx`,
   rendu sub-rows séparé, `downloadRanking` (création Blob/DOM) extrait dans un util de
   feature.
5. `page.tsx` : shell immédiat + table dans `<Suspense fallback={<TableSkeleton/>}>`
   (kickoff de la promise sans `await`).
6. `_data/june-chatters.json` supprimé.
7. Bénéficie des briques transversales (batch 0) : Sentry serveur, `error.tsx` workspace,
   skeletons, sonner.

Critères de succès du pilote : navigation vers la page = skeleton instantané ; shell
visible avant les données ; une erreur de RPC remonte dans Sentry ET affiche le boundary
avec « Réessayer » fonctionnel ; le dialog CRM valide côté client, toaste, et n'affiche
jamais un message Supabase brut ; aucun fichier de la feature > 300 lignes.

## 5. Ordre de migration (batches = PRs)

| Batch | Contenu |
|---|---|
| **0 — Socle** | Sentry serveur + `withSentryConfig` (+ fix `tracesSampleRate` client, vérif clés JWT asymétriques au Dashboard Supabase), socle ESLint flat + frontières d'imports (pas de CI — décision Benoit 2026-07-16 : vérifications typecheck/lint/tests exécutées localement à chaque task), `ActionResult` + `runAction`, sonner + `<Toaster>`, `error.tsx` ×2 workspaces, `components/skeletons/` (a11y incluse), Route Handler `api/revalidate` + appel ingestion, headers sécurité + noindex, `typedRoutes`, helper `todayParis()` (core) + `resolvePeriod`, `env.ts` réellement branché, retrait wrangler + `@sentry/cloudflare` |
| **1 — Pilote** | `/chatter/chatters` complet (§ 4) + mise à jour `guidelines-data-loading.md` + doc standard (avec checklist « nouvelle feature ») + pointeur `CLAUDE.md` |
| **2 — Chatter lecture** | health, models, overview, stats, bilan : casts nettoyés, Suspense/skeletons, erreurs |
| **3 — Chatter interactif** | insights, quotas, repos, planning, scripts, snap-codes, infos-modeles, police, members : `ActionResult`, forms normalisés, toasts, splits > 300 l., selects bornés |
| **4 — Spenders** | normalisation complète (§ 3.1) |
| **5 — Marketing** | découpage en features par sous-domaine + standard complet |

Chaque batch : PR validée avant la suivante. Batches 2-5 ajustables en cours de route.

## 6. Hors scope (explicitement non retenus)

- **TanStack Query** : supprimé volontairement le 2026-07-15 ; le choix « fraîcheur à la
  navigation » ne le justifie pas. À réévaluer seulement si un besoin de polling ou
  d'optimistic updates apparaît (le consensus 2026, y compris les mainteneurs TanStack,
  est de ne pas l'introduire sans ces besoins).
- **next-safe-action** : `ActionResult` + `runAction` maison suffisent à cette échelle.
- **Migration des forms vers `useActionState` + `<Field />`** : churn sans gain ici.
- **Realtime / polling**, **`use cache: private`**, **`unauthorized()`/`forbidden()`** :
  expérimentaux ou non justifiés.
- **Fonts, design, styling** : inchangés.
- **nuqs** (searchParams typés) : le pattern existant `searchParams` + `useTransition`
  suffit pour 3 composants — à réévaluer si les filtres se multiplient.
- **Rate-limiting des Server Actions** : injustifié ici (dashboard interne, auth OTP
  Supabase déjà rate-limitée, RLS).
- **`unstable_instant` / runtime prefetching** (Next 16.2) : le mécanisme officiel de
  garantie de navigation instantanée, encore instable — à surveiller.
- **Tests `apps/web`** (Vitest sur les services, ex. réagrégation restreinte de
  `get-chatters`) : hors chantier — suite naturelle une fois le standard posé.

## 7. Sources principales (juillet 2026)

- Next.js 16.2 : caching (`use cache`, `updateTag`, `revalidateTag(tag, profile)`) —
  nextjs.org/docs/app/getting-started/caching · /revalidating (2026-06-23) ; streaming —
  /guides/streaming (2026-06-23) ; prefetching — /guides/prefetching (2026-06-23) ;
  `error.tsx` + `unstable_retry` — /api-reference/file-conventions/error (16.2).
- Sentry : manual setup Next.js (`onRequestError`, `instrumentation-client.ts`),
  support Turbopack dev+build (blog 2026-01-29), errors-only = omettre `tracesSampleRate`.
- shadcn/ui : famille `<Field />` (oct 2025), hub forms (RHF soutenu), bascule Base UI
  (changelog juillet 2026).
- Zod v4 : zod.dev/v4 (stable depuis 2025-07-08 en root), `z.uuid()`, `z.flattenError()`.
- Supabase : `getClaims()` reco serveur (docs SSR Next.js), troncature 1000 (PostgREST
  `max-rows`), image transformations (plan Pro).
- Vercel : images — `unoptimized` pour petites images (managing costs, 2026-02-26) ;
  pricing transformations.
- Structure : Bulletproof React (maintenu, 2026-05 ; barrels abandonnés, kebab-case,
  `import/no-restricted-paths`) ; doc officielle Next.js project-structure (2026-06-23).
