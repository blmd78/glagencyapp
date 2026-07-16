# Data-loading fixes (audit Next 16) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les findings vérifiés de l'audit data-loading (troncatures PostgREST silencieuses = chiffres faux, micro-waterfalls, code mort) et standardiser le loading par segment — sans over-engineering.

**Architecture:** Aucun changement d'architecture. On applique les patterns déjà en place dans le repo : `fetchAll` (lib/supabase/fetch-all.ts) sur toute lecture de table de faits journaliers, `Promise.all` pour les requêtes indépendantes, `loading.tsx` par segment (convention Next), suppression de l'infra TanStack Query jamais consommée.

**Tech Stack:** Next.js 16 (App Router, cacheComponents/PPR), Supabase (supabase-js + RLS), pnpm workspaces.

## Global Constraints

- Toutes les commandes se lancent depuis la racine du repo : `/Users/benoitgasnier/Documents/glagencyapp`.
- Gate de vérification de chaque task : `pnpm --filter @glagency/web typecheck` (sortie attendue : aucune erreur). `apps/web` n'a **pas** d'infra de test (Vitest vit dans `packages/core`) — ne pas en ajouter dans ce plan.
- **Pas de commit sans validation de Benoit** (règle globale CLAUDE.md). Chaque step « Commit » = proposer le commit et attendre son OK.
- **PRÉREQUIS avant d'exécuter :** le working tree contient du travail en cours non commité (compta, spenders, migrations 0015→0042…). Benoit doit le commiter/stasher d'abord — ne pas mélanger ces fixes avec le travail en cours.
- Règle `fetchAll` (docstring de `lib/supabase/fetch-all.ts`) : le builder doit poser un `.order()` **déterministe sur la PK complète** de la table, ne pas poser son propre `.range()`, et retourner une requête fraîche à chaque appel.
- PK des tables concernées : `creator_daily` = (creator_id, date) ; `chatter_daily` = (chatter_id, date) ; `chatter_creator_daily` = (chatter_id, creator_id, date) ; `creator_script_daily` = (creator_id, script_id, date) (migration 0042).
- Design : les nouveaux fallbacks (Task 6) utilisent uniquement `components/ui/skeleton.tsx` (shadcn, blocs `bg-muted` animés) — minimal, zéro ornement. C'est de la **nouvelle UI** (pas une modif de l'existant), validée par l'approbation de ce plan.
- ⚠️ Invariant **non fiable** : `Σ chatter_creator_daily ≠ chatter_daily` (l'ingestion droppe les transactions non résolues, cf. `apps/ingestion/src/pipeline.ts:237` `dropped`, et `get-chatters` calcule `caUnattributed`). Ne JAMAIS dériver le CA total admin depuis `chatter_creator_daily`.

## Hors périmètre (décisions explicites, pas des oublis)

- **`'use cache'` inter-requêtes** : les lectures passent par le client cookie-bound (RLS par user, migration 0008) → un cache partagé fuiterait des données entre users ; les données ne changent qu'à l'ingestion nocturne et aucun bottleneck n'est mesuré. À réévaluer après ce plan si une page reste lente.
- **RPC agrégés supplémentaires** (`compta_report`, `bilan_report`, `health_report`) : le mur CPU Workers (Error 1102) a disparu avec Vercel ; `fetchAll` corrige la justesse. À faire seulement si une page reste lente **après** ce plan (gabarit : `0020_chatters_report.sql`).
- **Descente des 12 `'use client'` de Templates entiers** : gain = bundle/hydratation (mineur, React Compiler actif). À faire au fil de l'eau quand on touche une feature (modèle : `ChattersTemplate.tsx`).
- **`revalidateTag`** : n'a de sens qu'avec `'use cache'` — couplé au point 1.
- **`error.tsx` par segment + Sentry serveur** : l'`error.tsx` global de `(dash)` suffit tant que Sentry serveur n'est pas branché (TODO scaffold CLAUDE.md).
- **Route Handler `spenders/rest`** : PAS un doublon — contourne la file séquentielle des Server Actions (documenté dans `get-spenders.ts`). On n'y touche pas.

---

### Task 1: get-health — stopper la troncature silencieuse (bug critique)

**Files:**
- Modify: `apps/web/src/features/health/services/get-health.ts:32-45`

**Interfaces:**
- Consumes: `fetchAll` de `@/lib/supabase/fetch-all` (déjà importé ligne 3, jamais utilisé).
- Produces: mêmes retours (`HealthData`) — aucune signature ne change ; `cd`/`ccd` deviennent des tableaux complets (non tronqués).

Contexte : `creator_daily` et `chatter_creator_daily` sont lues sans `fetchAll`/`.order()` → PostgREST plafonne à 1000 lignes **en silence** → CA/LTV faux dès ~1 mois de période (le bug exact documenté dans la docstring de `fetch-all.ts` : « juin affichait 99 k€ au lieu de 256 k€ »).

- [ ] **Step 1: Remplacer les deux requêtes nues par fetchAll**

Dans `get-health.ts`, remplacer le bloc lignes 32-45 :

```ts
  const [{ data: creators }, { data: cd }, { data: ccd }, { data: chatters }] = await Promise.all([
    supabase.from('creators').select('id, name, is_private, excluded'),
    // Tables journalières : fetchAll (pagination PostgREST, tri = PK) — sans ça,
    // troncature silencieuse à 1000 lignes (CA/LTV faux dès ~1 mois de période).
    fetchAll((f, t) =>
      supabase
        .from('creator_daily')
        .select('creator_id, date, ca, new_subs, renew_subs')
        .gte('date', period.from)
        .lte('date', period.to)
        .order('creator_id')
        .order('date')
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from('chatter_creator_daily')
        .select('creator_id, chatter_id, ca')
        .gte('date', period.from)
        .lte('date', period.to)
        .order('chatter_id')
        .order('creator_id')
        .order('date')
        .range(f, t),
    ),
    supabase.from('chatters').select('id, display_name'),
  ])
```

Le reste du fichier ne change pas (`rows = cd ?? []` et la boucle sur `ccd ?? []` restent valides — `fetchAll` renvoie `{ data: T[], error }`).

- [ ] **Step 2: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Contrôle visuel (optionnel mais recommandé)**

`pnpm --filter @glagency/web dev` → ouvrir `/chatter/health` sur une période ≥ 1 mois : le CA total doit **augmenter ou rester égal** vs avant le fix (jamais baisser).

- [ ] **Step 4: Commit (après OK Benoit)**

```bash
git add apps/web/src/features/health/services/get-health.ts
git commit -m "fix(health): fetchAll sur creator_daily + chatter_creator_daily — stoppe la troncature silencieuse à 1000 lignes (CA/LTV faux sur ≥1 mois)"
```

---

### Task 2: get-bilan — stopper la troncature silencieuse (scripts + CA)

**Files:**
- Modify: `apps/web/src/features/bilan/services/get-bilan.ts:1-108`

**Interfaces:**
- Consumes: `fetchAll` (à importer), `PostgrestError` (type à importer).
- Produces: `BilanData` inchangé ; nouvelle interface locale `ScriptRow` remplace le cast anonyme ligne 103-108.

Contexte : fenêtre de 5 semaines (M-1 → semaine courante). `creator_script_daily` = (créatrice × script × jour) → dépasse 1000 lignes bien avant `creator_daily` → totaux « hors S1 » faux en silence.

- [ ] **Step 1: Ajouter les imports et l'interface ScriptRow**

En tête de fichier (après les imports existants, ligne 4) :

```ts
import type { PostgrestError } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
```

Après l'interface `Agg` (ligne 23), ajouter :

```ts
/** Ligne de `creator_script_daily` (0042, hors types générés → typée à la main). */
interface ScriptRow {
  creator_id: string
  date: string
  position: number | null
  revenue_day: number | null
}
```

- [ ] **Step 2: Passer les deux requêtes journalières en fetchAll**

Remplacer le bloc lignes 52-65 :

```ts
  // Tables journalières : fetchAll (pagination PostgREST, tri = PK complète) — sur 5
  // semaines, creator_script_daily (créatrice × script × jour) dépasse 1000 lignes bien
  // avant creator_daily → sans ça, totaux et « hors S1 » tronqués EN SILENCE.
  const [{ data: rows, error }, { data: creators, error: e2 }, scriptsRes] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('creator_daily')
        .select('creator_id, date, ca, new_subs')
        .gte('date', lm.start)
        .lte('date', end)
        .order('creator_id')
        .order('date')
        .range(f, t),
    ),
    supabase.from('creators').select('id, name, excluded'),
    // Snapshots scripts MyPuls (0042, hors types générés) : deltas jour, position 1 = badge N°1.
    fetchAll<ScriptRow>(
      (f, t) =>
        supabase
          .from('creator_script_daily' as never)
          .select('creator_id, date, position, revenue_day')
          .gte('date', lm.start)
          .lte('date', end)
          .order('creator_id' as never)
          .order('script_id' as never)
          .order('date' as never)
          .range(f, t) as unknown as PromiseLike<{
          data: ScriptRow[] | null
          error: PostgrestError | null
        }>,
    ),
  ])
```

NB : les `as never` sur `.order()` suivent le pattern déjà utilisé pour cette table hors types générés (même style que `rpc('chatters_report' as never, ...)`). L'ordre inclut `script_id` (PK complète) même s'il n'est pas sélectionné — PostgREST l'accepte.

- [ ] **Step 3: Simplifier la consommation de scriptsRes**

Remplacer les lignes 103-108 :

```ts
  const scriptRows = ((scriptsRes as { data: unknown }).data ?? []) as Array<{
    creator_id: string
    date: string
    position: number | null
    revenue_day: number | null
  }>
```

par :

```ts
  // Erreur scripts NON bloquante (comme avant) : pas de snapshots → pas de badge, page valide.
  const scriptRows: ScriptRow[] = scriptsRes.data
```

- [ ] **Step 4: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit (après OK Benoit)**

```bash
git add apps/web/src/features/bilan/services/get-bilan.ts
git commit -m "fix(bilan): fetchAll sur creator_daily + creator_script_daily — totaux et « hors S1 » ne sont plus tronqués à 1000 lignes"
```

---

### Task 3: get-compta — fetchAll sur creator_daily + dédoublonner le fetch en mode restreint

**Files:**
- Modify: `apps/web/src/features/compta/services/get-compta.ts:55-109`

**Interfaces:**
- Consumes: `fetchAll` (déjà importé), `pairRows` (déjà fetché lignes 96-106).
- Produces: `ComptaData` inchangé.

Deux problèmes indépendants dans le même `Promise.all` :
1. `creatorDaily` (ligne 94) lit `creator_daily` **sans fetchAll** → `totals.modelsCa` tronqué au-delà de ~1 mois (bug de justesse).
2. En mode **restreint**, la requête `daily` (lignes 70-79) lit `chatter_creator_daily`… qui est **déjà** téléchargée intégralement par `pairRows` (mêmes bornes, même table) → une pagination complète payée deux fois. ⚠️ En mode **admin**, on garde les DEUX fetches (`chatter_daily` ≠ Σ `chatter_creator_daily`, cf. Global Constraints — ne pas « simplifier » ça).

- [ ] **Step 1: Conditionner le fetch `daily` au mode admin**

Remplacer les lignes 70-79 (premier élément du `Promise.all`) :

```ts
    // CA total par chatteur/jour. ⚠️ Σ chatter_creator_daily ≠ chatter_daily (transactions
    // non résolues droppées à l'ingestion) → chatter_daily reste LA source du CA admin.
    // En restreint, le CA vient de chatter_creator_daily (RLS), déjà téléchargée entière
    // ci-dessous (pairRows, mêmes bornes) → on ne paie pas deux fois la pagination.
    restricted
      ? { data: [], error: null }
      : fetchAll((f, t) =>
          supabase
            .from('chatter_daily')
            .select('chatter_id, date, ca')
            .gte('date', rangeStart)
            .lte('date', rangeEnd)
            .order('chatter_id', { ascending: true })
            .order('date', { ascending: true })
            .range(f, t),
        ),
```

- [ ] **Step 2: Remonter l'erreur de pairRows (le mode restreint en dépend désormais)**

Ligne 67, remplacer `{ data: pairRows },` par :

```ts
    { data: pairRows, error: ePairs },
```

Après `if (e1) throw e1` (ligne 109), ajouter :

```ts
  if (ePairs) throw ePairs
```

- [ ] **Step 3: Alimenter la boucle CA depuis pairRows en restreint**

Ligne 147, remplacer :

```ts
  for (const r of daily ?? []) {
```

par :

```ts
  // Restreint : pairRows (chatteur × modèle × jour) s'accumule au même grain (chatteur, jour).
  for (const r of restricted ? (pairRows ?? []) : (daily ?? [])) {
```

(La boucle accumule déjà — `caByKey.set(k, (caByKey.get(k) ?? 0) + …)` — donc plusieurs lignes par (chatteur, jour) se somment correctement.)

- [ ] **Step 4: Passer creatorDaily en fetchAll**

Remplacer la ligne 94 :

```ts
    supabase.from('creator_daily').select('ca').gte('date', rangeStart).lte('date', rangeEnd),
```

par :

```ts
    // CA modèles sur les mêmes semaines → écart « hors chatteurs » (abos, wall, renew).
    // fetchAll : sans ça, tronqué à 1000 lignes (totals.modelsCa faux au-delà de ~1 mois).
    fetchAll((f, t) =>
      supabase
        .from('creator_daily')
        .select('ca')
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('creator_id')
        .order('date')
        .range(f, t),
    ),
```

(Le commentaire existant ligne 93 est remplacé par celui-ci.)

- [ ] **Step 5: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

Contrôle visuel : `/chatter/compta` en admin — mêmes chiffres qu'avant sur ≤ 1 mois ; `totals.modelsCa` (« CA modèles ») peut **augmenter** sur une période longue (c'était le bug). En manager (rôle `user`) : page identique à avant.

