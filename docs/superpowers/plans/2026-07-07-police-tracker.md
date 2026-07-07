# Feature « Police » (tracker sanctions) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page CRM `/chatter/police` : journal d'avertissements (ligne par erreur) + malus manuels par chatteur, persistés en base et rattachés `chatter_id`, prêts à être repiqués en compta.

**Architecture:** Une table unique `police_entries` (deux `kind` : `warning` / `malus`), lue par jour. Serveur = Server Actions (garde `has_page('police')`, suppression `is_admin`) + résolution des noms via client admin (comme repos). Client = feed du jour + 2 formulaires (avertissement, malus) + KPIs, avec sélecteur de jour.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui (Select, Input, Button, Popover), Supabase (supabase-js + RLS), Zod, Server Actions.

## Global Constraints

- **Mutations = Server Actions** (convention archi-web). RLS = garde-fou. Jamais de supabase-js client.
- **Droits** : saisie + modification = `has_page('police')` ; **suppression = admin only** (`role='admin'` au back + policy RLS `is_admin()`). Helpers `has_page`/`is_admin` existent déjà (0008/0017).
- **Contrôleur = utilisateur connecté** (`controller_id = profile.id`, auto). Pas de texte libre.
- **Malus manuel** : montant décidé à la main, PAS de 5 €/sanction auto.
- **Noms chatteurs résolus via client admin** (`createAdminClient` de `@glagency/db`), comme `get-repos` — les policiers voient tous les chatteurs. Données du journal restent sur le client RLS.
- **Pas de test runner** dans `apps/web`. Vérification = `cd apps/web && pnpm typecheck` + exécution réelle (`/verify`). Ne pas ajouter d'infra de test.
- **Migration** : prochain numéro = `0023`. Appliquée via Supabase MCP (`apply_migration`) sur projet `cqmfpsnqaxymswijdnfz`, puis types régénérés dans `packages/db/src/types.ts`.
- **11 types d'erreurs** codés en dur (`POLICE_ERRORS`), repris du HTML source.

---

## File Structure

- `packages/db/supabase/migrations/0023_police_entries.sql` — **créer** : table + RLS.
- `packages/db/src/types.ts` — **modifier** : ajout du type généré `police_entries`.
- `apps/web/src/config/workspaces.ts` — **modifier** : nav Chatter + `PAGE_SLUGS` `'police'`.
- `apps/web/src/features/police/types.ts` — **créer** : `POLICE_ERRORS`, `PoliceEntry`, `PoliceData`, options.
- `apps/web/src/features/police/services/get-police.ts` — **créer** : lecture jour + résolution noms.
- `apps/web/src/features/police/actions.ts` — **créer** : add warning/malus, update malus, delete.
- `apps/web/src/app/(dash)/chatter/police/page.tsx` — **créer** : garde + fetch + template.
- `apps/web/src/features/police/PoliceTemplate.tsx` — **créer** : sélecteur jour + orchestration.
- `apps/web/src/features/police/components/police-feed.tsx` — **créer** : historique du jour + KPIs + suppression admin.
- `apps/web/src/features/police/components/add-warning.tsx` — **créer** : formulaire avertissement.
- `apps/web/src/features/police/components/add-malus.tsx` — **créer** : formulaire malus.

---

## Task 1 : Migration DB (`police_entries` + RLS)

**Files:**
- Create: `packages/db/supabase/migrations/0023_police_entries.sql`
- Modify: `packages/db/src/types.ts`

**Interfaces:**
- Produces : table `police_entries(id, chatter_id, controller_id, occurred_on, kind, error_key, amount_eur, note, shift, created_at)`.

- [ ] **Step 1 : Écrire la migration**

