# Rapport du soir (Police) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au CRM une feature « Rapport du soir » dans la section Police : un rapport structuré par modèle et par soir, dont le cœur est le suivi individuel de chaque chatteur.

**Architecture:** Deux tables liées (`police_reports` en-tête par (auteur, modèle, jour) + `police_report_lines` une par chatteur), sur le modèle `plannings` / `planning_blocks`. Accès partagé avec le Tracker (page `police`), garde applicative miroir de la RLS reprise du tracker (`requirePoliceProfile` + scope `profile_creators`). Feature web standard (Server Component + feuille client), nouvelle route `/chatter/rapport-police` dans la catégorie sidebar « Police ».

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, shadcn/ui, react-hook-form + Zod v4, Supabase (Postgres + RLS), sonner.

**Spec de référence :** `docs/superpowers/specs/2026-07-21-rapport-police-design.md`

## Global Constraints

- **Migrations** : numéro suivant contigu = `0071`. Convention `text` + `check`, **jamais** `create type … enum`. Toute fonction `security definer` : `set search_path = public` + `revoke all … from public` avant `grant`. Application via `cd packages/db && supabase db push --db-url "$URL"` — **jamais** `psql -f`. Extraire l'URL : `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`. **Cible = UAT uniquement** ; la prod est une étape validée par l'humain.
- **Wrapping initPlan** (`0057`) : dans les policies, wrapper en `(select fn())` les appels **sans argument de ligne** (`is_admin()`, `is_police()`, `can_write_page('police')`, `has_page('police')`, `auth.uid()`) ; laisser **nu** un appel dépendant d'une colonne de ligne. Ici tous les appels sont à argument constant → **tous wrappés**.
- **FK indexées** (`0055`) : toute clé étrangère a son index.
- **Architecture web** : `app → feature(template) → composants`. Aucun fetch dans une feature. Mutations en Server Actions via `runAction`. Pas de `use cache` sur une lecture RLS (cookie-bound). Un `Select` Radix dans RHF passe par `Controller`, jamais `register`.
- **Garde des Server Actions** (guidelines §4 corrigées) : vérification métier **une fois**, en tête de handler ; un refus lève une `BusinessError` (renvoyée telle quelle à l'écran). Le repo a un patron `guard` + re-check hérité — le tracker police l'utilise encore ; **ce plan suit le patron corrigé** (garde en tête de handler).
- **Accès** : le Rapport partage le slug `police` du Tracker (pas de nouveau slug, rien à ajouter à `PAGE_SLUGS`).
- **Pas de commit automatique** : chaque « Commit » est proposé à Benoit.
- **Vérification web** = `pnpm --filter @glagency/web typecheck && lint && build` (aucun test unitaire web dans le repo). Les 4 warnings ESLint pré-existants (`data-table.tsx` ×2, `ComptaTemplate.tsx`, `TeamsTemplate.tsx`) restent.
- **Langue** : copie visible en français ; commentaires en français.
- **Vocabulaire figé** : table `police_reports` (en-tête) + `police_report_lines` (lignes) ; colonnes `author_id`, `creator_id`, `day`, `ca`, `non_traitees`, `absents`, `alerte` ; ligne `report_id`, `chatter_id`, `observation`. Route `/chatter/rapport-police`, slug `police`.

**Références à lire (code réel du repo) :**
- Tracker (modèle de droits/garde/scope) : `apps/web/src/features/police/actions.ts`, `services/get-police.ts`, `apps/web/src/lib/scope.ts`, `apps/web/src/lib/actions.ts` (`runAction`, `BusinessError`), `apps/web/src/lib/auth/index.ts` (`hasWriteAccess`, `Profile`).
- Deux tables liées : `packages/db/supabase/migrations/0036_chatter_plannings.sql`, `apps/web/src/features/planning/{actions,schema,types}.ts`.
- Gabarit de saisie : `apps/web/src/features/reports/**`.
- Liaisons : `chatter_creators (chatter_id, creator_id)`, `profile_creators (profile_id, creator_id)`, tables `creators (id, name)` / `chatters (id, display_name)` (migration `0001_schema.sql`).
- RLS existante : `police_entries` policies (`0022` + `0070`), `is_police()` (`0070`), `can_write_page` (`0060`).
- Nav slug partagé : `apps/web/src/config/workspaces.ts` (items spenders partagent `slug: 'crm-spenders'` ; item tracker `group: 'police'`).

---

### Task 1: Migration `0071_police_reports.sql` (2 tables, RLS, index)

**Files:**
- Create: `packages/db/supabase/migrations/0071_police_reports.sql`
- Create (temporaire, non commité): `/tmp/police_reports_test.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Consumes: `is_admin()` / `is_police()` (`0070`/`0041`), `can_write_page('police')` (`0060`), `has_page()`, tables `creators`, `chatters`, `profiles`.
- Produces: tables `public.police_reports` (`id, author_id, creator_id, day, ca, non_traitees, absents, alerte, created_at, updated_at`) et `public.police_report_lines` (`id, report_id, chatter_id, observation`) ; leurs policies RLS.

- [ ] **Step 1: Écrire le test SQL qui échoue**

Créer `/tmp/police_reports_test.sql`. Impersonne de vrais rôles via `request.jwt.claims`, vérifie la matrice. Il doit échouer maintenant (tables absentes).

```sql
\set ON_ERROR_STOP on

-- Matrice : qui peut écrire un rapport (author_id = self), qui peut lire.
do $$
declare
  v_police uuid; v_manager uuid; v_admin uuid; v_chatteur uuid;
  v_creator uuid; v_ok boolean;
begin
  select id into v_police   from profiles where role = 'police' limit 1;
  select id into v_manager  from profiles where role = 'manager' limit 1;
  select id into v_admin    from profiles where role = 'admin' limit 1;
  select id into v_chatteur from profiles where role = 'chatteur' limit 1;
  select id into v_creator  from creators limit 1;

  if v_police is null then raise notice 'PAS DE POLICE EN BASE — test partiel'; end if;

  -- Écriture sous le rôle applicatif (RLS active) : un police AVEC la page écrit son rapport.
  perform set_config('request.jwt.claims', json_build_object('sub', v_police)::text, true);
  -- (has_page dépend de profiles.pages ; ce test suppose le police provisionné avec 'police')
  set local role authenticated;
  begin
    insert into police_reports (author_id, creator_id, day) values (v_police, v_creator, current_date);
    raise notice 'OK police écrit son rapport';
  exception when others then raise exception 'FAIL: police avec page devrait écrire (%%)', sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  raise notice 'TESTS police_reports OK';
end $$;
```

*(Le test complet — police sans page refusé, chatteur refusé, lignes héritées — sera étoffé à l'étape 5 une fois les tables créées ; ce squelette suffit à prouver l'échec avant migration.)*

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -f /tmp/police_reports_test.sql
```
Attendu : `ERROR: relation "police_reports" does not exist`.

- [ ] **Step 3: Écrire la migration**

Créer `packages/db/supabase/migrations/0071_police_reports.sql` :

```sql
-- 0071 — Rapport du soir (section Police). En-tête par (auteur, modèle, jour) + une ligne
-- d'observation par chatteur suivi. Partage la page `police` du Tracker (accès + écriture),
-- l'auteur peut être un police, un manager avec la page, ou un admin (author_id générique).
-- Le cloisonnement par modèle (on n'agit que sur ses modèles assignés) est fait CÔTÉ APP
-- (profile_creators / lib/scope), comme le tracker police_entries — pas en RLS.
create table public.police_reports (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  creator_id   uuid not null references public.creators(id) on delete cascade,
  day          date not null,
  ca           integer not null default 0 check (ca >= 0),
  non_traitees integer not null default 0 check (non_traitees >= 0),
  absents      integer not null default 0 check (absents >= 0),
  alerte       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (author_id, creator_id, day)
);

create table public.police_report_lines (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.police_reports(id) on delete cascade,
  chatter_id  uuid not null references public.chatters(id) on delete cascade,
  observation text,
  unique (report_id, chatter_id)
);

alter table public.police_reports enable row level security;
alter table public.police_report_lines enable row level security;

-- Lecture : qui a la page « Police » voit tous les rapports (managers compris) ; admin/superadmin
-- tout, même sans la page cochée. Appels wrappés (select …) — pas d'argument de ligne (0057).
create policy police_reports_read on public.police_reports for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('police')));

-- Écriture : on ne rédige/modifie/supprime que SON rapport (author_id = auth.uid()), et il faut
-- le droit d'écriture de la page — même prédicat que le tracker (0070) : can_write_page couvre
-- admin + manager-avec-page ; is_police + has_page couvre le rôle fonctionnel.
create policy police_reports_write on public.police_reports for all to authenticated
  using (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  )
  with check (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  );

-- Lignes : héritent de l'en-tête (comme planning_blocks hérite de plannings, 0036).
create policy police_report_lines_read on public.police_report_lines for select to authenticated
  using (exists (select 1 from public.police_reports r where r.id = report_id));

create policy police_report_lines_write on public.police_report_lines for all to authenticated
  using (exists (
    select 1 from public.police_reports r
    where r.id = report_id and r.author_id = (select auth.uid())
      and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  ))
  with check (exists (
    select 1 from public.police_reports r
    where r.id = report_id and r.author_id = (select auth.uid())
      and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  ));

-- FK indexées (0055) — sauf celles déjà couvertes par une contrainte unique en tête.
create index police_reports_creator_day_idx on public.police_reports (creator_id, day);
create index police_report_lines_report_idx on public.police_report_lines (report_id);
create index police_report_lines_chatter_idx on public.police_report_lines (chatter_id);
-- `author_id` : couvert par l'unique (author_id, creator_id, day) en colonne de tête.
-- `report_id` de lines : couvert par l'index ci-dessus ; l'unique (report_id, chatter_id) le couvre aussi.
```

- [ ] **Step 4: Appliquer sur l'UAT**

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
cd packages/db && supabase db push --db-url "$UAT" --dry-run   # doit lister 0071
cd packages/db && supabase db push --db-url "$UAT"
```
Attendu : `Finished supabase db push.`

- [ ] **Step 5: Étoffer le test et le lancer jusqu'au vert**

Compléter `/tmp/police_reports_test.sql` avec, en transactions `begin`/`rollback` sous `role authenticated` :
- un police **sans** la page `police` → INSERT refusé (RLS) ;
- un chatteur → INSERT refusé ;
- une ligne rattachée à un rapport d'un autre auteur → refusée ;
- lecture : un manager **avec** la page lit les rapports, un chatteur ne lit rien.

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
psql "$UAT" -f /tmp/police_reports_test.sql
```
Attendu : `TESTS police_reports OK`, aucun `ERROR` non capturé. Corriger la migration + rejouer (`supabase migration repair --status reverted 0071` + `db push`) si un cas échoue.

- [ ] **Step 6: Advisor + types**

Interroger l'advisor sécurité UAT (MCP Supabase, si accessible) : aucune alerte `unindexed_foreign_keys` / `rls_disabled_in_public` / `auth_rls_initplan` sur les 2 tables. Sinon, contrôle manuel (`pg_indexes`, `pg_policies`).

```bash
UAT=$(grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
supabase gen types typescript --db-url "$UAT" > packages/db/src/types.ts
git diff --stat packages/db/src/types.ts   # additif : +police_reports, +police_report_lines
```

- [ ] **Step 7: Commit (demander l'accord de Benoit)**

```bash
git add packages/db/supabase/migrations/0071_police_reports.sql packages/db/src/types.ts
git commit -m "feat(db): rapport du soir police — police_reports + police_report_lines [0071]"
```

---

### Task 2: Couche domaine (types, schéma, service, actions)

**Files:**
- Create: `apps/web/src/features/police-reports/types.ts`
- Create: `apps/web/src/features/police-reports/schema.ts`
- Create: `apps/web/src/features/police-reports/services/get-police-reports.ts`
- Create: `apps/web/src/features/police-reports/actions.ts`

**Interfaces:**
- Consumes: `runAction` / `BusinessError` / `ActionResult` (`@/lib/actions`), `getProfile` / `hasWriteAccess` / `Profile` (`@/lib/auth`), `createClient` (`@/lib/supabase/server`).
- Produces:
  - `PoliceReport` = `{ id, creatorId, creatorName, day, ca, nonTraitees, absents, alerte, lines }` ; `PoliceReportLine` = `{ id, chatterId, chatterName, observation }`.
  - `ReportOption` = `{ id: string; name: string }` (option de sélecteur — modèle ou chatteur).
  - `assignedCreatorIds(profile): Promise<Set<string> | null>` (périmètre modèles, null = admin).
  - `getPoliceReports(profile, { creatorId?, chatterId? }): Promise<PoliceReport[]>` (lecture, cloisonnée + filtrable).
  - `getReportOptions(profile): Promise<{ models: ReportOption[] }>` (modèles assignés).
  - `getModelChatters(profile, creatorId): Promise<ReportOption[]>` (chatteurs d'un modèle, scopés).
  - `upsertPoliceReport(input): Promise<ActionResult>`, `deletePoliceReport(input): Promise<ActionResult>`.
  - `reportInput` (Zod), `deleteReportInput`.

- [ ] **Step 1: Écrire `types.ts`**

```ts
/** Rapport du soir police (spec 2026-07-21) : en-tête modèle + lignes chatteur. */
export interface PoliceReportLine {
  id: string
  chatterId: string
  chatterName: string
  observation: string | null
}

export interface PoliceReport {
  id: string
  creatorId: string
  creatorName: string
  day: string
  ca: number
  nonTraitees: number
  absents: number
  alerte: string | null
  authorName: string | null
  lines: PoliceReportLine[]
}

/** Option de sélecteur (modèle ou chatteur). */
export interface ReportOption {
  id: string
  name: string
}
```

- [ ] **Step 2: Écrire `schema.ts`**

```ts
import { z } from 'zod'

// Schéma PARTAGÉ client (RHF) ↔ serveur (runAction). L'en-tête + les lignes chatteur en une
// seule soumission (upsert atomique de la fiche du soir).
const optionalText = (max: number, msg: string) =>
  z.string().trim().max(max, msg).transform((v) => (v === '' ? null : v)).nullable()

const count = z.coerce.number().int().min(0, 'Doit être ≥ 0').default(0)

export const reportInput = z.object({
  creatorId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  ca: count,
  nonTraitees: count,
  absents: count,
  alerte: optionalText(2000, 'Alerte trop longue'),
  lines: z
    .array(z.object({ chatterId: z.uuid(), observation: optionalText(2000, 'Note trop longue') }))
    .max(100, 'Trop de chatteurs'),
})
export type ReportInput = z.infer<typeof reportInput>

export const deleteReportInput = z.object({ id: z.uuid() })
```

- [ ] **Step 3: Écrire `services/get-police-reports.ts`**

Lecture via client RLS (les faits), noms résolus via `createAdminClient`, **cloisonnement par
modèle côté app**. **Point crucial** : le périmètre modèles vient de `profile_creators` (les
modèles assignés), PAS de `getChatterScope.creatorIds` — ce dernier est dérivé de
`chatter_creators` (modèles ayant au moins un chatteur actif), donc un modèle fraîchement
assigné sans chatteur n'y serait pas. On requête `profile_creators` directement, source
**identique** à `getReportOptions` (RLS `creators_scoped_read` = `profile_creators`). Lecture et
écriture partagent ce même périmètre.

```ts
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/auth'
import type { PoliceReport, ReportOption } from '../types'

/**
 * Périmètre MODÈLES de l'appelant : `null` pour un admin (tout), sinon l'ensemble des
 * `creator_id` de `profile_creators`. Source unique du cloisonnement (lecture + écriture +
 * options), alignée sur la RLS `creators_scoped_read` (0057). NE PAS utiliser
 * `getChatterScope.creatorIds` (dérivé de `chatter_creators`, écarte les modèles sans chatteur).
 */
export async function assignedCreatorIds(profile: Profile): Promise<Set<string> | null> {
  if (profile.role === 'admin') return null // couvre admin + superadmin (mappés 'admin')
  const supabase = await createClient()
  const { data, error } = await supabase.from('profile_creators').select('creator_id').eq('profile_id', profile.id)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.creator_id))
}

/**
 * Rapports lisibles par l'appelant, cloisonnés à SES modèles (admin = tout), filtrables par
 * modèle ou par chatteur — la vue par chatteur donne la valeur (évolution soir après soir).
 * RLS `police_reports_read` (has_page) large ; le cloisonnement modèle est fait ici, comme le
 * Tracker filtre par `chatterIds`. Volume modéré → select nu.
 */
export async function getPoliceReports(
  profile: Profile,
  filter: { creatorId?: string; chatterId?: string },
): Promise<PoliceReport[]> {
  const supabase = await createClient()
  const admin = createAdminClient()
  let q = supabase
    .from('police_reports')
    .select(
      'id, creator_id, day, ca, non_traitees, absents, alerte, author_id, ' +
        'lines:police_report_lines(id, chatter_id, observation)',
    )
    .order('day', { ascending: false })
  if (filter.creatorId) q = q.eq('creator_id', filter.creatorId)

  const [scope, reportsRes, creatorsRes, chattersRes, profilesRes] = await Promise.all([
    assignedCreatorIds(profile),
    q,
    admin.from('creators').select('id, name'),
    admin.from('chatters').select('id, display_name'),
    admin.from('profiles').select('id, display_name'),
  ])
  if (reportsRes.error) throw new Error(reportsRes.error.message)

  const creatorName: Record<string, string> = {}
  for (const c of creatorsRes.data ?? []) if (c.id && c.name) creatorName[c.id] = c.name
  const chatterName: Record<string, string> = {}
  for (const c of chattersRes.data ?? []) if (c.id && c.display_name) chatterName[c.id] = c.display_name
  const authorName: Record<string, string> = {}
  for (const p of profilesRes.data ?? []) if (p.id && p.display_name) authorName[p.id] = p.display_name

  const inScope = (id: string) => scope === null || scope.has(id)
  return (reportsRes.data ?? [])
    .filter((r) => inScope(r.creator_id))
    .map((r) => ({
      id: r.id,
      creatorId: r.creator_id,
      creatorName: creatorName[r.creator_id] ?? '?',
      day: r.day,
      ca: r.ca,
      nonTraitees: r.non_traitees,
      absents: r.absents,
      alerte: r.alerte,
      authorName: r.author_id ? (authorName[r.author_id] ?? null) : null,
      lines: (r.lines ?? []).map((l) => ({
        id: l.id,
        chatterId: l.chatter_id,
        chatterName: chatterName[l.chatter_id] ?? '?',
        observation: l.observation,
      })),
    }))
    .filter((rep) => !filter.chatterId || rep.lines.some((l) => l.chatterId === filter.chatterId))
}

/** Modèles assignés à l'appelant (RLS `creators_scoped_read` = profile_creators). */
export async function getReportOptions(profile: Profile): Promise<{ models: ReportOption[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('creators').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return { models: (data ?? []).map((c) => ({ id: c.id, name: c.name })) }
}

/** Chatteurs d'un modèle donné (via chatter_creators), scopés par la RLS. */
export async function getModelChatters(profile: Profile, creatorId: string): Promise<ReportOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chatter_creators')
    .select('chatter:chatters(id, display_name)')
    .eq('creator_id', creatorId)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((r) => (Array.isArray(r.chatter) ? r.chatter[0] : r.chatter))
    .filter((c): c is { id: string; display_name: string } => !!c)
    .map((c) => ({ id: c.id, name: c.display_name }))
}
```

⚠️ Vérifier à l'implémentation le nom exact de la relation d'embed PostgREST une fois `0071`
appliquée (`lines:police_report_lines` via la FK `report_id` → tableau ; `chatter:chatters` via
`chatter_id`).

- [ ] **Step 4: Écrire `actions.ts`**

Suit le **patron corrigé** (garde en tête de handler, `BusinessError`). Deux Server Actions :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasWriteAccess, type Profile } from '@/lib/auth'
import { runAction, BusinessError, type ActionResult } from '@/lib/actions'
import { reportInput, deleteReportInput } from './schema'
import { assignedCreatorIds } from './services/get-police-reports'

const noGuard = async () => ({ ok: true } as const)

/** Miroir de la RLS d'écriture : page police + (droit d'écriture OU rôle police fonctionnel). */
async function requireReporter(): Promise<Profile | null> {
  const profile = await getProfile()
  if (!profile) return null
  const isFunctionalPolice = profile.baseRole === 'police' && profile.pages.includes('police')
  return hasWriteAccess(profile, 'police') || isFunctionalPolice ? profile : null
}

/** Le modèle doit être dans le périmètre de l'auteur (admin = tout). MÊME source que la
 *  lecture et les options (profile_creators) — cf. assignedCreatorIds. */
async function creatorInScope(profile: Profile, creatorId: string): Promise<boolean> {
  const scope = await assignedCreatorIds(profile)
  return scope === null || scope.has(creatorId)
}

/** Crée ou met à jour la fiche du soir (upsert sur (author_id, creator_id, day)) + ses lignes. */
export async function upsertPoliceReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: reportInput,
    input: raw,
    guard: noGuard,
    handler: async (values) => {
      const profile = await requireReporter()
      if (!profile) throw new BusinessError('Accès refusé')
      if (!(await creatorInScope(profile, values.creatorId)))
        throw new BusinessError('Modèle hors de ton périmètre')
      const supabase = await createClient()
      // 1) upsert de l'en-tête (author = self).
      const { data: header, error: hErr } = await supabase
        .from('police_reports')
        .upsert(
          {
            author_id: profile.id,
            creator_id: values.creatorId,
            day: values.day,
            ca: values.ca,
            non_traitees: values.nonTraitees,
            absents: values.absents,
            alerte: values.alerte,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'author_id,creator_id,day' },
        )
        .select('id')
        .single()
      if (hErr || !header) throw new Error(hErr?.message ?? 'Échec de l’enregistrement')
      // 2) remplacer les lignes : delete puis insert (fiche du soir, volume faible).
      const { error: dErr } = await supabase.from('police_report_lines').delete().eq('report_id', header.id)
      if (dErr) throw new Error(dErr.message)
      if (values.lines.length) {
        const { error: iErr } = await supabase.from('police_report_lines').insert(
          values.lines.map((l) => ({ report_id: header.id, chatter_id: l.chatterId, observation: l.observation })),
        )
        if (iErr) throw new Error(iErr.message)
      }
      revalidatePath('/chatter/rapport-police')
    },
  })
}