- [ ] **Step 6: Commit (après OK Benoit)**

```bash
git add apps/web/src/features/compta/services/get-compta.ts
git commit -m "fix(compta): fetchAll sur creator_daily (modelsCa non tronqué) + une seule pagination chatter_creator_daily en mode restreint"
```

---

### Task 4: Micro-waterfalls — paralléliser les requêtes indépendantes (chatters, repos, police)

**Files:**
- Modify: `apps/web/src/features/chatters/services/get-chatters.ts:66-81`
- Modify: `apps/web/src/features/repos/services/get-repos.ts:19-54`
- Modify: `apps/web/src/features/police/services/get-police.ts:17-42`

**Interfaces:**
- Consumes: `getChatterScope(profile): Promise<ChatterScope>` (`@/lib/scope`) — indépendant des autres requêtes, s'exécute en parallèle sans risque.
- Produces: aucune signature ne change.

- [ ] **Step 1: get-chatters — RPC + lecture CRM en parallèle**

Remplacer les lignes 66-81 :

```ts
  // `chatters_report` n'est pas dans les types générés (Functions vide) → cast, comme
  // pour `chatter_first_seen` dans la feature compta. En parallèle : les champs closing
  // CRM (chatters.role/team/shift, migration 0027) — hors RPC pour ne pas toucher
  // chatters_report ; lecture couverte par chatters_scoped_read.
  const [rpcRes, { data: crmRows }] = await Promise.all([
    supabase.rpc('chatters_report' as never, {
      p_from: period.from,
      p_to: period.to,
    } as never) as unknown as PromiseLike<{ data: Report | null; error: { message: string } | null }>,
    supabase.from('chatters').select('id, role, team, shift'),
  ])
  const { data, error } = rpcRes
  if (error) throw new Error(error.message)
  const rep = data ?? { totals: [], by_creator: [], chatters: [], scope: { attributed: 0, messaging: 0, all_accounts: 0 }, ranking: null }

  const chMeta = new Map(rep.chatters.map((c) => [c.id, c]))
  const crmById = new Map((crmRows ?? []).map((c) => [c.id, c]))
```

