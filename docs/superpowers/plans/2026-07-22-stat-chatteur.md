# Page « Stat chatteur » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page « Stat chatteur » (face Chatteurs, groupe Performance) : 4 KPI de comptage (Setters / Closers / Rouge / Bleue) + un classement filtrable des chatteurs closing trié par nombre de ventes (`vendu`).

**Architecture:** Convention `app → feature(services) → composants`. Un service `getStatChatteur(period)` = 4 compteurs de membres (`profiles`, client admin) + les lignes closing réutilisant `getChatters()` (qui porte déjà `closingRole`/`closingTeam`/`vendu` par chatteur, agrégé sur la période). Un template Server Component rend les 4 KPI cards + une feuille CLIENT (filtre setter/closer/rouge/bleue/mixé + `DataTable` triable par ventes).

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (`@supabase/ssr` + client admin `createAdminClient`), `DataTable` (@tanstack/react-table wrapper maison), Tailwind v4 + shadcn/ui, lucide-react.

## Global Constraints

- **Emplacement** : nouvel item de nav `{ href: '/chatter/stat-chatteur', label: 'Stat chatteur', icon: Trophy, group: 'performance' }` dans `apps/web/src/config/workspaces.ts` (face `chatter`). Item direct, même visibilité que « Stats »/« Santé » (pas `adminOnly` sauf demande).
- **Période** : datepicker du header (source unique) via `resolvePeriod(await searchParams)` — comme `/chatter/chatters`. Le `vendu` est agrégé sur cette période.
- **4 KPI = comptage de MEMBRES par désignation** (indépendant de la période) : `closing_role in ('setter','closer')`, `closing_team in ('rouge','bleue')` sur `profiles` (client admin, agence-wide — la RLS `profiles` 0054 cloisonne par équipe).
- **Classement** : uniquement les chatteurs closing (`closingRole !== null`), triés par `vendu` **décroissant**. Un chatteur closing sans ventes → `vendu = 0`, en bas (pas exclu). Un membre closing **non lié** à un chatteur est compté au KPI mais **absent** du classement.
- **Filtre** (client, single-select) : Setter / Closer / Rouge / Bleue / **Mixé** (= tous les closing). Filtrage 100% côté client (toutes les lignes sont déjà chargées) — pas de round-trip.
- **Réutiliser `getChatters()`** (ne PAS recréer l'agrégation des ventes). Ne PAS toucher à l'édition du closing (fiche Membre) ni à la page `/chatter/chatters`.
- **Vérification** : ce codebase n'a pas de tests unitaires sur les features web (RSC + Supabase). Vérif = `pnpm --filter @glagency/web typecheck && lint && build` verts + contrôle SQL des KPI + contrôle manuel. Pas de Vitest ici.

---

## File Structure

| Fichier | Rôle | Tâche |
|---|---|---|
| `apps/web/src/features/stat-chatteur/types.ts` | **Créer** — `ClosingChatterRow`, `StatChatteurData` | 1 |
| `apps/web/src/features/stat-chatteur/services/get-stat-chatteur.ts` | **Créer** — service (4 KPI + lignes closing) | 1 |
| `apps/web/src/config/workspaces.ts` | Modifier — item de nav (groupe performance) | 2 |
| `apps/web/src/app/(dash)/chatter/stat-chatteur/page.tsx` | **Créer** — page (période + fetch + Suspense) | 2 |
| `apps/web/src/features/stat-chatteur/StatChatteurTemplate.tsx` | **Créer** — Server Component (KPI cards + feuille client) | 2 |
| `apps/web/src/features/stat-chatteur/components/stat-kpis.tsx` | **Créer** — les 4 KPI cards | 2 |
| `apps/web/src/features/stat-chatteur/components/stat-ranking.tsx` | **Créer** — feuille CLIENT : filtre + `DataTable` triable | 2 |

---

## Task 1 — Données : types + service `getStatChatteur`

**Files:**
- Create: `apps/web/src/features/stat-chatteur/types.ts`, `apps/web/src/features/stat-chatteur/services/get-stat-chatteur.ts`

**Interfaces:**
- Consumes : `getChatters(period, opts)` de `@/lib/services/get-chatters` → `ChattersData { period: string; chatters: ChatterRow[]; … }` où `ChatterRow` porte `id: string`, `name: string`, `closingRole: CrmRole | null`, `closingTeam: CrmTeam | null`, `vendu: number` (types dans `@/lib/types/chatters`). `Period` de `@/lib/period`.
- Produces : `getStatChatteur(period: Period, opts?: { restricted?: boolean }): Promise<StatChatteurData>` ; types `ClosingChatterRow`, `StatChatteurData`.

- [ ] **Step 1 : types**

Créer `apps/web/src/features/stat-chatteur/types.ts` :
```ts
import type { CrmRole, CrmTeam } from '@/lib/types/chatters'

/** Une ligne du classement : un chatteur closing (rôle setter/closer non nul) + ses ventes période. */
export interface ClosingChatterRow {
  id: string
  name: string
  closingRole: CrmRole // 'setter' | 'closer' — non nul (seuls les chatteurs closing sont classés)
  closingTeam: CrmTeam | null // 'rouge' | 'bleue' | null (un setter peut ne pas avoir d'équipe)
  vendu: number
}

export interface StatChatteurData {
  period: string
  /** Comptage de MEMBRES par désignation (indépendant de la période). */
  kpis: { nbSetters: number; nbClosers: number; nbRouge: number; nbBleue: number }
  /** Chatteurs closing, triés par `vendu` décroissant. */
  rows: ClosingChatterRow[]
}
```

- [ ] **Step 2 : service**

Créer `apps/web/src/features/stat-chatteur/services/get-stat-chatteur.ts` :
```ts
import { createAdminClient } from '@glagency/db'
import { getChatters } from '@/lib/services/get-chatters'
import type { Period } from '@/lib/period'
import type { CrmRole } from '@/lib/types/chatters'
import type { StatChatteurData } from '../types'

/**
 * Données de la page Stat chatteur : 4 KPI (nombre de MEMBRES par désignation closing, client admin
 * agence-wide car la RLS `profiles` cloisonne par équipe) + le classement des chatteurs closing par
 * ventes (`vendu`), réutilisant `getChatters()` (qui porte déjà `closingRole`/`closingTeam`/`vendu`
 * par chatteur, agrégé sur la période du datepicker). `restricted` transmis tel quel à getChatters.
 */
export async function getStatChatteur(
  period: Period,
  opts: { restricted?: boolean } = {},
): Promise<StatChatteurData> {
  const admin = createAdminClient()
  const [chattersData, membersRes] = await Promise.all([
    getChatters(period, opts),
    admin.from('profiles').select('closing_role, closing_team'),
  ])
  if (membersRes.error) throw new Error(membersRes.error.message)

  let nbSetters = 0
  let nbClosers = 0
  let nbRouge = 0
  let nbBleue = 0
  for (const m of membersRes.data ?? []) {
    if (m.closing_role === 'setter') nbSetters++
    else if (m.closing_role === 'closer') nbClosers++
    if (m.closing_team === 'rouge') nbRouge++
    else if (m.closing_team === 'bleue') nbBleue++
  }

  const rows = chattersData.chatters
    .filter((c) => c.closingRole !== null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      closingRole: c.closingRole as CrmRole,
      closingTeam: c.closingTeam,
      vendu: c.vendu,
    }))
    .sort((a, b) => b.vendu - a.vendu)

  return { period: chattersData.period, kpis: { nbSetters, nbClosers, nbRouge, nbBleue }, rows }
}
```
> ⚠️ Avant d'écrire, LIRE `apps/web/src/lib/services/get-chatters.ts` (signature exacte de `getChatters` + forme de `ChattersData`/`ChatterRow`) et `apps/web/src/lib/period.ts` (`Period`). Adapter si la signature diffère (ex. nom du champ période). NE PAS recréer l'agrégation `vendu`.

- [ ] **Step 3 : vérifier le typecheck**

Run: `pnpm --filter @glagency/web typecheck`
Expected : pas d'erreur.

- [ ] **Step 4 : contrôle SQL des KPI (UAT)** *(optionnel si pas d'accès)*

```bash
UAT="$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')"
psql "$UAT" -c "select
  count(*) filter (where closing_role='setter') as setters,
  count(*) filter (where closing_role='closer') as closers,
  count(*) filter (where closing_team='rouge') as rouge,
  count(*) filter (where closing_team='bleue') as bleue
from profiles;"
```
Les 4 nombres doivent correspondre à ce que le service calcule.

- [ ] **Step 5 : commit**

```bash
git add apps/web/src/features/stat-chatteur/types.ts apps/web/src/features/stat-chatteur/services/get-stat-chatteur.ts
git commit -m "feat(stat-chatteur): service (4 KPI closing + classement chatteurs par ventes)"
```

---

## Task 2 — UI : nav + page + template + KPI cards + classement filtrable

**Files:**
- Modify: `apps/web/src/config/workspaces.ts`
- Create: `apps/web/src/app/(dash)/chatter/stat-chatteur/page.tsx`, `apps/web/src/features/stat-chatteur/StatChatteurTemplate.tsx`, `apps/web/src/features/stat-chatteur/components/stat-kpis.tsx`, `apps/web/src/features/stat-chatteur/components/stat-ranking.tsx`

**Interfaces:**
- Consumes : `getStatChatteur(period, opts)` (Task 1) → `StatChatteurData` ; `resolvePeriod` (`@/lib/period`).

- [ ] **Step 1 : item de nav (groupe Performance)**

Dans `apps/web/src/config/workspaces.ts`, ajouter dans le `nav` de la face `chatter` (à côté de l'item « Stats », `group: 'performance'`) :
```ts
{ href: '/chatter/stat-chatteur', label: 'Stat chatteur', icon: Trophy, group: 'performance' },
```
Importer `Trophy` de `lucide-react` en tête du fichier (à côté des autres icônes). LIRE le fichier pour le style exact des items + l'import d'icônes.

- [ ] **Step 2 : page (période + fetch + Suspense)**

Créer `apps/web/src/app/(dash)/chatter/stat-chatteur/page.tsx` en MIROIR de `apps/web/src/app/(dash)/chatter/chatters/page.tsx` (LIRE-le d'abord : garde d'accès `requireAccess(...)`/`requireAdminOrManager`, calcul de `restricted`, `resolvePeriod`, Suspense + skeleton). Squelette :
```tsx
import { Suspense } from 'react'
import { resolvePeriod } from '@/lib/period'
import { getStatChatteur } from '@/features/stat-chatteur/services/get-stat-chatteur'
import { StatChatteurTemplate } from '@/features/stat-chatteur/StatChatteurTemplate'
// + la MÊME garde d'accès et le MÊME calcul `restricted` que chatters/page.tsx

export default async function StatChatteurPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  // … garde d'accès (mirror chatters/page.tsx) → détermine `restricted`
  const period = resolvePeriod(await searchParams)
  const data = getStatChatteur(period, { restricted })
  return (
    <Suspense fallback={/* skeleton simple, cf. chatters */ null}>
      {/* Template attend la PROMESSE ou la donnée résolue — suivre le patron de chatters/page.tsx */}
      <Content data={data} />
    </Suspense>
  )
}
```
> Suivre EXACTEMENT le patron de streaming de `chatters/page.tsx` (kickoff sans await + `use` dans le template, OU await dans un sous-composant `Content`) — ne pas inventer un patron différent.

- [ ] **Step 3 : template (Server Component)**

Créer `apps/web/src/features/stat-chatteur/StatChatteurTemplate.tsx` : un Server Component qui rend le titre + les 4 KPI (`StatKpis`) + la feuille client (`StatRanking`). Titre/entête comme `ChattersTemplate.tsx` (LIRE-le pour le style — ex. `{data.period} · N chatteurs closing`).
```tsx
import type { StatChatteurData } from './types'
import { StatKpis } from './components/stat-kpis'
import { StatRanking } from './components/stat-ranking'

export function StatChatteurTemplate({ data }: { data: StatChatteurData }) {
  return (
    <div className="flex flex-col gap-6">
      {/* en-tête (titre + période) — style ChattersTemplate */}
      <StatKpis kpis={data.kpis} />
      <StatRanking rows={data.rows} />
    </div>
  )
}
```

- [ ] **Step 4 : KPI cards**

Créer `apps/web/src/features/stat-chatteur/components/stat-kpis.tsx` : 4 cartes (Setters / Closers / Rouge / Bleue). Réutiliser le patron de carte KPI déjà présent dans le repo (LIRE une page qui affiche des KPI, ex. `features/police/**` ou `features/overview/**`, pour le style de carte + `STATUS_COLORS`). Structure :
```tsx
import type { StatChatteurData } from '../types'

const CARDS = [
  { key: 'nbSetters', label: 'Setters' },
  { key: 'nbClosers', label: 'Closers' },
  { key: 'nbRouge', label: 'Équipe Rouge' },
  { key: 'nbBleue', label: 'Équipe Bleue' },
] as const

export function StatKpis({ kpis }: { kpis: StatChatteurData['kpis'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-lg border p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{kpis[c.key]}</div>
        </div>
      ))}
    </div>
  )
}
```
> Adapter les classes au style de carte KPI réel du repo (bordure/ombre/couleurs). Rouge/Bleue peuvent porter une pastille de couleur cohérente avec les badges équipe existants.

- [ ] **Step 5 : classement filtrable (feuille CLIENT)**

Créer `apps/web/src/features/stat-chatteur/components/stat-ranking.tsx` (`'use client'`) : un filtre single-select (Setter / Closer / Rouge / Bleue / Mixé) + une `DataTable` (colonnes Rôle · Équipe · Ventes) triée par Ventes décroissant, filtrée côté client. LIRE `apps/web/src/components/data-table/data-table.tsx` (API réelle) et un usage existant (ex. `features/members/components/members-table.tsx` ou `features/chatters/components/chatters-table.tsx`) pour le patron colonnes + tri.
```tsx
'use client'
import { useState } from 'react'
import type { ClosingChatterRow } from '../types'
// + imports DataTable / colonnes selon l'API réelle

type Filtre = 'mixe' | 'setter' | 'closer' | 'rouge' | 'bleue'
const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'mixe', label: 'Mixé' },
  { value: 'setter', label: 'Setter' },
  { value: 'closer', label: 'Closer' },
  { value: 'rouge', label: 'Rouge' },
  { value: 'bleue', label: 'Bleue' },
]

export function StatRanking({ rows }: { rows: ClosingChatterRow[] }) {
  const [filtre, setFiltre] = useState<Filtre>('mixe')
  const filtered = rows.filter((r) =>
    filtre === 'mixe' ? true
    : filtre === 'setter' || filtre === 'closer' ? r.closingRole === filtre
    : r.closingTeam === filtre,
  )
  // rows déjà triées par vendu desc (service) ; le tri de la DataTable peut le confirmer/permuter.
  return (
    <div className="flex flex-col gap-3">
      {/* sélecteur de filtre (shadcn Select ou boutons segmentés — suivre un patron existant) */}
      {/* DataTable : colonnes Rôle (Setter/Closer), Équipe (Rouge/Bleue/—), Ventes (tabular-nums, tri desc défaut) */}
      {/* nom du chatteur en tête de ligne */}
    </div>
  )
}
```
> Remplir la `DataTable` (colonnes + tri par défaut sur `vendu` desc) selon l'API réelle du repo. Le filtre agit sur `rows` côté client (aucun round-trip). Badges Rôle/Équipe cohérents avec les autres (Setter/Closer, Rouge/Bleue).

- [ ] **Step 6 : vérifier**

Run: `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build`
Expected : verts (4 warnings préexistants tolérés : data-table ×2, ComptaTemplate, TeamsTemplate). Manuel : l'item « Stat chatteur » apparaît dans la sidebar (Performance) ; la page affiche 4 KPI + le tableau ; le filtre restreint les lignes ; le tri par Ventes classe du plus au moins ; changer la période du header change les ventes/l'ordre.

- [ ] **Step 7 : commit**

```bash
git add apps/web/src/config/workspaces.ts "apps/web/src/app/(dash)/chatter/stat-chatteur" apps/web/src/features/stat-chatteur/StatChatteurTemplate.tsx apps/web/src/features/stat-chatteur/components
git commit -m "feat(stat-chatteur): page Performance — 4 KPI closing + classement filtrable par ventes"
```

---

## Self-Review

**1. Spec coverage :**
- Page « Stat chatteur » (groupe Performance, nouvel item) → Task 2 Step 1-2. ✓
- 4 KPI = comptage membres par désignation → Task 1 (service) + Task 2 Step 4 (cards). ✓
- Classement chatteurs closing par `vendu` (période datepicker) → Task 1 (rows triées) + Task 2 Step 5. ✓
- Filtre Setter/Closer/Rouge/Bleue/Mixé (client) → Task 2 Step 5. ✓
- Réutilise `getChatters()` (pas de re-plomberie ventes) → Task 1 Step 2. ✓
- Cas limites (non-lié compté KPI/absent classement ; vendu=0 en bas ; restreint) → Global Constraints + service. ✓
- Hors périmètre (filtre sur /chatter/chatters, édition closing) → non planifié. ✓

**2. Placeholder scan :** pas de TBD/TODO de logique ; les « LIRE le fichier » sont volontaires (mirroir de patrons existants : page chatters, DataTable, cartes KPI — dont l'état exact doit être lu) ; le code du service (cœur data) + la logique de filtre/tri sont complets.

**3. Type consistency :** `StatChatteurData` (period, kpis{nbSetters,nbClosers,nbRouge,nbBleue}, rows), `ClosingChatterRow` (id,name,closingRole,closingTeam,vendu), `Filtre` ('mixe'|'setter'|'closer'|'rouge'|'bleue') cohérents entre service (Task 1) et UI (Task 2). `getStatChatteur(period, opts)` signature stable.

**Ordre** : 1 → 2 (Task 2 consomme le service de Task 1).