export async function deletePoliceReport(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteReportInput,
    input: raw,
    guard: noGuard,
    handler: async ({ id }) => {
      const profile = await requireReporter()
      if (!profile) throw new BusinessError('Accès refusé')
      const supabase = await createClient()
      // .eq('author_id') : on ne supprime que le sien (la RLS le garantit déjà).
      const { data, error } = await supabase
        .from('police_reports')
        .delete()
        .eq('id', id)
        .eq('author_id', profile.id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new BusinessError('Ce rapport n’existe plus ou n’est pas le tien')
      revalidatePath('/chatter/rapport-police')
    },
  })
}
```

- [ ] **Step 5: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```
Attendu : verts (le service `getPoliceReports` doit être complété, pas laissé à `return []` — sinon la consultation de la tâche 5 sera vide).

- [ ] **Step 6: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/police-reports
git commit -m "feat(rapport-police): types, schéma, service et Server Actions"
```

---

### Task 3: Navigation — item « Rapport » dans la catégorie Police

**Files:**
- Modify: `apps/web/src/config/workspaces.ts`

**Interfaces:**
- Consumes: le groupe `police` (déjà déclaré), le champ `slug` explicite d'un item nav (comme les items spenders).
- Produces: un item de nav `{ href: '/chatter/rapport-police', label: 'Rapport', icon: ClipboardList, slug: 'police', group: 'police' }`, placé après l'item Tracker.

- [ ] **Step 1: Ajouter l'item**

Dans `config/workspaces.ts`, importer `ClipboardList` de `lucide-react` (l'ajouter à l'import existant). Juste **après** l'item Tracker (`{ href: '/chatter/police', label: 'Tracker', … group: 'police' }`), ajouter :

```ts
{ href: '/chatter/rapport-police', label: 'Rapport', icon: ClipboardList, slug: 'police', group: 'police' },
```

Le `slug: 'police'` explicite fait que l'item **partage le droit** du Tracker (la nav dérive normalement le slug de l'href ; ici on le force sur `police`, comme les items spenders forcent `crm-spenders`). Ne rien ajouter à `PAGE_SLUGS`.

⚠️ **Vérifier `PAGE_CHOICES`** (les cases à cocher du dialog Membres, `config/workspaces.ts`) : il doit **dédupliquer par slug** pour que Tracker + Rapport n'affichent **qu'une seule** case « Police » (comme les 4 items spenders → une case `crm-spenders`). Si `PAGE_CHOICES` liste par item et non par slug, une entrée doublon « Police » apparaîtrait — dans ce cas, dédupliquer par slug (lire le code réel avant d'ajouter l'item).

- [ ] **Step 2: Vérifier**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint
```
Attendu : verts. Vérifier qu'aucune règle ESLint ne casse (l'item suit exactement la forme des voisins).