(Les anciennes lignes 76-81 — `chMeta`, commentaire CRM, requête `crmRows`, `crmById` — sont absorbées par ce bloc ; supprimer les doublons.)

- [ ] **Step 2: get-repos — scope dans le Promise.all**

Supprimer la ligne 21 (`const scope = await getChatterScope(profile)`) et modifier le batch (lignes 31-54) :

```ts
  const [
    scope,
    { data: cellRows },
    { data: weekRow },
    { data: chatterRows },
    { data: managerRows },
    { data: creatorRows },
    { data: memberRows },
    { data: dataWeekRows },
  ] = await Promise.all([
    // Périmètre manager (1 requête pour un non-admin) — indépendant du reste.
    getChatterScope(profile),
    supabase.from('rest_planning_cells').select('day, col, names, chatter_ids').eq('week_start', weekStart),
    supabase.from('rest_planning_weeks').select('sent_telegram').eq('week_start', weekStart).maybeSingle(),
    admin.from('chatters').select('id, display_name, active'),
    // Colonnes ENCADREMENT (Managers/Policiers) : leur sélecteur liste les profils rôle
    // manager — pas les chatteurs (bug remonté : « Ajouter » proposait les chatteurs).
    admin.from('profiles').select('id, display_name').eq('role', 'manager'),
    admin.from('creators').select('id, name, active'),
    supabase
      .from('rest_planning_column_members')
      .select('col, effective_from, creator_ids')
      .lte('effective_from', weekStart)
      .order('effective_from', { ascending: true }),
    // Semaines qui ont des données saisies (la « range ») — pour le sélecteur.
    supabase.from('rest_planning_cells').select('week_start'),
  ])
```

