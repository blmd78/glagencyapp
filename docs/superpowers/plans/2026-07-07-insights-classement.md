# Classement par métrique (Insights) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur `/chatter/insights`, un sélecteur « Classement par » qui affiche un tableau de classement global des chatteurs (rang · chatteur · valeur) pour une métrique (CA, présence, média proposé, conversion, réactivité) sur la semaine des insights.

**Architecture:** Un service compagnon `get-ranking.ts` agrège `chatter_daily` sur la semaine des insights via le **client admin** (classement global, hors RLS). Le template Insights ajoute un état `rankBy` : vide → cartes actuelles ; métrique → `<RankingTable>` (tri + format par métrique). Aucune migration.

**Tech Stack:** Next.js 16 (RSC), React 19, TypeScript, Tailwind v4, Supabase (client admin `@glagency/db`).

## Global Constraints

- **Données via client admin** (`createAdminClient` de `@glagency/db`, comme `get-repos`/`get-police`) → classement **global** indépendant du RLS du viewer. Accès = tous ceux qui ont la page `insights`.
- **Période = la semaine des insights** (`data.weekStart`, la S-1 affichée). Pas de sélecteur de période.
- **Tri par métrique** : CA / présence / proposé / conversion = **décroissant** ; **réactivité = croissant** (bas = mieux). Valeur nulle (pas de donnée) → **en bas** du classement.
- **Média proposé = `chatter_daily.propose`**. **Conversion = Σvendu / Σpropose × 100** (jamais moyenne des %). **Réactivité = moyenne des `reactivite_sec` non-null**. **Présence = Σ `presence_active_h`**.
- **Chatteurs sans activité la semaine exclus** (aucune ligne `chatter_daily`).
- **Pas de test runner** dans `apps/web` → vérification = `cd apps/web && pnpm typecheck` + exécution réelle.

---

## File Structure
- `apps/web/src/features/insights/types.ts` — **modifier** : `RankingRow`, `RankingData`.
- `apps/web/src/features/insights/services/get-ranking.ts` — **créer** : agrégation admin.
- `apps/web/src/features/insights/components/ranking-table.tsx` — **créer** : tri + rendu.
- `apps/web/src/features/insights/InsightsTemplate.tsx` — **modifier** : sélecteur + bascule.
- `apps/web/src/app/(dash)/chatter/insights/page.tsx` — **modifier** : fetch ranking.

---

## Task 1 : Types + service `get-ranking`

**Files:**
- Modify: `apps/web/src/features/insights/types.ts`
- Create: `apps/web/src/features/insights/services/get-ranking.ts`

**Interfaces:**
- Produces :
  - `interface RankingRow { chatterId: string; chatterName: string; ca: number; presenceH: number; propose: number; convPct: number | null; reactSec: number | null }`
  - `interface RankingData { weekStart: string; rows: RankingRow[] }`
  - `getRanking(weekStart: string | null): Promise<RankingData>`

- [ ] **Step 1 : Types dans `types.ts`** (ajouter en fin de fichier)
```ts
export interface RankingRow {
  chatterId: string
  chatterName: string
  ca: number
  presenceH: number
  propose: number
  convPct: number | null // null si propose = 0
  reactSec: number | null // null si aucune journée mesurée
}

export interface RankingData {
  weekStart: string
  rows: RankingRow[]
}
```

- [ ] **Step 2 : `services/get-ranking.ts`**
```ts
import { createAdminClient } from '@glagency/db'
import type { RankingData, RankingRow } from '../types'

const DAY_MS = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Classement GLOBAL des chatteurs sur la semaine des insights — agrège chatter_daily via le
 * client admin (hors RLS). Chatteurs sans donnée la semaine exclus.
 */
export async function getRanking(weekStart: string | null): Promise<RankingData> {
  if (!weekStart) return { weekStart: '', rows: [] }
  const admin = createAdminClient()
  const weekEnd = iso(new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 6 * DAY_MS))

  const [{ data: daily }, { data: chatterRows }] = await Promise.all([
    admin
      .from('chatter_daily')
      .select('chatter_id, ca, propose, vendu, presence_active_h, reactivite_sec')
      .gte('date', weekStart)
      .lte('date', weekEnd),
    admin.from('chatters').select('id, display_name'),
  ])

  const nameById: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) nameById[c.id] = c.display_name

  const acc = new Map<
    string,
    { ca: number; propose: number; vendu: number; presenceH: number; reactSum: number; reactN: number }
  >()
  for (const d of daily ?? []) {
    const a =
      acc.get(d.chatter_id) ?? { ca: 0, propose: 0, vendu: 0, presenceH: 0, reactSum: 0, reactN: 0 }
    a.ca += Number(d.ca) || 0
    a.propose += Number(d.propose) || 0
    a.vendu += Number(d.vendu) || 0
    a.presenceH += Number(d.presence_active_h) || 0
    if (d.reactivite_sec != null) {
      a.reactSum += Number(d.reactivite_sec)
      a.reactN += 1
    }
    acc.set(d.chatter_id, a)
  }

  const rows: RankingRow[] = [...acc.entries()].map(([chatterId, a]) => ({
    chatterId,
    chatterName: nameById[chatterId] ?? '?',
    ca: r2(a.ca),
    presenceH: r2(a.presenceH),
    propose: a.propose,
    convPct: a.propose > 0 ? r2((a.vendu / a.propose) * 100) : null,
    reactSec: a.reactN > 0 ? Math.round(a.reactSum / a.reactN) : null,
  }))

  return { weekStart, rows }
}
```