- [ ] **Step 3: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/config/workspaces.ts
git commit -m "feat(nav): item « Rapport » dans la catégorie Police (slug police partagé)"
```

---

### Task 4: Feature web — page + formulaire de saisie

**Files:**
- Create: `apps/web/src/features/police-reports/PoliceReportsTemplate.tsx`
- Create: `apps/web/src/features/police-reports/components/report-form.tsx`
- Create: `apps/web/src/features/police-reports/components/report-lines-editor.tsx`
- Create: `apps/web/src/app/(dash)/chatter/rapport-police/page.tsx`
- Create: `apps/web/src/app/(dash)/chatter/rapport-police/loading.tsx`
- Create: `apps/web/src/features/police-reports/components/reports-skeleton.tsx`

**Interfaces:**
- Consumes: `getPoliceReports` / `getReportOptions` / `getModelChatters` (tâche 2), `upsertPoliceReport` (tâche 2), `requireAccess` (`@/lib/auth`), `Combobox` (`@/components/ui/combobox`).
- Produces: la route `/chatter/rapport-police` rendue (Server Component → template → feuille client).

- [ ] **Step 1: `page.tsx`**

```tsx
import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { getReportOptions, getPoliceReports } from '@/features/police-reports/services/get-police-reports'
import { PoliceReportsTemplate } from '@/features/police-reports/PoliceReportsTemplate'
import { PoliceReportsSkeleton } from '@/features/police-reports/components/reports-skeleton'