- [ ] **Step 3: get-police — même mouvement**

Supprimer les lignes 19-20 (`const scope = …` et `const inScope = …`) et modifier le batch (lignes 27-42) :

```ts
  const [scope, { data: rows }, { data: recentWarns }, { data: chatterRows }, { data: profileRows }] =
    await Promise.all([
      // Périmètre manager (1 requête pour un non-admin) — indépendant du reste.
      getChatterScope(profile),
      supabase
        .from('police_entries')
        .select('*')
        .eq('occurred_on', selected)
        .order('created_at', { ascending: false }),
      supabase
        .from('police_entries')
        .select('chatter_id')
        .eq('kind', 'warning')
        .gte('occurred_on', since)
        .lte('occurred_on', selected),
      admin.from('chatters').select('id, display_name, active'),
      admin.from('profiles').select('id, display_name'),
    ])
  const inScope = (id: string) => scope.chatterIds === null || scope.chatterIds.has(id)
```

⚠️ `selected` et `since` (lignes 23-25) doivent rester déclarés **avant** le batch — ne pas les déplacer.

- [ ] **Step 4: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit (après OK Benoit)**

```bash
git add apps/web/src/features/chatters/services/get-chatters.ts apps/web/src/features/repos/services/get-repos.ts apps/web/src/features/police/services/get-police.ts
git commit -m "perf(services): paralléliser les requêtes indépendantes (RPC+CRM chatters, scope repos/police)"
```

