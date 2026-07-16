# Comptes rendus journaliers (« Dashboard ») — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page `/chatter/dashboard` où admins/managers écrivent un compte rendu texte libre par jour ; chacun voit les siens, le superadmin voit tout.

**Architecture:** Table `daily_reports` (unique par personne/jour, RLS = enforcement réel), droit d'écrire porté par le droit de page `dashboard` (pas le rôle), feature `features/reports/` selon la convention `app → feature(template) → composants`, mutations en Server Actions.

**Tech Stack:** Next.js 16 (App Router, RSC, `cacheComponents`), Supabase (RLS), zod v4 + react-hook-form (schéma partagé), shadcn/ui, Tailwind v4.

**Spec :** `docs/superpowers/specs/2026-07-16-daily-reports-design.md`

## Global Constraints

- **AUCUN commit / push sans accord explicite de Benoit** (consigne donnée en session). Chaque « checkpoint commit » = demander, pas committer. Ne JAMAIS push : le push sur `main` déclenche le deploy Vercel auto.
- **Migration appliquée en prod AVANT tout push du code** (workflow repo, `docs/guidelines-data-loading.md`) — l'application prod est faite par Benoit ou avec son accord.
- **Ne pas toucher** : branche `wip/compta-spenders-relances`, worktree `.claude/worktrees/snap-crypto` (périmé mais il modifie `config/workspaces.ts`). Travailler uniquement dans l'arbre principal, sur `main`.
- **Pas d'enum Postgres** (`text` + check si besoin — ici aucun check de rôle : le droit est porté par la page).
- **Ne pas modifier le design/styling existant** — composants en place uniquement (Card shadcn, `ActionButton`, `ConfirmDialog`).
- Suppression = toujours via `ConfirmDialog` ; action serveur = toujours `ActionButton` (règles app).
- Libellés UI en français ; code/tables en anglais (convention repo).
- **Pas de tests runtime feature** : le repo n'en a pas (Vitest = `packages/core` seulement). Vérification = lint + tsc + checklist manuelle multi-rôles (spec §7, validée par Benoit). C'est une déviation assumée du TDD par défaut de ce skill.
- zod v4 (`^4.4.3`) mais style du repo conservé (`z.string().uuid()`, `z.string().email()` — cf. `features/members/schema.ts`).

---

### Task 1: Migration `0047_daily_reports.sql` + régénération des types

**Files:**
- Create: `packages/db/supabase/migrations/0047_daily_reports.sql`
- Regenerate: `packages/db/src/types.ts` (généré — ne jamais éditer à la main)

**Interfaces:**
- Consumes: helpers SQL existants `public.is_admin()` (`0037:18`), `public.is_superadmin()` (`0037:29`), `public.has_page(slug text)` (`0017:25`), table `public.profiles`.
- Produces: table `public.daily_reports` (colonnes `id uuid`, `profile_id uuid`, `day date` → string `YYYY-MM-DD` côté PostgREST, `content text`, `created_at`, `updated_at timestamptz`), contrainte `unique (profile_id, day)` → cible d'upsert `onConflict: 'profile_id,day'`, et l'entrée `daily_reports` dans les types générés (utilisée par Tasks 3-4).

- [ ] **Step 1 : Écrire la migration**

Contenu complet de `packages/db/supabase/migrations/0047_daily_reports.sql` :

```sql
-- 0047 — Comptes rendus journaliers (page « Dashboard », face chatteurs).
-- Un compte rendu texte libre PAR PERSONNE ET PAR JOUR (unique — l'app upsert).
-- Lecture : chacun LE SIEN (admin compris), superadmin tout.
-- Écriture : le sien uniquement, si droit de page `dashboard` — les admins passent
-- d'office via is_admin(). NB : is_admin() couvre le superadmin (0037) et neutralise
-- le bug connu de has_page() sur main (un superadmin ne passe pas has_page —
-- corrigé à la main en prod le 2026-07-15, cf. 0040_has_page_superadmin sur la wip).

create table public.daily_reports (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, day)
);
-- La page ne fait qu'une requête : fenêtre glissante ordonnée par jour décroissant.
create index daily_reports_day_idx on public.daily_reports (day desc);

alter table public.daily_reports enable row level security;

create policy daily_reports_read on public.daily_reports
  for select to authenticated
  using (public.is_superadmin() or profile_id = (select auth.uid()));

create policy daily_reports_ins on public.daily_reports
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );

create policy daily_reports_upd on public.daily_reports
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );

create policy daily_reports_del on public.daily_reports
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and (public.is_admin() or public.has_page('dashboard'))
  );
```