- [ ] **Step 3 : Vérifier** — `cd apps/web && pnpm typecheck` (erreurs attendues seulement dans page/template pas encore modifiés).

- [ ] **Step 4 : Commit**
```bash
git add apps/web/src/features/insights/types.ts apps/web/src/features/insights/services/get-ranking.ts
git commit -m "feat(insights): service get-ranking (agrégation chatter_daily, global)"
```

---

## Task 2 : Composant `ranking-table`

**Files:**
- Create: `apps/web/src/features/insights/components/ranking-table.tsx`

**Interfaces:**
- Consumes : `RankingData`, `RankingRow` (Task 1).
- Produces : `RankMetric = 'ca' | 'presence' | 'propose' | 'conv' | 'react'` ; `<RankingTable ranking metric />`.

- [ ] **Step 1 : Écrire le composant**
```tsx
'use client'

import { eur, num } from '@/lib/format'
import type { RankingData, RankingRow } from '../types'

export type RankMetric = 'ca' | 'presence' | 'propose' | 'conv' | 'react'

interface MetricDef {
  label: string
  get: (r: RankingRow) => number | null
  fmt: (v: number) => string
  dir: 'asc' | 'desc'
}

const METRICS: Record<RankMetric, MetricDef> = {
  ca: { label: 'CA', get: (r) => r.ca, fmt: (v) => eur(v), dir: 'desc' },
  presence: { label: 'Présence', get: (r) => r.presenceH, fmt: (v) => `${Math.round(v)} h`, dir: 'desc' },
  propose: { label: 'Média proposé', get: (r) => r.propose, fmt: (v) => num(v), dir: 'desc' },
  conv: {
    label: 'Taux de conversion',
    get: (r) => r.convPct,
    fmt: (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`,
    dir: 'desc',
  },
  react: { label: 'Réactivité', get: (r) => r.reactSec, fmt: (v) => `${v} s`, dir: 'asc' },
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`)

const frShort = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

export function RankingTable({ ranking, metric }: { ranking: RankingData; metric: RankMetric }) {
  const m = METRICS[metric]
  // Valeur nulle (pas de donnée) → en bas, quel que soit le sens de tri.
  const sorted = [...ranking.rows].sort((a, b) => {
    const va = m.get(a)
    const vb = m.get(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return m.dir === 'desc' ? vb - va : va - vb
  })

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">Classement — {m.label}</span>
        {ranking.weekStart && (
          <span className="text-xs text-muted-foreground">Semaine du {frShort(ranking.weekStart)}</span>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune donnée sur cette semaine.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="w-14 px-4 py-2 font-medium">Rang</th>
              <th className="px-4 py-2 font-medium">Chatteur</th>
              <th className="px-4 py-2 text-right font-medium">{m.label}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const v = m.get(r)
              return (
                <tr key={r.chatterId} className="border-t">
                  <td className="px-4 py-2 tabular-nums">{v == null ? '—' : medal(i)}</td>
                  <td className="px-4 py-2 font-medium">{r.chatterName}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {v == null ? '—' : m.fmt(v)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
```
Note : vérifier que `@/lib/format` exporte `eur` et `num` (utilisés ailleurs, ex. chatters-table). Sinon adapter l'import.

- [ ] **Step 2 : Vérifier** — `cd apps/web && pnpm typecheck`.
- [ ] **Step 3 : Commit**
```bash
git add apps/web/src/features/insights/components/ranking-table.tsx
git commit -m "feat(insights): RankingTable (tri + format par métrique)"
```

---

## Task 3 : Sélecteur + bascule (template + page)

**Files:**
- Modify: `apps/web/src/app/(dash)/chatter/insights/page.tsx`
- Modify: `apps/web/src/features/insights/InsightsTemplate.tsx`