---

### Task 5: Supprimer TanStack Query (monté à vide, jamais consommé)

**Files:**
- Delete: `apps/web/src/providers/index.tsx` (tout le dossier `src/providers/`)
- Delete: `apps/web/src/lib/query-client.ts`
- Modify: `apps/web/src/app/layout.tsx:3,22`
- Modify: `apps/web/package.json:34`

**Interfaces:**
- Consumes: rien.
- Produces: rien — vérifié : `@tanstack/react-query` n'est importé QUE par ces deux fichiers (ne pas confondre avec `@tanstack/react-table`, utilisé par `data-table.tsx`/spenders, qu'on **garde**).

- [ ] **Step 1: Retirer <Providers> du root layout**

Dans `app/layout.tsx`, supprimer la ligne 3 (`import { Providers } from '@/providers'`) et remplacer la ligne 22 :

```tsx
          <Providers>{children}</Providers>
```

par :

```tsx
          {children}
```

- [ ] **Step 2: Supprimer les fichiers et la dépendance**

```bash
rm -r apps/web/src/providers apps/web/src/lib/query-client.ts
```

Dans `apps/web/package.json`, supprimer la ligne `"@tanstack/react-query": "^5.62.0",` puis :

```bash
pnpm install
```

- [ ] **Step 3: Vérifier qu'il ne reste aucune référence**