Conventions à respecter (vérifiables dans `0030_chatter_plannings.sql` et `0037`) :
`(select auth.uid())` **entre parenthèses** (optimisation initplan), pas de `grant`
(les privilèges par défaut Supabase couvrent `authenticated` ; la RLS fait le tri).

- [ ] **Step 2 : STOP — faire appliquer la migration**

Le script `db:types` du repo lit la base **locale** (`package.json` racine :
`supabase gen types typescript --local`). Deux cas :

- **Stack Supabase locale dispo** : appliquer le SQL ci-dessus sur la base locale
  (Studio local → SQL editor, ou `psql`), puis Step 3.
- **Pas de stack locale** : demander à Benoit d'appliquer le SQL **en prod**
  (SQL editor Supabase) — c'est le workflow documenté du repo (migration avant code,
  table additive sans risque : aucun code ne la référence encore). Puis générer les
  types depuis le projet lié : `supabase gen types typescript --linked > packages/db/src/types.ts`.

**Ne pas continuer tant que la migration n'est appliquée nulle part** : sans elle,
les types ne contiendront pas `daily_reports` et les Tasks 3-4 ne compileront pas.

- [ ] **Step 3 : Régénérer les types**

Run : `pnpm db:types` (ou la variante `--linked` du Step 2)
Attendu : `git diff packages/db/src/types.ts` montre l'AJOUT du bloc `daily_reports`
(Row/Insert/Update + Relationships vers `profiles`) **sans suppression d'autres tables**.
Si le diff supprime des tables existantes → la base interrogée n'est pas à jour :
`git checkout -- packages/db/src/types.ts` et revenir au Step 2.

- [ ] **Step 4 : Checkpoint commit**

Proposer à Benoit (NE PAS committer sans accord) :
```bash
git add packages/db/supabase/migrations/0047_daily_reports.sql packages/db/src/types.ts
git commit -m "feat(db): table daily_reports (comptes rendus journaliers) + RLS"
```

---

### Task 2: Slug + item de nav — `config/workspaces.ts`

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (import lucide l.2-33, nav chatteurs l.113, `PAGE_SLUGS` l.152)

**Interfaces:**
- Consumes: rien (config pure).
- Produces: slug `'dashboard'` dans le type `PageSlug` — requis par `requireAccess('dashboard')` (Tasks 4 et 6) ; item de nav visible ; case « Dashboard » auto-ajoutée dans `PAGE_CHOICES` (page Membres).

- [ ] **Step 1 : Ajouter l'import d'icône**

Dans le bloc d'import lucide-react (lignes 2-33), ajouter `NotebookPen` (ordre alphabétique non requis — suivre la liste existante, ajouter avant `IdCard` par exemple) :

```ts
import {
  // ... imports existants inchangés ...
  NotebookPen,
} from 'lucide-react'
```

- [ ] **Step 2 : Ajouter l'item de nav AVANT Membres**

Dans `WORKSPACES[0].nav`, juste au-dessus de la ligne Membres
(`{ href: '/chatter/members', label: 'Membres', icon: UserCog, adminOnly: true, bottom: true }`) :

```ts
      // Comptes rendus journaliers — écrit par quiconque a le droit de page (admins
      // d'office) ; le superadmin y lit tout le monde. Pas adminOnly → cochable
      // dans Membres via PAGE_CHOICES.
      { href: '/chatter/dashboard', label: 'Dashboard', icon: NotebookPen, bottom: true },
```