/** Rapport du soir police. Accès = page « Police » (même droit que le Tracker). Écriture
 *  réservée par la RLS + la garde (police, manager avec la page, admin). */
export default async function RapportPolicePage() {
  const profile = await requireAccess('police')
  const optionsPromise = getReportOptions(profile)
  const reportsPromise = getPoliceReports(profile, {})
  return (
    <Suspense fallback={<PoliceReportsSkeleton />}>
      <Content optionsPromise={optionsPromise} reportsPromise={reportsPromise} />
    </Suspense>
  )
}

async function Content({ optionsPromise, reportsPromise }: {
  optionsPromise: ReturnType<typeof getReportOptions>
  reportsPromise: ReturnType<typeof getPoliceReports>
}) {
  const [options, reports] = await Promise.all([optionsPromise, reportsPromise])
  return <PoliceReportsTemplate models={options.models} reports={reports} />
}
```

⚠️ `requireAccess('police')` autorise **la lecture** (qui a la page). L'écriture est bornée par la garde des actions + RLS — un lecteur sans droit d'écriture verra le formulaire mais l'action refusera (message propre). Décider à l'implémentation si on masque le formulaire pour les non-écrivains (cf. `hasWriteAccess(profile, 'police')`), comme le tracker masque ses contrôles.

- [ ] **Step 2: `PoliceReportsTemplate.tsx`** (Server Component, zéro fetch)

Passe `models` + `reports` en props à une feuille client `report-form.tsx` (saisie) et à la consultation (tâche 5). Reprendre la structure de `features/reports/ReportsTemplate.tsx`.

- [ ] **Step 3: `report-lines-editor.tsx`** (feuille client)

Éditeur des lignes chatteur : un `useFieldArray` RHF sur `lines`, chaque ligne = un `Combobox` (chatteur du modèle sélectionné, options passées en prop) + un champ note. Bouton « + Ajouter un chatteur ». Les chatteurs proposés dépendent du modèle choisi dans le formulaire parent (charger via `getModelChatters` — soit en Server Action de lecture, soit pré-chargé par modèle). Décider le mode de chargement à l'implémentation (le plus simple : le parent recharge les chatteurs quand le modèle change, via un appel serveur).

- [ ] **Step 4: `report-form.tsx`** (feuille client)

`useForm` + `zodResolver(reportInput)`. Champs : `Combobox` modèle (obligatoire), date (défaut aujourd'hui), 3 champs numériques (CA, non traitées, absents), textarea alerte, puis `<ReportLinesEditor />`. Soumission → `upsertPoliceReport(values)`, toast succès/erreur, `fieldErrors` mappés champ par champ. Réinitialisation à l'ouverture. **Un `Select`/`Combobox` dans RHF passe par `Controller`.**

- [ ] **Step 5: `loading.tsx`** — silhouette neutre `role="status"` + `sr-only` (convention repo).

- [ ] **Step 6: Vérifier + rendu manuel**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
Puis, en `pnpm dev` connecté sur la préprod (compte avec la page « Police » + des modèles assignés) :
1. `/chatter/rapport-police` s'affiche, l'item « Rapport » est sous « Tracker » dans la catégorie « Police » ;
2. choisir un modèle → les chatteurs de ce modèle deviennent sélectionnables ;
3. saisir CA/non traitées/absents + ajouter 2 chatteurs avec une note → enregistrer → toast succès ;
4. ré-ouvrir : la fiche du soir est rechargée (upsert, pas de doublon).

- [ ] **Step 7: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/police-reports "apps/web/src/app/(dash)/chatter/rapport-police"
git commit -m "feat(rapport-police): page + formulaire (modèle, chiffres, lignes chatteur)"
```