```sql
-- 0023 — Tracker sanctions « Police ». Journal d'avertissements (1 ligne = 1 erreur) + malus
-- MANUELS par chatteur, rattachés chatter_id + occurred_on (repiquables en compta.malus).
-- Droits : saisie/modif = has_page('police') ; suppression = is_admin (cf. 0008/0017).
create table police_entries (
  id            uuid primary key default gen_random_uuid(),
  chatter_id    uuid not null references chatters(id) on delete cascade,
  controller_id uuid references profiles(id) on delete set null,
  occurred_on   date not null default current_date,
  kind          text not null check (kind in ('warning','malus')),
  error_key     text,
  amount_eur    numeric(10,2) not null default 0,
  note          text,
  shift         text check (shift in ('matin','aprem','soir')),
  created_at    timestamptz not null default now(),
  check ((kind = 'warning' and error_key is not null and amount_eur = 0)
      or (kind = 'malus' and amount_eur >= 0))
);
create index police_entries_day_idx on police_entries (occurred_on);
create index police_entries_chatter_idx on police_entries (chatter_id, occurred_on);

alter table police_entries enable row level security;
create policy police_read   on police_entries for select to authenticated using (public.has_page('police'));
create policy police_insert on police_entries for insert to authenticated with check (public.has_page('police'));
create policy police_update on police_entries for update to authenticated
  using (public.has_page('police')) with check (public.has_page('police'));
create policy police_delete on police_entries for delete to authenticated using (public.is_admin());
```

- [ ] **Step 2 : Appliquer** via MCP `apply_migration` (name `0023_police_entries`, project `cqmfpsnqaxymswijdnfz`).

- [ ] **Step 3 : Vérifier**

```sql
select count(*) as rows, (select count(*) from pg_policies where tablename='police_entries') as policies
from police_entries;
```
Expected : `rows = 0`, `policies = 4`.

- [ ] **Step 4 : Régénérer les types DB**

Via MCP `generate_typescript_types`, puis ajouter le bloc `police_entries` (Row/Insert/Update/Relationships) dans `packages/db/src/types.ts` (édition chirurgicale, alphabétique — juste avant `profile_creators`). Row :
```ts
police_entries: {
  Row: { id: string; chatter_id: string; controller_id: string | null; occurred_on: string; kind: string; error_key: string | null; amount_eur: number; note: string | null; shift: string | null; created_at: string }
  Insert: { id?: string; chatter_id: string; controller_id?: string | null; occurred_on?: string; kind: string; error_key?: string | null; amount_eur?: number; note?: string | null; shift?: string | null; created_at?: string }
  Update: { id?: string; chatter_id?: string; controller_id?: string | null; occurred_on?: string; kind?: string; error_key?: string | null; amount_eur?: number; note?: string | null; shift?: string | null; created_at?: string }
  Relationships: []
}
```

- [ ] **Step 5 : Commit**
```bash
git add packages/db/supabase/migrations/0023_police_entries.sql packages/db/src/types.ts
git commit -m "feat(police): table police_entries (warning/malus) + RLS"
```

---

## Task 2 : Types feature + nav/permission

**Files:**
- Create: `apps/web/src/features/police/types.ts`
- Modify: `apps/web/src/config/workspaces.ts`

**Interfaces:**
- Produces : `POLICE_ERRORS`, `PoliceErrorKey`, `SHIFTS`, `EntityOption`, `PoliceEntry`, `PoliceData`, `DayChoice`.

- [ ] **Step 1 : `types.ts`**
```ts
export const POLICE_ERRORS = [
  { key: 'media_argent', label: 'Parle de média/argent directement' },
  { key: 'reactivite', label: 'Réponse > 45 s par sub' },
  { key: 'media_rapide', label: 'Envoi de média trop rapide' },
  { key: 'fautes', label: "Fautes d'orthographe" },
  { key: 'setter_lent', label: 'Ne récupère pas vite les nouveaux (setter)' },
  { key: 'hors_script', label: "Ne suit pas l'histoire du script" },
  { key: 'sexu_faible', label: 'Sexualisation faible (ne fait pas baver)' },
  { key: 'promesse', label: 'Promesse non tenue (setter)' },
  { key: 'temps_media', label: "N'attend pas le temps du média" },
  { key: 'infos_non_transmises', label: 'Ne transmet pas les infos' },
  { key: 'infos_non_notees', label: 'Ne note pas les infos' },
] as const
export type PoliceErrorKey = (typeof POLICE_ERRORS)[number]['key']
export const SHIFTS = ['matin', 'aprem', 'soir'] as const

export interface EntityOption { id: string; name: string }
export interface DayChoice { day: string; label: string }

export interface PoliceEntry {
  id: string
  chatterId: string
  chatterName: string
  controllerName: string
  kind: 'warning' | 'malus'
  errorKey: string | null
  errorLabel: string | null
  amountEur: number
  note: string | null
  shift: string | null
  createdAt: string
}

export interface PoliceData {
  day: string
  dayLabel: string
  entries: PoliceEntry[]            // du jour, plus récent d'abord
  chatterOptions: EntityOption[]
  warningsByChatter: Record<string, number>  // fenêtre 30 j (aide décision malus)
  totalMalusEur: number
  warningCount: number
  chattersConcerned: number
  days: DayChoice[]
}
```