`bottom: true` + position avant Membres = affiché au-dessus de Membres dans la zone
basse de la sidebar (`app-sidebar.tsx:96-100` répartit `directBottom` dans l'ordre du tableau).

- [ ] **Step 3 : Ajouter le slug à `PAGE_SLUGS`**

Ligne 152, insérer `'dashboard'` après `'compta'` :

```ts
export const PAGE_SLUGS = ['overview', 'insights', 'bilan', 'planning', 'repos', 'police', 'chatters', 'infos-modeles', 'crm-spenders', 'scripts', 'modeles', 'stats', 'health', 'compta', 'dashboard', 'marketing', 'mkt-overview', 'mkt-liens', 'mkt-instagram', 'mkt-twitter', 'mkt-telegram', 'mkt-staff', 'mkt-compta'] as const
```

- [ ] **Step 4 : Vérifier la compilation**

Run : `pnpm --filter @glagency/web typecheck`
Attendu : PASS (0 erreur). L'item apparaît dans la sidebar mais mène à un 404 tant
que la Task 6 n'est pas faite — normal à ce stade.

- [ ] **Step 5 : Checkpoint commit**

Proposer à Benoit :
```bash
git add apps/web/src/config/workspaces.ts
git commit -m "feat(nav): page Dashboard (comptes rendus) au-dessus de Membres"
```

---

### Task 3: Socle feature — dates, schéma zod, types, service

**Files:**
- Create: `apps/web/src/features/reports/dates.ts`
- Create: `apps/web/src/features/reports/schema.ts`
- Create: `apps/web/src/features/reports/types.ts`
- Create: `apps/web/src/features/reports/services/get-reports.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server` ; table `daily_reports` typée (Task 1).
- Produces:
  - `todayParis(): string`, `shiftDay(iso: string, days: number): string`
  - `REPORT_WINDOW_DAYS = 30`, `reportInput` (zod), `type ReportForm = { day: string; content: string }`
  - `interface DailyReport { id: string; profileId: string; day: string; content: string; updatedAt: string; authorName: string }`
  - `interface ReportsData { reports: DailyReport[]; minDay: string; maxDay: string }`
  - `getReports(): Promise<ReportsData>`

- [ ] **Step 1 : `dates.ts`**

```ts
/**
 * Dates du domaine « compte rendu journalier ». Vercel tourne en UTC : « aujourd'hui »
 * doit être calculé en Europe/Paris, sinon un compte rendu écrit entre minuit et 1h/2h
 * du matin (heure FR) serait daté de la veille. Piège de fuseau documenté du repo
 * (guidelines-data-loading : les bornes se calculent côté TS, jamais en base).
 */

/** Aujourd'hui en Europe/Paris, format YYYY-MM-DD (en-CA = ISO). */
export const todayParis = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

/** Décale une date ISO (YYYY-MM-DD) de n jours — calcul en UTC pur, insensible au DST. */
export const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2 : `schema.ts`**

```ts
import { z } from 'zod'
import { shiftDay, todayParis } from './dates'

// Fenêtre de saisie ET d'affichage (mêmes bornes : impossible d'écraser à l'aveugle
// un compte rendu plus ancien que ce que la liste montre).
export const REPORT_WINDOW_DAYS = 30

// Schéma PARTAGÉ client (form RHF) ↔ serveur (actions safeParse) — source unique.
// Les dates ISO se comparent en string (ordre lexicographique = ordre chronologique).
export const reportInput = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
    .refine((d) => {
      const today = todayParis()
      return d <= today && d >= shiftDay(today, -REPORT_WINDOW_DAYS)
    }, 'Date hors fenêtre (30 derniers jours, pas de futur)'),
  content: z
    .string()
    .trim()
    .min(1, 'Compte rendu vide')
    .max(10_000, 'Trop long (10 000 caractères max)'),
})
export type ReportForm = z.infer<typeof reportInput>
```

- [ ] **Step 3 : `types.ts`**

```ts
/** Contrat de la page Dashboard (comptes rendus journaliers). */

export interface DailyReport {
  id: string
  profileId: string
  /** YYYY-MM-DD */
  day: string
  content: string
  updatedAt: string
  /** Nom de l'auteur — utile en vue superadmin (dérivé display_name → email). */
  authorName: string
}