---

### Task 5: Consultation — historique filtrable par modèle / par chatteur

**Files:**
- Create: `apps/web/src/features/police-reports/components/report-history.tsx`
- Modify: `apps/web/src/features/police-reports/PoliceReportsTemplate.tsx`
- Modify: `apps/web/src/app/(dash)/chatter/rapport-police/page.tsx` (passer le filtre)

**Interfaces:**
- Consumes: `PoliceReport[]` (tâche 2), `deletePoliceReport` (tâche 2), `ConfirmDialog` (`@/components/confirm-dialog`).
- Produces: `<ReportHistory reports models />` — liste des rapports, filtre par modèle ou par chatteur.

- [ ] **Step 1: `report-history.tsx`**

Liste des rapports (les plus récents en tête), chacun montrant : modèle, date, chiffres, et ses lignes chatteur (nom + note). Un filtre local (`useState`) : **par modèle** (Combobox des modèles) et **par chatteur** (Combobox). Le filtre par chatteur ne garde que les rapports dont une ligne concerne ce chatteur, et met en avant sa note — c'est la vue « suivi d'un chatteur soir après soir ». Suppression d'un rapport via `ConfirmDialog` → `deletePoliceReport`.

Le filtre peut être **local** (sur les rapports déjà chargés) si le volume est faible, ou passer par `searchParams` + rechargement serveur si tu veux un lien partageable. Choisir le local en v1 (plus simple), documenter.