- [ ] **Step 2 : `workspaces.ts` — nav + slug**

Ajouter l'import `ShieldAlert` de `lucide-react`, l'entrée nav dans la face `chatter` (après `repos`) :
```ts
{ href: '/chatter/police', label: 'Police', icon: ShieldAlert },
```
et `'police'` dans `PAGE_SLUGS` :
```ts
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'repos', 'police', 'chatters', 'modeles', 'stats', 'health', 'compta'] as const
```

- [ ] **Step 3 : Vérifier** — `cd apps/web && pnpm typecheck` (erreurs attendues seulement dans les fichiers police pas encore créés).

- [ ] **Step 4 : Commit**
```bash
git add apps/web/src/features/police/types.ts apps/web/src/config/workspaces.ts
git commit -m "feat(police): types + nav Chatter + slug police"
```

---

## Task 3 : Service `get-police.ts`

**Files:**
- Create: `apps/web/src/features/police/services/get-police.ts`

**Interfaces:**
- Consumes : schéma Task 1, types Task 2.
- Produces : `getPolice(day?: string | null): Promise<PoliceData>`.

- [ ] **Step 1 : Écrire le service**
```ts
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { POLICE_ERRORS, type PoliceData, type PoliceEntry } from '../types'

const DAY_MS = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const frDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' })

const ERROR_LABEL: Record<string, string> = Object.fromEntries(POLICE_ERRORS.map((e) => [e.key, e.label]))

export async function getPolice(day?: string | null): Promise<PoliceData> {
  const supabase = await createClient()
  const admin = createAdminClient() // noms/listes agence-wide (comme get-repos)

  const today = iso(new Date())
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today
  const since = iso(new Date(new Date(`${selected}T00:00:00Z`).getTime() - 30 * DAY_MS))

  const [{ data: rows }, { data: recentWarns }, { data: chatterRows }, { data: profileRows }] =
    await Promise.all([
      supabase.from('police_entries').select('*').eq('occurred_on', selected).order('created_at', { ascending: false }),
      supabase.from('police_entries').select('chatter_id').eq('kind', 'warning').gte('occurred_on', since).lte('occurred_on', selected),
      admin.from('chatters').select('id, display_name, active'),
      admin.from('profiles').select('id, display_name'),
    ])

  const chatterName: Record<string, string> = {}
  for (const c of chatterRows ?? []) if (c.id && c.display_name) chatterName[c.id] = c.display_name
  const controllerName: Record<string, string> = {}
  for (const p of profileRows ?? []) if (p.id && p.display_name) controllerName[p.id] = p.display_name

  const chatterOptions = (chatterRows ?? [])
    .filter((c) => c.active && c.display_name)
    .map((c) => ({ id: c.id, name: c.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const warningsByChatter: Record<string, number> = {}
  for (const w of recentWarns ?? []) warningsByChatter[w.chatter_id] = (warningsByChatter[w.chatter_id] ?? 0) + 1

  const entries: PoliceEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    chatterId: r.chatter_id,
    chatterName: chatterName[r.chatter_id] ?? '?',
    controllerName: r.controller_id ? (controllerName[r.controller_id] ?? '—') : '—',
    kind: r.kind === 'malus' ? 'malus' : 'warning',
    errorKey: r.error_key,
    errorLabel: r.error_key ? (ERROR_LABEL[r.error_key] ?? r.error_key) : null,
    amountEur: Number(r.amount_eur),
    note: r.note,
    shift: r.shift,
    createdAt: r.created_at,
  }))

  const malusRows = entries.filter((e) => e.kind === 'malus')
  const warnRows = entries.filter((e) => e.kind === 'warning')

  const base = new Date(`${today}T00:00:00Z`).getTime()
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = iso(new Date(base - i * DAY_MS))
    return { day: d, label: frDay(d) }
  })

  return {
    day: selected,
    dayLabel: frDay(selected),
    entries,
    chatterOptions,
    warningsByChatter,
    totalMalusEur: malusRows.reduce((s, e) => s + e.amountEur, 0),
    warningCount: warnRows.length,
    chattersConcerned: new Set(entries.map((e) => e.chatterId)).size,
    days,
  }
}
```