export interface ReportsData {
  /** Fenêtre 30 j, antéchrono. La RLS décide du contenu : les siens, ou tout (superadmin). */
  reports: DailyReport[]
  /** Bornes de saisie/affichage YYYY-MM-DD (Europe/Paris). */
  minDay: string
  maxDay: string
}
```

- [ ] **Step 4 : `services/get-reports.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import { shiftDay, todayParis } from '../dates'
import { REPORT_WINDOW_DAYS } from '../schema'
import type { DailyReport, ReportsData } from '../types'

/**
 * Fenêtre glissante 30 j. UNE requête pour tous les rôles : la RLS fait le tri
 * (chacun ses lignes, superadmin tout) — aucun branchement de sécurité côté TS.
 * Volume borné (~15 rédacteurs × 30 j ≪ plafond PostgREST 1000) → pas de fetchAll ;
 * si la fenêtre s'élargit un jour, fetchAll devient OBLIGATOIRE (règle repo).
 */
export async function getReports(): Promise<ReportsData> {
  const supabase = await createClient()
  const maxDay = todayParis()
  const minDay = shiftDay(maxDay, -REPORT_WINDOW_DAYS)
  const { data } = await supabase
    .from('daily_reports')
    .select('id, profile_id, day, content, updated_at, profiles(display_name, email)')
    .gte('day', minDay)
    .order('day', { ascending: false })
    .order('updated_at', { ascending: false })
  const reports: DailyReport[] = (data ?? []).map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    day: r.day,
    content: r.content,
    updatedAt: r.updated_at,
    authorName: r.profiles?.display_name ?? (r.profiles?.email ?? '').split('@')[0] ?? '—',
  }))
  return { reports, minDay, maxDay }
}
```

Note : `profiles(...)` est un embed to-one (FK `daily_reports_profile_id_fkey`) —
avec les types régénérés (Task 1), `r.profiles` est un objet nullable. Si TS le
type en tableau (quirk supabase-js quand la relation est ambiguë), expliciter le
hint : `profiles!daily_reports_profile_id_fkey(display_name, email)`.
L'embed passe la RLS de `profiles` : chacun lit son profil, l'admin lit tout
(même mécanique que `get-members.ts`) — jamais bloquant ici.

- [ ] **Step 5 : Vérifier la compilation**

Run : `pnpm --filter @glagency/web typecheck`
Attendu : PASS. Si `daily_reports` est inconnu → la Task 1 Step 3 n'a pas été faite.

- [ ] **Step 6 : Checkpoint commit**

Proposer à Benoit :
```bash
git add apps/web/src/features/reports/dates.ts apps/web/src/features/reports/schema.ts apps/web/src/features/reports/types.ts apps/web/src/features/reports/services/get-reports.ts
git commit -m "feat(reports): socle feature comptes rendus (schéma, types, service)"
```

---

### Task 4: Server Actions — `features/reports/actions.ts`

**Files:**
- Create: `apps/web/src/features/reports/actions.ts`

**Interfaces:**
- Consumes: `reportInput` (Task 3), `requireAccess` de `@/lib/auth`, `createClient` de `@/lib/supabase/server`, slug `'dashboard'` (Task 2).
- Produces: `upsertReport(input: unknown): Promise<Result>` et `deleteReport(id: unknown): Promise<Result>` avec `Result = { success: true } | { success: false; error: string }` — consommés par les composants client (Task 5).

- [ ] **Step 1 : Écrire les actions**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAccess } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { reportInput } from './schema'

/**
 * Mutations des comptes rendus. Client SESSION (pas service-role) : la RLS est
 * l'enforcement réel — « le sien uniquement, si droit de page » (0047). La garde
 * requireAccess n'est que le contrôle optimiste (redirect propre au lieu d'un 403).
 */

type Result = { success: true } | { success: false; error: string }

/** Crée ou remplace LE compte rendu du jour choisi (unique par personne/jour). */
export async function upsertReport(input: unknown): Promise<Result> {
  const profile = await requireAccess('dashboard')
  const parsed = reportInput.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Saisie invalide' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('daily_reports').upsert(
    {
      profile_id: profile.id,
      day: parsed.data.day,
      content: parsed.data.content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,day' },
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/chatter/dashboard')
  return { success: true }
}

/** Supprime UN compte rendu — la RLS garantit « le sien uniquement ». */
export async function deleteReport(id: unknown): Promise<Result> {
  await requireAccess('dashboard')
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { success: false, error: 'Id invalide' }
  const supabase = await createClient()
  // .select() après delete : sous RLS, un delete filtré ne renvoie PAS d'erreur —
  // 0 ligne retournée = rien supprimé, on le dit au lieu de mentir « succès ».
  const { data, error } = await supabase
    .from('daily_reports')
    .delete()
    .eq('id', parsed.data)
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) return { success: false, error: 'Introuvable ou non autorisé' }
  revalidatePath('/chatter/dashboard')
  return { success: true }
}
```