- [ ] **Step 2: Brancher dans le template + la page**

`PoliceReportsTemplate` rend le formulaire **et** `<ReportHistory>`. Passer `reports` + `models`.

- [ ] **Step 3: Vérifier + rendu manuel**

```bash
pnpm --filter @glagency/web typecheck && pnpm --filter @glagency/web lint && pnpm --filter @glagency/web build
```
En préprod : après avoir saisi quelques rapports (tâche 4), l'historique les liste ; filtrer par un chatteur ne montre que ses lignes ; supprimer un rapport le retire (confirmation obligatoire).

- [ ] **Step 4: Commit (demander l'accord de Benoit)**

```bash
git add apps/web/src/features/police-reports "apps/web/src/app/(dash)/chatter/rapport-police"
git commit -m "feat(rapport-police): historique filtrable par modèle et par chatteur"
```

---

### Task 6: Documentation + déploiement

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-21-rapport-police-design.md` (statut)

- [ ] **Step 1: Documenter**

Dans `CLAUDE.md`, après la ligne « To-do personnelle » (ou près de la mention Police), ajouter :

```markdown
- **Rapport du soir police** : page `/chatter/rapport-police`, catégorie « Police » (même droit
  que le Tracker, slug `police`). Rapport structuré par (auteur, modèle, jour) + une ligne
  d'observation par chatteur (`police_reports` / `police_report_lines`, migration `0071`). Cœur
  = suivi par chatteur. Écriture : police/manager avec la page + admin ; lecture : qui a la page
  + admins. Scope modèle côté app (`profile_creators`).
```

Dans la spec, remplacer la ligne de statut par :
```markdown
**Date** : 2026-07-21 · **Statut** : implémenté (plan `docs/superpowers/plans/2026-07-21-rapport-police.md`)
```

- [ ] **Step 2: Migration en PROD**

⚠️ **Accord explicite de Benoit requis** (touche la production).

```bash
PROD=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')
cd packages/db && supabase db push --db-url "$PROD" --dry-run   # doit lister 0071 seul
cd packages/db && supabase db push --db-url "$PROD"
psql "$PROD" -c "select count(*) from police_reports;"          # 0
```

- [ ] **Step 3: Commit final (demander l'accord de Benoit)**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-21-rapport-police-design.md
git commit -m "docs(rapport-police): règle projet + statut de la spec"
```

- [ ] **Step 4: Vérification de bout en bout**

Sur la préprod déployée (après merge sur `develop`), en tant que **police avec la page + modèles** : saisir un rapport complet, le rééditer, filtrer l'historique par chatteur, supprimer. En tant que **manager avec la page** : peut aussi rédiger. En tant que **chatteur** : `/chatter/rapport-police` inaccessible (pas la page). En tant qu'**admin** : voit tous les rapports.

---

## Notes d'exécution

- **Ordre imposé** : 1 → 2 → 3 → 4 → 5 → 6. Les tâches 4-5 partagent des fichiers (template, page).
- **Point de vigilance périmètre** : le rapport se cloisonne par **`profile_creators`** (via le helper `assignedCreatorIds`), PAS par `getChatterScope.creatorIds` (dérivé de `chatter_creators`, qui écarte un modèle assigné mais sans chatteur). Lecture, écriture et options partagent cette même source — sinon un modèle proposé dans le formulaire serait refusé à l'enregistrement.
- **Point de vigilance** : la résolution des noms dans `getPoliceReports` (stub `return []` dans le plan) doit être complétée sur le patron de `get-police.ts`, sinon la consultation est vide.
- **Migration prod** : uniquement à l'étape 6.2, avec accord explicite, avant le déploiement du code.