- [ ] **Step 2 : Vérifier** — `cd apps/web && pnpm typecheck` (erreurs restantes : page/template/components).

- [ ] **Step 3 : Commit**
```bash
git add apps/web/src/features/police/services/get-police.ts
git commit -m "feat(police): get-police (journal du jour + noms + warnings récents)"
```

---

## Task 4 : Server Actions

**Files:**
- Create: `apps/web/src/features/police/actions.ts`

**Interfaces:**
- Produces : `addPoliceWarning`, `addPoliceMalus`, `updatePoliceMalus`, `deletePoliceEntry`.

- [ ] **Step 1 : Écrire les actions**
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { POLICE_ERRORS, SHIFTS } from './types'

type Result = { success: true } | { success: false; error: string }

async function requirePolice() {
  const profile = await getProfile()
  if (!profile) return null
  if (profile.role !== 'admin' && !profile.pages.includes('police')) return null
  return profile
}

const dayZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const shiftZ = z.enum(SHIFTS).optional()
const errorKeyZ = z.enum(POLICE_ERRORS.map((e) => e.key) as [string, ...string[]])

export async function addPoliceWarning(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = z.object({ day: dayZ, chatterId: z.string().uuid(), errorKey: errorKeyZ, shift: shiftZ }).safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').insert({
    chatter_id: p.data.chatterId, controller_id: profile.id, occurred_on: p.data.day,
    kind: 'warning', error_key: p.data.errorKey, amount_eur: 0, shift: p.data.shift ?? null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function addPoliceMalus(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = z.object({ day: dayZ, chatterId: z.string().uuid(), amountEur: z.number().min(0).max(100000), note: z.string().max(500).optional(), shift: shiftZ }).safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').insert({
    chatter_id: p.data.chatterId, controller_id: profile.id, occurred_on: p.data.day,
    kind: 'malus', amount_eur: p.data.amountEur, note: p.data.note ?? null, shift: p.data.shift ?? null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function updatePoliceMalus(raw: unknown): Promise<Result> {
  const profile = await requirePolice()
  if (!profile) return { success: false, error: 'Accès refusé' }
  const p = z.object({ id: z.string().uuid(), amountEur: z.number().min(0).max(100000), note: z.string().max(500).optional() }).safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').update({ amount_eur: p.data.amountEur, note: p.data.note ?? null }).eq('id', p.data.id).eq('kind', 'malus')
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}

export async function deletePoliceEntry(raw: unknown): Promise<Result> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Accès refusé' }
  const p = z.object({ id: z.string().uuid() }).safeParse(raw)
  if (!p.success) return { success: false, error: 'Saisie invalide' }
  const supabase = await createClient()
  const { error } = await supabase.from('police_entries').delete().eq('id', p.data.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/police')
  return { success: true }
}
```

- [ ] **Step 2 : Vérifier** — `cd apps/web && pnpm typecheck`.
- [ ] **Step 3 : Commit**
```bash
git add apps/web/src/features/police/actions.ts
git commit -m "feat(police): actions warning/malus (police) + delete (admin)"
```

---

## Task 5 : Client (page + template + 3 composants)

**Files:**
- Create: `apps/web/src/app/(dash)/chatter/police/page.tsx`
- Create: `apps/web/src/features/police/PoliceTemplate.tsx`
- Create: `apps/web/src/features/police/components/add-warning.tsx`
- Create: `apps/web/src/features/police/components/add-malus.tsx`
- Create: `apps/web/src/features/police/components/police-feed.tsx`

**Interfaces:**
- Consumes : `PoliceData` (Task 2), actions (Task 4), `getPolice` (Task 3).

- [ ] **Step 1 : `page.tsx`**
```tsx
import { getPolice } from '@/features/police/services/get-police'
import { PoliceTemplate } from '@/features/police/PoliceTemplate'
import { requireAccess } from '@/lib/auth'

export default async function PolicePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const profile = await requireAccess('police')
  const { day } = await searchParams
  const data = await getPolice(day ?? null)
  return <PoliceTemplate data={data} isAdmin={profile.role === 'admin'} />
}
```

- [ ] **Step 2 : `PoliceTemplate.tsx`** — sélecteur de jour (comme ReposTemplate) + grille : 2 formulaires (`AddWarning`, `AddMalus`) + `PoliceFeed`. Titre « Police — tracker sanctions ». Le jour se pousse en query `?day=`. Passe `data` aux composants et `isAdmin` au feed. (Reprendre la structure de `ReposTemplate.tsx` : `useRouter`/`useSearchParams`/`useTransition`, `Select` shadcn pour `data.days`.)

- [ ] **Step 3 : `add-warning.tsx`** (`'use client'`) — `Select` chatteur (`data.chatterOptions`) + `Select` type d'erreur (`POLICE_ERRORS`) + `Select` shift optionnel + bouton « Ajouter l'avertissement » → `addPoliceWarning({ day: data.day, chatterId, errorKey, shift })` dans `useTransition`, reset après succès.

- [ ] **Step 4 : `add-malus.tsx`** (`'use client'`) — `Select` chatteur ; à la sélection, afficher `data.warningsByChatter[chatterId] ?? 0` avertissements récents ; `Input` montant € (number) + `Input` note + bouton « Infliger le malus » → `addPoliceMalus({ day, chatterId, amountEur, note })`.

- [ ] **Step 5 : `police-feed.tsx`** (`'use client'`) — KPIs (total malus €, nb avertissements, nb chatters) + liste `data.entries` : chip ⚠️ (warning, jaune) ou 🚨 (malus, rouge) · chatteur · `errorLabel` ou `amountEur €` · `controllerName` · heure. Bouton poubelle `deletePoliceEntry` **si `isAdmin`**. Vide → « Aucune entrée ce jour. » Styles chips cohérents avec repos (jaune `bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`, rouge `bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300`).

- [ ] **Step 6 : Vérifier** — `cd apps/web && pnpm typecheck` → PASS (0 erreur).

- [ ] **Step 7 : Vérifier en réel** (`/verify` ou dev) : `/chatter/police` — ajouter un avertissement (apparaît dans le feed du jour, KPI +1), infliger un malus (KPI total € monte, warnings récents du chatteur affichés), naviguer d'un jour à l'autre, suppression visible seulement en admin. Vérifier qu'un compte `user` sans droit `police` est redirigé.

- [ ] **Step 8 : Commit**
```bash
git add apps/web/src/app/"(dash)"/chatter/police apps/web/src/features/police
git commit -m "feat(police): page /chatter/police (feed jour + avertissement + malus)"
```

---

## Self-Review (rempli à l'écriture)

**Spec coverage :** §3 table+RLS → Task 1. §4.1 get-police → Task 3. §4.2 actions → Task 4. §5 client (feed/formulaires/KPIs/jour) → Task 5. §6 nav+slug → Task 2. §2 décisions (warning/malus, contrôleur connecté, malus manuel, droits, shift optionnel, 11 erreurs) → Tasks 1/2/4/5. §7 hors scope respecté (pas de compta, pas de formation, pas de barème auto). ✅

**Placeholder scan :** aucun TBD ; migrations/actions/service en code complet ; Task 5 composants décrits avec props/actions exactes (reprennent des patterns repos existants). ✅

**Type consistency :** `PoliceData`/`PoliceEntry` (Task 2) consommés identiquement par get-police (Task 3) et le client (Task 5). Actions `addPoliceWarning/addPoliceMalus/updatePoliceMalus/deletePoliceEntry` (Task 4) appelées avec les mêmes payloads en Task 5. `POLICE_ERRORS`/`SHIFTS` partagés. ✅

**Note test :** pas de TDD (aucun runner dans `apps/web`) ; vérification `typecheck` + exécution réelle, conforme aux conventions du repo (cf. feature repos).