- [ ] **Step 2 : Vérifier la compilation**

Run : `pnpm --filter @glagency/web typecheck`
Attendu : PASS.

- [ ] **Step 3 : Checkpoint commit**

Proposer à Benoit :
```bash
git add apps/web/src/features/reports/actions.ts
git commit -m "feat(reports): actions upsert/delete compte rendu (RLS session)"
```

---

### Task 5: UI — form, liste, Template

**Files:**
- Create: `apps/web/src/features/reports/components/report-form.tsx`
- Create: `apps/web/src/features/reports/components/reports-list.tsx`
- Create: `apps/web/src/features/reports/ReportsTemplate.tsx`

**Interfaces:**
- Consumes: `upsertReport`/`deleteReport` (Task 4), `reportInput`/`ReportForm` (Task 3), `DailyReport`/`ReportsData` (Task 3), `Profile` de `@/lib/auth`, `ActionButton`, `ConfirmDialog`, primitives shadcn (`Card`, `Input`, `Textarea`, `Button`), `date-fns` (+ locale `fr`, déjà dépendance).
- Produces: `ReportsTemplate({ data, profile })` — consommé par la page (Task 6).

- [ ] **Step 1 : `components/report-form.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ActionButton } from '@/components/action-button'
import { upsertReport } from '../actions'
import { reportInput, type ReportForm } from '../schema'
import type { DailyReport } from '../types'

/**
 * Saisie du compte rendu (un par jour — upsert). Changer la date pré-remplit avec
 * l'existant de ce jour : on ÉDITE, on ne duplique jamais. Le placeholder oriente le
 * contenu (le futur résumé IA a besoin des blocages, pas d'une liste de réunions).
 */
export function ReportFormCard({
  reports,
  minDay,
  maxDay,
}: {
  /** Les comptes rendus DE L'UTILISATEUR (fenêtre 30 j), pour le pré-remplissage. */
  reports: DailyReport[]
  minDay: string
  maxDay: string
}) {
  const byDay = useMemo(() => new Map(reports.map((r) => [r.day, r.content])), [reports])
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReportForm>({
    resolver: zodResolver(reportInput),
    defaultValues: { day: maxDay, content: byDay.get(maxDay) ?? '' },
  })
  const day = watch('day')
  const exists = byDay.has(day)

  const submit = handleSubmit(async (values) => {
    setSaved(false)
    const res = await upsertReport(values)
    if (!res.success) {
      setError('root', { message: res.error })
      return
    }
    setSaved(true)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {exists ? 'Modifier le compte rendu' : 'Compte rendu du jour'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Date
            </label>
            <Input
              type="date"
              className="w-fit"
              min={minDay}
              max={maxDay}
              disabled={isSubmitting}
              {...register('day', {
                // Changer de jour = charger le compte rendu de CE jour (édition).
                onChange: (e) => {
                  setValue('content', byDay.get(e.target.value) ?? '')
                  setSaved(false)
                },
              })}
            />
            {errors.day && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.day.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Textarea
              rows={8}
              placeholder={
                'Ce que tu as fait aujourd’hui, ce qui bloque, ce qui est prévu demain…'
              }
              disabled={isSubmitting}
              {...register('content', { onChange: () => setSaved(false) })}
            />
            {errors.content && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.content.message}</p>
            )}
          </div>

          {errors.root && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.root.message}</p>
          )}

          <div className="flex items-center gap-3">
            <ActionButton type="submit" pending={isSubmitting} className="w-fit">
              {exists ? 'Mettre à jour' : 'Enregistrer'}
            </ActionButton>
            {saved && <p className="text-sm text-muted-foreground">Enregistré.</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2 : `components/reports-list.tsx`**

```tsx
'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteReport } from '../actions'
import type { DailyReport } from '../types'