Run: `grep -rn "react-query\|query-client\|@/providers" apps/web/src/`
Expected: aucune sortie.

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit (après OK Benoit)**

```bash
git add -A apps/web/src/providers apps/web/src/lib/query-client.ts apps/web/src/app/layout.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): retirer TanStack Query monté à vide (aucun useQuery/useMutation dans l'app — 100% RSC + Server Actions)"
```

---

### Task 6: loading.tsx par segment lourd (skeleton au lieu du LoadingDots générique)

**Files:**
- Create: `apps/web/src/components/page-skeleton.tsx`
- Create: `apps/web/src/app/(dash)/chatter/compta/loading.tsx`
- Create: `apps/web/src/app/(dash)/chatter/overview/loading.tsx`
- Create: `apps/web/src/app/(dash)/chatter/stats/loading.tsx`
- Create: `apps/web/src/app/(dash)/chatter/bilan/loading.tsx`
- Create: `apps/web/src/app/(dash)/chatter/chatters/loading.tsx`

**Interfaces:**
- Consumes: `Skeleton` de `@/components/ui/skeleton` (existe déjà).
- Produces: `PageSkeleton({ kpis?: number })` — Server Component réutilisable pour d'autres segments plus tard.

Contexte : le seul fallback est `(dash)/loading.tsx` (LoadingDots centrés). Next prend le `loading.tsx` **le plus proche** → ces 5 segments (les plus lourds en données) affichent une silhouette de page à la place. `spenders` est exclu (son fetch vit dans son layout — un loading.tsx de page ne le couvrirait pas).

- [ ] **Step 1: Créer le composant PageSkeleton**

`apps/web/src/components/page-skeleton.tsx` :

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Fallback de chargement d'une page du dash : titre + rangée de KPIs + bloc tableau.
 * Silhouette générique volontairement neutre (pas de skeleton sur-mesure par page).
 */
export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {kpis > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      <Skeleton className="h-96" />
    </div>
  )
}
```

- [ ] **Step 2: Créer les 5 loading.tsx**

Même contenu exact pour `compta/loading.tsx`, `overview/loading.tsx`, `stats/loading.tsx`, `bilan/loading.tsx`, `chatters/loading.tsx` :

```tsx
import { PageSkeleton } from '@/components/page-skeleton'