**Interfaces:**
- Consumes : `getRanking` (Task 1), `RankingTable` + `RankMetric` (Task 2), `RankingData` (Task 1).

- [ ] **Step 1 : `page.tsx` — fetch ranking et passer au template**
```tsx
import { getInsights } from '@/features/insights/services/get-insights'
import { getRanking } from '@/features/insights/services/get-ranking'
import { InsightsTemplate } from '@/features/insights/InsightsTemplate'
import { requireAccess } from '@/lib/auth'

export default async function InsightsPage() {
  const profile = await requireAccess('insights')
  const data = await getInsights(undefined, { restricted: profile.role !== 'admin' })
  const ranking = await getRanking(data.weekStart)
  return (
    <InsightsTemplate
      data={data}
      ranking={ranking}
      isAdmin={profile.role === 'admin'}
      currentUserId={profile.id}
    />
  )
}
```

- [ ] **Step 2 : `InsightsTemplate.tsx` — prop `ranking`, état `rankBy`, sélecteur, bascule**

Ajouter l'import :
```tsx
import { RankingTable, type RankMetric } from './components/ranking-table'
import type { RankingData } from './types'
```
Étendre la signature du composant : `{ data, ranking, isAdmin, currentUserId }` avec `ranking: RankingData`.

Ajouter l'état (à côté des autres filtres) :
```tsx
const [rankBy, setRankBy] = useState<'' | RankMetric>('')
```

Ajouter le sélecteur **à côté des filtres existants** (même style que le filtre modèle, `h-8 w-44 text-xs`) :
```tsx
<Select value={rankBy} onValueChange={(v) => setRankBy(v as '' | RankMetric)}>
  <SelectTrigger className="h-8 w-44 text-xs">
    <SelectValue placeholder="Classement par…" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="" className="text-xs">— Aucun (cartes)</SelectItem>
    <SelectItem value="ca" className="text-xs">CA</SelectItem>
    <SelectItem value="presence" className="text-xs">Présence</SelectItem>
    <SelectItem value="propose" className="text-xs">Média proposé</SelectItem>
    <SelectItem value="conv" className="text-xs">Taux de conversion</SelectItem>
    <SelectItem value="react" className="text-xs">Réactivité</SelectItem>
  </SelectContent>
</Select>
```

Bascule : là où la grille de cartes (`shown.map(... InsightCard ...)`) est rendue, l'entourer d'une condition :
```tsx
{rankBy ? (
  <RankingTable ranking={ranking} metric={rankBy} />
) : (
  /* grille de cartes existante inchangée */
)}
```
Les filtres statut/modèle/sévérité restent visibles ; ils n'affectent pas le classement (global). (Optionnel : les griser quand `rankBy` est actif — non requis.)

- [ ] **Step 3 : Vérifier** — `cd apps/web && pnpm typecheck` → PASS (0 erreur).

- [ ] **Step 4 : Vérifier en réel** (`/verify` ou dev) : `/chatter/insights` — sélecteur « Classement par » ; choisir CA → tableau trié décroissant, médailles top 3 ; Réactivité → trié croissant (meilleur temps en haut), chatteurs sans mesure en bas (« — ») ; « Aucun » → retour aux cartes. Vérifier que ça marche pour un compte non-admin ayant la page `insights` (classement global visible).

- [ ] **Step 5 : Commit**
```bash
git add "apps/web/src/app/(dash)/chatter/insights/page.tsx" apps/web/src/features/insights/InsightsTemplate.tsx
git commit -m "feat(insights): sélecteur Classement par + bascule tableau/cartes"
```

---

## Self-Review (rempli à l'écriture)

**Spec coverage :** §2 déclencheur/affichage/période/population/accès → Tasks 1/3. §3 métriques & tri → Task 2 (`METRICS`, sens de tri, null en bas). §4 données (admin, chatter_daily, exclusion sans activité) → Task 1. §5 client (page + sélecteur + bascule + RankingTable) → Tasks 2/3. §6 hors périmètre respecté (pas d'export, pas de sélecteur période, global only). ✅

**Placeholder scan :** aucun TBD ; service + composant en code complet ; Task 3 décrit les edits exacts (imports, état, sélecteur, bascule). ✅

**Type consistency :** `RankingRow`/`RankingData` (Task 1) consommés par `get-ranking` (Task 1), `RankingTable` (Task 2), template + page (Task 3). `RankMetric` défini Task 2, importé Task 3. `getRanking(weekStart)` signature identique page↔service. ✅

**Note test :** pas de TDD (pas de runner) ; `typecheck` + exécution réelle, conforme au repo.