const dayLabel = (iso: string) => {
  const s = format(new Date(`${iso}T00:00:00`), 'EEEE d MMMM yyyy', { locale: fr })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Comptes rendus en cards, groupés par jour (antéchrono). Vue « moi » : une card par
 * jour. Vue superadmin : une card par auteur sous chaque jour, nom affiché.
 * Suppression : uniquement ses propres cards, via ConfirmDialog (règle app).
 */
export function ReportsList({
  reports,
  profileId,
  showAuthor,
}: {
  reports: DailyReport[]
  /** Utilisateur courant — seules SES cards ont le bouton supprimer. */
  profileId: string
  /** Vue superadmin : afficher l'auteur sur chaque card. */
  showAuthor: boolean
}) {
  if (!reports.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun compte rendu sur les 30 derniers jours.
      </p>
    )
  }
  const days = [...new Set(reports.map((r) => r.day))]
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{dayLabel(day)}</h2>
          {reports
            .filter((r) => r.day === day)
            .map((r) => (
              <Card key={r.id}>
                {showAuthor && (
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm">{r.authorName}</CardTitle>
                  </CardHeader>
                )}
                <CardContent className="flex items-start justify-between gap-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
                  {r.profileId === profileId && (
                    <ConfirmDialog
                      title="Supprimer ce compte rendu ?"
                      description={dayLabel(r.day)}
                      trigger={
                        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Supprimer">
                          <Trash2 className="size-4" />
                        </Button>
                      }
                      onConfirm={async () => {
                        const res = await deleteReport(r.id)
                        if (!res.success) return res.error
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 3 : `ReportsTemplate.tsx`**

```tsx
import type { Profile } from '@/lib/auth'
import { ReportFormCard } from './components/report-form'
import { ReportsList } from './components/reports-list'
import type { ReportsData } from './types'

/**
 * Template Dashboard (comptes rendus journaliers). Aucun fetch ici (convention
 * app → feature(template) → composants). La RLS a déjà décidé du contenu de
 * data.reports : les siens (admin/manager), ou tout le monde (superadmin).
 * Le superadmin n'écrit pas (v1) → pas de form pour lui.
 */
export function ReportsTemplate({ data, profile }: { data: ReportsData; profile: Profile }) {
  const own = data.reports.filter((r) => r.profileId === profile.id)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile.superadmin
            ? "Comptes rendus de l'équipe — 30 derniers jours"
            : 'Ton compte rendu journalier — un par jour, modifiable'}
        </p>
      </div>

      {!profile.superadmin && (
        <ReportFormCard reports={own} minDay={data.minDay} maxDay={data.maxDay} />
      )}

      <ReportsList
        reports={data.reports}
        profileId={profile.id}
        showAuthor={profile.superadmin}
      />
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier compilation + lint**

Run : `pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint`
Attendu : PASS les deux.

- [ ] **Step 5 : Checkpoint commit**

Proposer à Benoit :
```bash
git add apps/web/src/features/reports/components/report-form.tsx apps/web/src/features/reports/components/reports-list.tsx apps/web/src/features/reports/ReportsTemplate.tsx
git commit -m "feat(reports): UI comptes rendus (form upsert + cards + template)"
```

---

### Task 6: Route `/chatter/dashboard`

**Files:**
- Create: `apps/web/src/app/(dash)/chatter/dashboard/page.tsx`
- Create: `apps/web/src/app/(dash)/chatter/dashboard/loading.tsx`

**Interfaces:**
- Consumes: `requireAccess` (slug `'dashboard'`, Task 2), `getReports` (Task 3), `ReportsTemplate` (Task 5), `PageSkeleton`.
- Produces: la page — fin de la chaîne.

- [ ] **Step 1 : `page.tsx`**

```tsx
import { requireAccess } from '@/lib/auth'
import { getReports } from '@/features/reports/services/get-reports'
import { ReportsTemplate } from '@/features/reports/ReportsTemplate'

export default async function DashboardPage() {
  const profile = await requireAccess('dashboard')
  const data = await getReports()
  return <ReportsTemplate data={data} profile={profile} />
}
```

- [ ] **Step 2 : `loading.tsx`**

```tsx
import { PageSkeleton } from '@/components/page-skeleton'

export default function Loading() {
  return <PageSkeleton />
}
```

- [ ] **Step 3 : Vérifier en dev**

Run : `pnpm --filter @glagency/web dev` puis ouvrir `http://localhost:3000/chatter/dashboard`
Attendu : connecté en admin → la page s'affiche (form + « Aucun compte rendu… »),
l'item « Dashboard » est dans la sidebar au-dessus de Membres. Écrire un compte
rendu test → la card apparaît sous le form.

- [ ] **Step 4 : Checkpoint commit**

Proposer à Benoit :
```bash
git add "apps/web/src/app/(dash)/chatter/dashboard/page.tsx" "apps/web/src/app/(dash)/chatter/dashboard/loading.tsx"
git commit -m "feat(reports): route /chatter/dashboard"
```

---

### Task 7: Vérification multi-rôles (checklist manuelle)

**Files:** aucun — vérification pure (spec §7).

**Interfaces:**
- Consumes: tout ce qui précède, migration appliquée (Task 1), un compte de chaque rôle.

- [ ] **Step 1 : Build complet**

Run : `pnpm --filter @glagency/web build`
Attendu : succès (le build Next vérifie types + lint + génération des routes).

- [ ] **Step 2 : Superadmin**

Se connecter avec le compte superadmin → `/chatter/dashboard` :
- item sidebar visible, PAS de formulaire de saisie ;
- les comptes rendus de TOUT le monde s'affichent, groupés par jour, nom d'auteur visible ;
- aucun bouton supprimer sur les cards des autres.

- [ ] **Step 3 : Admin**

Se connecter en admin (si aucun compte admin n'existe — l'app n'en crée pas — tester
avec un 2ᵉ superadmin ou sauter vers manager) :
- form visible, écrire le compte rendu du jour → card apparaît ;
- re-soumettre le MÊME jour avec un autre texte → la card est MISE À JOUR (pas de doublon) ;
- il ne voit QUE les siens (pas ceux écrits par le superadmin de test ou d'autres) ;
- supprimer sa card → `ConfirmDialog` s'ouvre, la card disparaît après confirmation.

- [ ] **Step 4 : Manager avec la page cochée**

Dans `/chatter/members`, éditer un membre manager → cocher « Dashboard » → enregistrer.
Se connecter avec ce compte :
- item sidebar visible, form OK, il ne voit que les siens ;
- le sélecteur de date refuse le futur et les dates < 30 j (attributs min/max) ;
- rattrapage : choisir hier, écrire, enregistrer → card sous « hier ».

- [ ] **Step 5 : User SANS la page**

Se connecter avec un chatteur sans le slug `dashboard` :
- pas d'item sidebar ; URL directe `/chatter/dashboard` → redirigé (première page
  autorisée ou `/no-access`), comportement de `requireAccess`.

- [ ] **Step 6 : Test RLS négatif (hors app)**

Avec le JWT d'un user SANS la page (DevTools → Application → cookies/localStorage,
token `sb-…-auth-token`) :

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/daily_reports" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"profile_id":"<son-propre-uuid>","day":"2026-07-16","content":"bypass?"}'
```
Attendu : erreur `42501` (new row violates row-level security) — l'UI n'est
qu'optimiste, la RLS est l'enforcement réel.

- [ ] **Step 7 : STOP final**

Récapituler à Benoit : état des vérifications, liste des commits proposés non faits.
**Rappel bloquant avant tout push : la migration 0047 doit être appliquée en PROD
avant que le code n'atterrisse sur `main`** (deploy Vercel auto au push).

---

## Hors périmètre (rappel spec)

Résumé IA (Route Handler + stockage), cron Vercel, lecture manager→admin : rien
dans ce plan ne les bloque ; ne PAS les commencer sans demande explicite.