export default function Loading() {
  return <PageSkeleton />
}
```

- [ ] **Step 3: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

Contrôle visuel : `pnpm --filter @glagency/web dev` → naviguer vers `/chatter/compta` depuis une autre page : la silhouette (titre + 4 blocs + tableau) apparaît pendant le rendu serveur, puis la page. Les autres segments (ex. `/chatter/planning`) gardent le LoadingDots global.

- [ ] **Step 4: Commit (après OK Benoit)**

```bash
git add apps/web/src/components/page-skeleton.tsx "apps/web/src/app/(dash)/chatter/compta/loading.tsx" "apps/web/src/app/(dash)/chatter/overview/loading.tsx" "apps/web/src/app/(dash)/chatter/stats/loading.tsx" "apps/web/src/app/(dash)/chatter/bilan/loading.tsx" "apps/web/src/app/(dash)/chatter/chatters/loading.tsx"
git commit -m "feat(web): loading.tsx skeleton par segment lourd (compta, overview, stats, bilan, chatters)"
```

---

### Task 7: Conformité Next 16 + suppression du code mort

**Files:**
- Rename: `apps/web/middleware.ts` → `apps/web/proxy.ts` (contenu modifié)
- Delete: `apps/web/src/features/health/actions.ts` (squelette `export {}`, importé nulle part — vérifié)
- Delete: `apps/web/src/features/teams/actions.ts` (idem)
- Delete: `apps/web/src/app/api/analyses/` (Route Handler 501 « non implémenté », référencé nulle part — vérifié ; git le garde si la feature IA revient)

**Interfaces:**
- Consumes: rien.
- Produces: `proxy(request: NextRequest)` — même comportement que l'ancien `middleware()` (refresh session + check optimiste).

Contexte : `middleware.ts` est déprécié en Next 16 au profit de `proxy.ts` — le commentaire du fichier dit lui-même que seul l'adaptateur OpenNext/Cloudflare bloquait le rename, contrainte levée (cible Vercel-only, cf. `next.config.ts`). **On garde `/api/ping`** (marqueur de version des déploiements Vercel — utile).

- [ ] **Step 1: Renommer middleware.ts en proxy.ts**

```bash
git mv apps/web/middleware.ts apps/web/proxy.ts
```

Dans `proxy.ts` : remplacer le commentaire de tête (lignes 4-8) et la signature (ligne 9) :

```ts
// Convention Next 16 : proxy.ts (remplace middleware.ts, déprécié — le rename était bloqué
// par l'adaptateur OpenNext/Cloudflare, contrainte levée depuis le passage Vercel-only).
// Rôle : refresh de la session Supabase (cookies) + check OPTIMISTE (redirige si pas
// de session). L'autorisation réelle (par modèle) reste portée par la RLS côté base.
export async function proxy(request: NextRequest) {
```

Le corps de la fonction et `export const config` (matcher) ne changent pas.

- [ ] **Step 2: Vérifier que le proxy est bien pris en compte**

Run: `pnpm --filter @glagency/web build`
Expected: build OK, la sortie mentionne le proxy (`ƒ Proxy` ou équivalent) — et surtout **pas** de warning « middleware ».

Contrôle : `pnpm --filter @glagency/web dev` → ouvrir une page du dash en navigation privée (sans session) → redirection `/login` (le check optimiste fonctionne).

**Fallback si le build échoue sur la convention** (version Next qui ne reconnaît pas encore `proxy.ts`) : annuler le rename (`git mv apps/web/proxy.ts apps/web/middleware.ts`, restaurer `export async function middleware`), et ne corriger QUE le commentaire périmé (retirer la mention OpenNext, dire que le rename est à faire quand la version le permet).

- [ ] **Step 3: Supprimer les squelettes morts**

```bash
rm apps/web/src/features/health/actions.ts apps/web/src/features/teams/actions.ts
rm -r apps/web/src/app/api/analyses
```

Run: `grep -rn "health/actions\|teams/actions\|api/analyses" apps/web/src/`
Expected: aucune sortie.

- [ ] **Step 4: Vérifier**

Run: `pnpm --filter @glagency/web typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit (après OK Benoit)**

```bash
git add -A apps/web/proxy.ts apps/web/middleware.ts apps/web/src/features/health/actions.ts apps/web/src/features/teams/actions.ts apps/web/src/app/api/analyses
git commit -m "chore(web): middleware.ts → proxy.ts (norme Next 16, contrainte OpenNext levée) + suppression des squelettes morts (health/teams actions, api/analyses)"
```
