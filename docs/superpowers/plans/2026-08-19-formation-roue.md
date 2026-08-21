# Formation — incrément 3 : Roue des récompenses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter la « Roue de la chance » de GLA sur le CRM : ticket hebdomadaire (top 3 du classement de la semaine), tirage pondéré côté serveur (roue Cadeau/Raté → coffre), config admin, gains enregistrés (€, semaine, à payer plus tard), page « Roue » dans la face Formation, sélecteur de classement hebdo dans Ma formation.

**Architecture:** Branche `feature/formation-catalogue` (on continue). Migration **0122** (UAT seulement) : `training_wheel_config` (1 ligne), `training_wheel_tickets`, `training_wheel_spins`, RPC `training_weekly_ranking(p_week)` + `training_wheel_pending(p_profile)`, trigger → `member_events` (`recompense`). RLS lecture (moi / encadrant `frm-suivi` / admin), **écritures service-role** depuis les Server Actions (comme 0121). Règles pures dans `@glagency/core` (`pickWeighted`, semaine passée, défauts GLA en €). Feature `training-wheel` : page `/formation/roue` adaptée au rôle, RSC + une feuille client pour la roue (SVG + CSS, **aucune lib**), dialog config admin (RHF + Zod). Sidebar : item « Roue » + pastille streamée (patron du badge Insights). Ma formation : sélecteur `?classement=semaine|semaine-derniere|global`.

**Tech Stack:** Next.js 16 (RSC, Server Actions, `typedRoutes`, React Compiler → `'use no memo'` sur RHF), Supabase (`@supabase/ssr`, RLS, RPC definer), Zod v4, RHF, shadcn/ui, sonner, Vitest, `crypto.randomInt` (Node) pour le tirage.

**Spec:** `docs/superpowers/specs/2026-08-19-formation-roue-design.md`

## Global Constraints

- Migration `packages/db/supabase/migrations/0122_training_wheel.sql` (séquence après 0121). `text + check` (jamais d'enum), RLS `(select …)`, FK indexées, fonctions definer `set search_path = public, pg_temp` + `revoke … from public, anon` / `grant … to authenticated`. Appliquer avec `cd packages/db && supabase db push --db-url "$DB"` (dry-run avant/après), **UAT uniquement** (`DATABASE_URL_UAT`, extraction `grep '^DATABASE_URL_UAT=' .env | cut -d= -f2- | sed 's/^"//; s/"$//'`, jamais `source .env`, jamais `link`, jamais `psql -f`, jamais afficher l'URL). Régénérer `packages/db/src/types.ts` après la migration.
- Web : `docs/guidelines-standard-feature.md` — page = garde + kickoff sans await + `<Suspense>` + `loading.tsx` ; Template RSC sans fetch ; services throw ; actions `runAction` + `noGuard` + garde en tête de handler (`requirePageProfile('frm-entrainement')` / `requireAdminProfile()`) + refus d'impersonation (`readStateCookie()` → `BusinessError('Action indisponible en consultation (mode « en tant que »)')`), `BusinessError` pour tout message FR, `revalidatePath` ; RHF + Zod + `'use no memo'` ; `ActionButton` ; toasts `sonner`. Frontières ESLint `lib → features → app`, cross-feature interdit (partagé = `lib/` ou `components/`), fichiers < 300 lignes.
- Écritures `training_wheel_*` = `createAdminClient()` après vérification (droit + propriété) — aucune policy d'écriture `authenticated` sauf config admin (lecture `has_page('formation')`, écriture `is_admin()`).
- Tirage décidé serveur (`crypto.randomInt`), client = animation. Semaine = lundi Europe/Paris (`mondayOf`, `todayParis` de core). Top 3, points > 0, un ticket non utilisé max, une attribution par (profil, semaine). Un Raté consomme le ticket.
- Montants en **euros** (`amount_eur numeric(8,2)`), nullable pour les lots non monétaires. Défaut GLA en € : roue `Cadeau 80 / Raté 20` ; coffre `5 € (60, 5) · 10 € (20, 10) · Day off supplémentaire (5, null) · 20 € (5, 20) · Donner 5 € à un membre de ton équipe (10, 5)`.
- Front : RSC au maximum, feuilles client au plus bas ; roue = SVG + CSS natifs (`transition: transform 4.8s cubic-bezier(.15,.75,.2,1)`), aucune lib d'animation ; roue colorée (exception assumée), reste sobre (DA CRM, zéro filet décoratif). Copie FR.
- Vérifs avant chaque commit : `pnpm --filter @glagency/web lint && typecheck && test`, `pnpm --filter @glagency/core test`, `pnpm --filter @glagency/db typecheck`. Commits autorisés par Benoit pour l'incrément (1 par task, pas de push/merge).

**Écarts / décisions tranchées dans ce plan :**
1. Attribution paresseuse (pas de cron) : la page Roue affiche l'éligibilité ; le client appelle `claimTicket()` au montage ; le serveur revérifie via la RPC hebdo.
2. La pastille sidebar lit une RPC `training_wheel_pending` (lecture seule, streamée) — elle peut valoir 1 avant que le ticket n'existe (éligibilité non réclamée) ; le ticket est créé à l'ouverture de la page.
3. `training_weekly_ranking` est un **classement de la semaine** (Σ par cas du meilleur total obtenu dans la semaine, hors boss) — distinct du classement cumulé `training_ranking`.
4. Historique encadrant borné aux 200 dernières lignes (`limit`), pas de pagination en v1.

---

## Carte des fichiers

```
packages/db/supabase/migrations/0122_training_wheel.sql                          (T1)
packages/db/src/types.ts                                                          (T1 régénéré)
packages/core/src/training/wheel.ts (+ wheel.test.ts), src/domain/member-events.ts (+ test), src/index.ts   (T2)
apps/web/src/features/training-wheel/{types,schema,schema.test,actions}.ts, services/{get-wheel,get-wheel-history}.ts   (T3)
apps/web/src/features/training-wheel/WheelTemplate.tsx, components/{wheel-spinner,wheel-svg,wheel-result,my-spins,wheel-history,wheel-config-dialog,wheel-tabs,wheel-skeleton}.tsx   (T4)
apps/web/src/app/(dash)/formation/roue/{page,loading}.tsx                          (T4)
apps/web/src/config/workspaces.ts (item Roue), apps/web/src/lib/services/wheel-pending.ts, apps/web/src/app/(dash)/layout.tsx, apps/web/src/components/app-sidebar.tsx   (T5)
apps/web/src/features/training-me/{types.ts, services/get-me.ts, MeTemplate.tsx, components/me-ranking.tsx, components/me-ranking-select.tsx}, app/(dash)/formation/ma-formation/page.tsx   (T6)
CLAUDE.md, spec (statut)                                                          (T7)
```

---

### Task 1: Migration `0122_training_wheel.sql`

**Files:**
- Create: `packages/db/supabase/migrations/0122_training_wheel.sql`
- Regenerate: `packages/db/src/types.ts`

**Interfaces:**
- Produces: tables `training_wheel_config`, `training_wheel_tickets`, `training_wheel_spins` ; RPC `training_last_week() → date`, `training_weekly_ranking(p_week date)`, `training_wheel_pending(p_profile uuid) → integer` ; kind `recompense` dans `member_events` + trigger `trg_training_wheel_spin_journal`.

- [ ] **Step 1: Écrire la migration**

```sql
-- 0122 — Roue des récompenses (incrément 3 formation) : config (1 ligne), tickets hebdo, tirages.
-- Spec : docs/superpowers/specs/2026-08-19-formation-roue-design.md.
-- Écritures = service-role depuis les Server Actions (comme 0121) ; RLS = lecture (moi / encadrant
-- frm-suivi / admin) ; config lisible par toute la face Formation, modifiable par l'admin.
-- Montants en EUROS ; un lot non monétaire (day off) a amount_eur null.

create table public.training_wheel_config (
  id          smallint primary key default 1 check (id = 1),
  title       text not null default 'Roue de la chance' check (length(title) between 1 and 60),
  -- [{ "label": "Cadeau", "weight": 80, "lose": false }, { "label": "Raté", "weight": 20, "lose": true }]
  sectors     jsonb not null,
  -- [{ "label": "5 €", "weight": 60, "amount_eur": 5 }, …]  (amount_eur null = non monétaire)
  prizes      jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
create index training_wheel_config_updated_by_idx on public.training_wheel_config (updated_by);
insert into public.training_wheel_config (id, sectors, prizes) values (
  1,
  '[{"label":"Cadeau","weight":80,"lose":false},{"label":"Raté","weight":20,"lose":true}]'::jsonb,
  '[{"label":"5 €","weight":60,"amount_eur":5},{"label":"10 €","weight":20,"amount_eur":10},{"label":"Day off supplémentaire","weight":5,"amount_eur":null},{"label":"20 €","weight":5,"amount_eur":20},{"label":"Donner 5 € à un membre de ton équipe","weight":10,"amount_eur":5}]'::jsonb
);

create table public.training_wheel_tickets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  week        date not null,                       -- lundi de la semaine récompensée (classement de cette semaine-là)
  reason      text not null check (length(reason) between 1 and 120),   -- « Top 2 — semaine du 11/08 » / « Offert par … »
  granted_by  uuid references public.profiles(id) on delete set null,   -- null = classement (système)
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  unique (profile_id, week)
);
create index training_wheel_tickets_pending_idx on public.training_wheel_tickets (profile_id) where used_at is null;
create index training_wheel_tickets_granted_by_idx on public.training_wheel_tickets (granted_by);

create table public.training_wheel_spins (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  ticket_id    uuid not null unique references public.training_wheel_tickets(id) on delete cascade,
  week         date not null,
  spun_at      timestamptz not null default now(),
  sector_label text not null,
  won          boolean not null,
  prize_label  text,                                          -- null si Raté
  amount_eur   numeric(8,2) check (amount_eur is null or amount_eur >= 0),
  paid_at      timestamptz,                                   -- compta, plus tard
  paid_by      uuid references public.profiles(id) on delete set null,
  check (won = (prize_label is not null))
);
create index training_wheel_spins_profile_idx on public.training_wheel_spins (profile_id, spun_at desc);
create index training_wheel_spins_week_idx on public.training_wheel_spins (week desc);
create index training_wheel_spins_paid_by_idx on public.training_wheel_spins (paid_by);

alter table public.training_wheel_config enable row level security;
alter table public.training_wheel_tickets enable row level security;
alter table public.training_wheel_spins enable row level security;

create policy training_wheel_config_read on public.training_wheel_config for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_wheel_config_admin_write on public.training_wheel_config for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_wheel_tickets_read on public.training_wheel_tickets for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_wheel_spins_read on public.training_wheel_spins for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
-- Aucune policy d'écriture authenticated sur tickets/spins : service-role depuis les actions.

-- ── Journal du membre : une ligne « recompense » par tirage ────────────────────────────────
alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport','recompense'));

create or replace function public.training_wheel_spin_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_by     uuid;
begin
  select t.reason, t.granted_by into v_reason, v_by from training_wheel_tickets t where t.id = new.ticket_id;
  -- to_value lisible sans jointure : « Roue : 10 € — Top 2 — semaine du 11/08 » / « Roue : Raté — … »
  insert into member_events (profile_id, created_by, kind, to_value)
  values (new.profile_id, v_by, 'recompense',
          'Roue : ' || case when new.won then coalesce(new.prize_label, 'cadeau') else 'Raté' end
          || ' — ' || coalesce(v_reason, ''));
  return new;
end;
$$;
revoke all on function public.training_wheel_spin_journal() from public;
create trigger trg_training_wheel_spin_journal
  after insert on public.training_wheel_spins
  for each row execute function public.training_wheel_spin_journal();

-- ── Semaine passée (lundi), heure de Paris ────────────────────────────────────────────────
create or replace function public.training_last_week()
returns date
language sql stable security invoker set search_path = public, pg_temp
as $$
  select (date_trunc('week', ((now() at time zone 'Europe/Paris')::date)::timestamp)::date - 7);
$$;

-- ── Classement DE LA SEMAINE : Σ par cas (hors boss) du meilleur total obtenu dans la semaine ──
create or replace function public.training_weekly_ranking(p_week date)
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
language sql stable security definer set search_path = public, pg_temp
as $$
  with bounds as (
    select (p_week::timestamp at time zone 'Europe/Paris') as t0,
           ((p_week + 7)::timestamp at time zone 'Europe/Paris') as t1
  ),
  best as (
    select s.profile_id, s.case_id, max(s.total) as best_total, min(s.scored_at) as first_at
    from training_sessions s
    join training_cases c on c.id = s.case_id
    cross join bounds b
    where s.status = 'scored' and s.total is not null and c.kind <> 'boss'
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  )
  select b.profile_id, coalesce(p.display_name, '—'), sum(b.best_total)::integer, count(*)::integer,
         round(avg(b.best_total), 2)
  from best b
  join profiles p on p.id = b.profile_id
  where p.left_at is null and p.role = 'chatteur'
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.display_name
  order by 3 desc, 5 desc, min(b.first_at) asc;
$$;

-- ── Pastille sidebar / éligibilité : 1 = ticket non utilisé OU top 3 de la semaine passée non réclamé ──
create or replace function public.training_wheel_pending(p_profile uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when not (p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))) then 0
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.used_at is null) then 1
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.week = public.training_last_week()) then 0
    when exists (
      select 1
      from public.training_weekly_ranking(public.training_last_week()) with ordinality as r(profile_id, display_name, points, cases_done, avg_total, rn)
      where r.profile_id = p_profile and r.points > 0 and r.rn <= 3
    ) then 1
    else 0
  end;
$$;

revoke execute on function public.training_last_week() from public, anon;
revoke execute on function public.training_weekly_ranking(date) from public, anon;
revoke execute on function public.training_wheel_pending(uuid) from public, anon;
grant execute on function public.training_last_week() to authenticated;
grant execute on function public.training_weekly_ranking(date) to authenticated;
grant execute on function public.training_wheel_pending(uuid) to authenticated;
```

- [ ] **Step 2: Push UAT (dry-run avant/après) + contrôles**

```bash
psql "$DB" -c "select id, title, jsonb_array_length(sectors), jsonb_array_length(prizes) from training_wheel_config;"   # 1 | Roue de la chance | 2 | 5
psql "$DB" -c "select proname from pg_proc where proname like 'training_w%' or proname = 'training_last_week' order by 1;"   # 4 (last_week, weekly_ranking, wheel_pending, wheel_spin_journal)
psql "$DB" -c "select count(*) from pg_policies where tablename like 'training_wheel_%';"   # 4
psql "$DB" -c "select public.training_last_week();"   # un lundi
```
Smoke test transactionnel (rollback) : `begin; insert into training_wheel_tickets (profile_id, week, reason) values ((select id from profiles limit 1), public.training_last_week(), 'test'); insert into training_wheel_spins (profile_id, ticket_id, week, sector_label, won, prize_label, amount_eur) select profile_id, id, week, 'Cadeau', true, '10 €', 10 from training_wheel_tickets where reason='test'; select kind, to_value from member_events order by id desc limit 1; rollback;` → `recompense | Roue : 10 € — test`.

- [ ] **Step 3: Régénérer `types.ts`** ; `pnpm --filter @glagency/db typecheck && pnpm --filter @glagency/web typecheck`.

- [ ] **Step 4: Commit** — `feat(db): 0122 roue des récompenses — config, tickets hebdo, tirages, classement de la semaine, journal`

---

### Task 2: `@glagency/core` — `pickWeighted`, semaine passée, défauts GLA, `recompense` dans le journal

**Files:**
- Create: `packages/core/src/training/wheel.ts`, `wheel.test.ts`
- Modify: `packages/core/src/domain/member-events.ts` (+ son test s'il existe), `packages/core/src/index.ts`

**Interfaces:**
- Produces: `WheelSector { label; weight; lose }`, `WheelPrize { label; weight; amountEur: number | null }`, `WHEEL_DEFAULT_SECTORS`, `WHEEL_DEFAULT_PRIZES`, `pickWeighted<T extends { weight: number }>(items: T[], rand: (maxExclusive: number) => number): { item: T; index: number }` (ignore les poids ≤ 0 ; throw si somme = 0), `lastCompletedWeek(today: string): string` (lundi de la semaine passée), `weekLabel(monday: string): string` (« semaine du 11/08 »), `EVENT_KINDS` + `'recompense'`, `memberEventLabel('recompense', null, to)` → `to` tel quel (déjà lisible), `WHEEL_TOP_N = 3`.

- [ ] **Step 1: Test (échoue)**

```ts
import { describe, expect, it } from 'vitest'
import { lastCompletedWeek, pickWeighted, weekLabel, WHEEL_DEFAULT_PRIZES, WHEEL_DEFAULT_SECTORS, WHEEL_TOP_N } from './wheel'

describe('pickWeighted', () => {
  const items = [{ label: 'a', weight: 80 }, { label: 'b', weight: 0 }, { label: 'c', weight: 20 }]
  it('choisit selon les bornes cumulées, ignore les poids nuls', () => {
    expect(pickWeighted(items, () => 0).item.label).toBe('a')
    expect(pickWeighted(items, () => 79).item.label).toBe('a')
    expect(pickWeighted(items, () => 80).item.label).toBe('c')
    expect(pickWeighted(items, () => 99).item.label).toBe('c')
    expect(pickWeighted(items, () => 80).index).toBe(2)
  })
  it('appelle rand avec la somme des poids', () => {
    let seen = -1
    pickWeighted(items, (n) => { seen = n; return 0 })
    expect(seen).toBe(100)
  })
  it('refuse une somme nulle', () => {
    expect(() => pickWeighted([{ weight: 0 }], () => 0)).toThrow()
  })
})

describe('semaines', () => {
  it('lastCompletedWeek = lundi de la semaine passée (Paris)', () => {
    expect(lastCompletedWeek('2026-08-19')).toBe('2026-08-10')   // mercredi → lundi précédent - 7
    expect(lastCompletedWeek('2026-08-17')).toBe('2026-08-10')   // lundi → semaine passée
    expect(lastCompletedWeek('2026-08-16')).toBe('2026-08-03')   // dimanche
  })
  it('weekLabel', () => { expect(weekLabel('2026-08-10')).toBe('semaine du 10/08') })
})

describe('défauts GLA (en euros)', () => {
  it('roue Cadeau 80 / Raté 20, coffre 5 lots', () => {
    expect(WHEEL_DEFAULT_SECTORS).toEqual([{ label: 'Cadeau', weight: 80, lose: false }, { label: 'Raté', weight: 20, lose: true }])
    expect(WHEEL_DEFAULT_PRIZES.map((p) => [p.label, p.weight, p.amountEur])).toEqual([
      ['5 €', 60, 5], ['10 €', 20, 10], ['Day off supplémentaire', 5, null], ['20 €', 5, 20], ['Donner 5 € à un membre de ton équipe', 10, 5],
    ])
    expect(WHEEL_TOP_N).toBe(3)
  })
})
```

- [ ] **Step 2: `wheel.ts`**

```ts
import { addDays, mondayOf } from '../domain/dates'

/** Roue des récompenses (transposition de GLA) — règles PURES, testées, partagées par apps/web. */
export type WheelSector = { label: string; weight: number; lose: boolean }
export type WheelPrize = { label: string; weight: number; amountEur: number | null }

export const WHEEL_TOP_N = 3

/** Défauts GLA (index.html WHEEL_DEFAULT / CHEST_DEFAULT), montants passés en euros. */
export const WHEEL_DEFAULT_SECTORS: WheelSector[] = [
  { label: 'Cadeau', weight: 80, lose: false },
  { label: 'Raté', weight: 20, lose: true },
]
export const WHEEL_DEFAULT_PRIZES: WheelPrize[] = [
  { label: '5 €', weight: 60, amountEur: 5 },
  { label: '10 €', weight: 20, amountEur: 10 },
  { label: 'Day off supplémentaire', weight: 5, amountEur: null },
  { label: '20 €', weight: 5, amountEur: 20 },
  { label: 'Donner 5 € à un membre de ton équipe', weight: 10, amountEur: 5 },
]

/**
 * Tirage pondéré : `rand(n)` doit rendre un entier dans [0, n) (côté serveur : crypto.randomInt).
 * Les poids ≤ 0 sont ignorés ; somme nulle → erreur (config invalide).
 */
export function pickWeighted<T extends { weight: number }>(items: T[], rand: (maxExclusive: number) => number): { item: T; index: number } {
  const total = items.reduce((n, it) => n + Math.max(0, it.weight), 0)
  if (total <= 0) throw new Error('tirage impossible : aucun poids > 0')
  let r = rand(total)
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, items[i].weight)
    if (w === 0) continue
    if (r < w) return { item: items[i], index: i }
    r -= w
  }
  const last = items.length - 1
  return { item: items[last], index: last }
}

/** Lundi de la DERNIÈRE semaine complète (jour Paris 'YYYY-MM-DD' en entrée). */
export const lastCompletedWeek = (today: string): string => addDays(mondayOf(today), -7)

/** « semaine du 10/08 » */
export const weekLabel = (monday: string): string => `semaine du ${monday.slice(8, 10)}/${monday.slice(5, 7)}`
```
`member-events.ts` : ajouter `'recompense'` à `EVENT_KINDS` (commentaire : « Gain à la roue (trigger 0122) — `to_value` déjà lisible ») et un `case 'recompense': return to ?? 'Récompense'` dans `memberEventLabel`. `index.ts` : exporter les symboles de `wheel.ts` (types compris). Vérifier que le test existant de member-events (s'il énumère les kinds) est mis à jour.

- [ ] **Step 3: Vérifier** — `pnpm --filter @glagency/core test` (189 + nouveaux) ; `pnpm --filter @glagency/core typecheck` ; `pnpm --filter @glagency/web typecheck` (le check SQL `member_events` et `EVENT_KINDS` restent miroirs).

- [ ] **Step 4: Commit** — `feat(core): roue des récompenses — tirage pondéré, semaine passée, défauts GLA en euros, kind « recompense »`

---

### Task 3: Feature `training-wheel` — types, schémas, services, actions

**Files:**
- Create: `apps/web/src/features/training-wheel/types.ts`, `schema.ts`, `schema.test.ts`, `services/get-wheel.ts`, `services/get-wheel-history.ts`, `actions.ts`

**Interfaces:**
- Produces (types) : `WheelConfig { title; sectors: WheelSector[]; prizes: WheelPrize[] }`, `WheelTicket { id; week; reason; createdAt }`, `MySpin { id; week; spunAt; sectorLabel; won; prizeLabel; amountEur }`, `WheelData { config; ticket: WheelTicket | null; eligible: boolean; lastWeek: string; mySpins: MySpin[]; canSpin: boolean }`, `WheelHistoryRow { id; profileId; displayName; week; spunAt; won; prizeLabel; amountEur; paidAt }`, `WheelHistory { rows; totalEur; byWeek: { week; count; totalEur }[] }`, `SpinResult { sectorIndex; sectorLabel; won; prize: { index; label; amountEur } | null }`, `WheelVue = 'roue' | 'historique'`.
- Produces (schema) : `wheelConfigForm`, `WheelConfigInput`, `spinInput { ticketId }`.
- Produces (services) : `getWheel(profileId): Promise<WheelData>`, `getWheelHistory(): Promise<WheelHistory>`.
- Produces (actions) : `claimTicket() → ActionResult<{ ticketId: string | null }>`, `spinWheel(raw) → ActionResult<SpinResult>`, `saveWheelConfig(raw) → ActionResult`.
- Consumes : Task 1 (tables/RPC), Task 2 (`pickWeighted`, `lastCompletedWeek`, `wheelWeekLabel`, `WHEEL_TOP_N`, types), `requirePageProfile`, `requireAdminProfile`, `readStateCookie`, `createAdminClient`, `todayParis`.

- [ ] **Step 1: `schema.ts` + test**

```ts
import { z } from 'zod'

const weight = z.coerce.number().int('Poids entier').min(0, 'Poids ≥ 0').max(1000, 'Poids ≤ 1000')
const label = z.string().trim().min(1, 'Libellé requis').max(60, '60 caractères max')
export const sectorForm = z.object({ label, weight, lose: z.boolean() })
export const prizeForm = z.object({
  label, weight,
  // '' → null (champ vide = lot non monétaire) ; sinon nombre ≥ 0 en euros
  amountEur: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(0, 'Montant ≥ 0').max(100000, 'Montant trop élevé').nullable()),
})
export const wheelConfigForm = z
  .object({
    title: z.string().trim().min(1, 'Titre requis').max(60, '60 caractères max'),
    sectors: z.array(sectorForm).min(1, 'Au moins un secteur').max(12, '12 secteurs max'),
    prizes: z.array(prizeForm).min(1, 'Au moins un lot').max(20, '20 lots max'),
  })
  .refine((c) => c.sectors.some((s) => !s.lose && s.weight > 0), { message: 'Il faut au moins un secteur gagnant avec un poids > 0', path: ['sectors'] })
  .refine((c) => c.prizes.some((p) => p.weight > 0), { message: 'Il faut au moins un lot avec un poids > 0', path: ['prizes'] })
export type WheelConfigInput = z.infer<typeof wheelConfigForm>
export type WheelConfigFormValues = z.input<typeof wheelConfigForm>
export const spinInput = z.object({ ticketId: z.uuid() })
```
Test (`schema.test.ts`) : config valide passe ; secteurs tous perdants → échec avec le message ; lot montant `''` → `null` ; poids négatif → échec.

- [ ] **Step 2: `types.ts`** (comme le bloc Interfaces ; `WheelSector`/`WheelPrize` importés de `@glagency/core`).

- [ ] **Step 3: `services/get-wheel.ts`**

```ts
import { lastCompletedWeek, todayParis, type WheelPrize, type WheelSector } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { MySpin, WheelData } from '../types'

/**
 * Page Roue d'un chatter : config, ticket en attente, éligibilité (RPC lecture seule), mes gains.
 * 4 lectures parallèles sous RLS. `canSpin` = ticket présent ; `eligible` = la RPC dit 1 sans ticket
 * (le client appellera claimTicket au montage).
 */
export async function getWheel(profileId: string): Promise<WheelData> {
  const supabase = await createClient()
  const [cfg, tickets, spins, pending] = await Promise.all([
    supabase.from('training_wheel_config').select('title, sectors, prizes').eq('id', 1).single(),
    supabase.from('training_wheel_tickets').select('id, week, reason, created_at').eq('profile_id', profileId).is('used_at', null).order('created_at', { ascending: false }).limit(1),
    supabase.from('training_wheel_spins').select('id, week, spun_at, sector_label, won, prize_label, amount_eur').eq('profile_id', profileId).order('spun_at', { ascending: false }).limit(50),
    supabase.rpc('training_wheel_pending', { p_profile: profileId }),
  ])
  for (const r of [cfg, tickets, spins, pending]) if (r.error) throw new Error(r.error.message)
  const t = tickets.data?.[0]
  const ticket = t ? { id: t.id, week: t.week, reason: t.reason, createdAt: t.created_at } : null
  const mySpins: MySpin[] = (spins.data ?? []).map((s) => ({
    id: s.id, week: s.week, spunAt: s.spun_at, sectorLabel: s.sector_label, won: s.won, prizeLabel: s.prize_label,
    amountEur: s.amount_eur == null ? null : Number(s.amount_eur),
  }))
  return {
    config: { title: cfg.data.title, sectors: cfg.data.sectors as unknown as WheelSector[], prizes: cfg.data.prizes as unknown as WheelPrize[] },
    ticket, eligible: !ticket && Number(pending.data ?? 0) === 1, lastWeek: lastCompletedWeek(todayParis()),
    mySpins, canSpin: !!ticket,
  }
}
```
(`prizes` en base sont `amount_eur` — définir un mapping `{ label, weight, amount_eur } → WheelPrize` : écrire un helper `toPrizes(json)` qui lit `amount_eur` et produit `amountEur` ; idem inverse dans `saveWheelConfig`. Ne pas caster aveuglément.)

`services/get-wheel-history.ts` : `training_wheel_spins` (RLS encadrant) `.select('id, profile_id, week, spun_at, won, prize_label, amount_eur, paid_at').order('spun_at', { ascending: false }).limit(200)` + noms via `rpc('training_overview_roster')` (map profile_id → display_name, `'—'` sinon) ; `totalEur` = Σ `amount_eur` des gagnés ; `byWeek` groupé (desc).

- [ ] **Step 4: `actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { randomInt } from 'node:crypto'
import { createAdminClient } from '@glagency/db'
import { lastCompletedWeek, pickWeighted, todayParis, wheelWeekLabel, WHEEL_TOP_N, type WheelPrize, type WheelSector } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { runAction, noGuard, requirePageProfile, requireAdminProfile, BusinessError, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { spinInput, wheelConfigForm } from './schema'
import type { SpinResult } from '../types'   // (chemin : './types')

const IMPERSONATION_MSG = 'Action indisponible en consultation (mode « en tant que »)'
const revalidateWheel = () => { revalidatePath('/formation/roue'); revalidatePath('/formation', 'layout') }

/**
 * Réclame le ticket de la semaine passée si le chatter y était top 3 (revérifié serveur via la RPC).
 * Idempotent : ticket déjà attribué pour cette semaine, ou ticket non utilisé existant → null.
 */
export async function claimTicket(): Promise<ActionResult<{ ticketId: string | null }>> {
  return runAction({ schema: z.object({}), input: {}, guard: noGuard, handler: async () => {
    const profile = await requirePageProfile('frm-entrainement')
    if (await readStateCookie()) throw new BusinessError(IMPERSONATION_MSG)
    const supabase = await createClient()
    const week = lastCompletedWeek(todayParis())
    const { data: pending, error: pErr } = await supabase.from('training_wheel_tickets').select('id').eq('profile_id', profile.id).is('used_at', null).limit(1)
    if (pErr) throw new Error(pErr.message)
    if (pending?.length) return { ticketId: pending[0].id }
    const { data: rows, error } = await supabase.rpc('training_weekly_ranking', { p_week: week })
    if (error) throw new Error(error.message)
    const rank = (rows ?? []).findIndex((r) => r.profile_id === profile.id)
    if (rank < 0 || rank >= WHEEL_TOP_N || Number(rows![rank].points) <= 0) return { ticketId: null }
    const admin = createAdminClient()
    const { data: t, error: iErr } = await admin.from('training_wheel_tickets')
      .insert({ profile_id: profile.id, week, reason: `Top ${rank + 1} — ${wheelWeekLabel(week)}` })
      .select('id').single()
    if (iErr) {
      if (iErr.code === '23505') return { ticketId: null }   // déjà attribué pour cette semaine (et utilisé)
      throw new Error(iErr.message)
    }
    revalidateWheel()
    return { ticketId: t.id }
  } })
}

/** Le tirage : décidé ICI (crypto), consomme le ticket, enregistre le spin. */
export async function spinWheel(raw: unknown): Promise<ActionResult<SpinResult>> {
  return runAction({ schema: spinInput, input: raw, guard: noGuard, handler: async ({ ticketId }) => {
    const profile = await requirePageProfile('frm-entrainement')
    if (await readStateCookie()) throw new BusinessError(IMPERSONATION_MSG)
    const supabase = await createClient()
    const [{ data: t, error }, { data: cfg, error: cErr }] = await Promise.all([
      supabase.from('training_wheel_tickets').select('id, profile_id, week, used_at').eq('id', ticketId).maybeSingle(),
      supabase.from('training_wheel_config').select('sectors, prizes').eq('id', 1).single(),
    ])
    if (error) throw new Error(error.message)
    if (cErr) throw new Error(cErr.message)
    if (!t || t.profile_id !== profile.id) throw new BusinessError('Ticket introuvable')
    if (t.used_at) throw new BusinessError('Ce tour a déjà été utilisé')
    const sectors = cfg.sectors as unknown as WheelSector[]
    const prizes = toPrizes(cfg.prizes)   // helper partagé avec get-wheel (amount_eur → amountEur)
    const sec = pickWeighted(sectors, (n) => randomInt(0, n))
    const won = !sec.item.lose
    const prize = won ? pickWeighted(prizes, (n) => randomInt(0, n)) : null
    const admin = createAdminClient()
    // Consommation atomique : `.is('used_at', null)` + select → 0 ligne = double clic / course perdue.
    const { data: used, error: uErr } = await admin.from('training_wheel_tickets').update({ used_at: new Date().toISOString() }).eq('id', t.id).is('used_at', null).select('id')
    if (uErr) throw new Error(uErr.message)
    if (!used.length) throw new BusinessError('Ce tour a déjà été utilisé')
    const { error: sErr } = await admin.from('training_wheel_spins').insert({
      profile_id: profile.id, ticket_id: t.id, week: t.week, sector_label: sec.item.label, won,
      prize_label: prize?.item.label ?? null, amount_eur: prize?.item.amountEur ?? null,
    })
    if (sErr) throw new Error(sErr.message)
    revalidateWheel()
    return { sectorIndex: sec.index, sectorLabel: sec.item.label, won, prize: prize ? { index: prize.index, label: prize.item.label, amountEur: prize.item.amountEur } : null }
  } })
}

/** Config admin (upsert de la ligne 1). */
export async function saveWheelConfig(raw: unknown): Promise<ActionResult> {
  return runAction({ schema: wheelConfigForm, input: raw, guard: noGuard, handler: async (c) => {
    const profile = await requireAdminProfile()
    if (await readStateCookie()) throw new BusinessError(IMPERSONATION_MSG)
    const supabase = await createClient()   // RLS admin write OK sur la config
    const { error } = await supabase.from('training_wheel_config').upsert({
      id: 1, title: c.title, sectors: c.sectors, prizes: c.prizes.map((p) => ({ label: p.label, weight: p.weight, amount_eur: p.amountEur })),
      updated_at: new Date().toISOString(), updated_by: profile.id,
    })
    if (error) throw new Error(error.message)
    revalidateWheel()
  } })
}
```
(`z` importé de zod pour le schéma vide de `claimTicket` ; `toPrizes` dans `types.ts` ou un petit `lib`-like `mappers.ts` de la feature. Typage `Json` des colonnes jsonb : caster via `as unknown as Json`-compatible objets à l'écriture, `as unknown as …` à la lecture après un `Array.isArray` garde.)

- [ ] **Step 5: Vérifier** — `pnpm --filter @glagency/web test` (schema test) ; `typecheck` ; `lint`.

- [ ] **Step 6: Commit** — `feat(formation): roue — types, schémas, services (page, historique), actions (réclamer, tourner, configurer)`

---

### Task 4: Page `/formation/roue` — Template, roue SVG animée, coffre, mes gains, historique, dialog config

**Files:**
- Create: `apps/web/src/features/training-wheel/WheelTemplate.tsx`, `components/{wheel-spinner,wheel-svg,wheel-result,my-spins,wheel-history,wheel-config-dialog,wheel-tabs,wheel-skeleton}.tsx`
- Create: `apps/web/src/app/(dash)/formation/roue/{page,loading}.tsx`

**Interfaces:**
- Consumes : Task 3 (`WheelData`, `WheelHistory`, `SpinResult`, actions, `wheelConfigForm`), `ConfirmDialog`? (non), `ActionButton`, `Dialog`, `Table`, `Tabs`, `Badge`, `Input`, `Checkbox`.
- Produces : `WheelTemplate({ data, history, vue, canSpin: boolean, isAdmin })`, `WheelSpinner` (client), `WheelSvg` (pur, réutilisé pour l'aperçu admin), `WheelSkeleton`.

- [ ] **Step 1: `wheel-svg.tsx` (pur, sans hook)** — dessine la roue : `viewBox="0 0 200 200"`, un `path` par secteur (angles proportionnels aux poids > 0, comme GLA `drawWheel`), couleurs `['#8b5cf6','#13C57A','#19d3a2','#a855f7','#ffb547','#6366f1','#2dd4bf','#f472b6']` (secteur `lose` = `#ff5d7c`), libellé en `text` tourné au milieu du secteur, un cercle central. Props : `sectors`, `rotation` (deg), `spinning` (bool → `transition: transform 4.8s cubic-bezier(.15,.75,.2,1)`), `className`. Exporte aussi `sectorAngles(sectors)` → `[{ a0, a1, index }]` (poids > 0 seulement) pour que le spinner calcule l'angle cible ; un pointeur (triangle) fixe en haut.

- [ ] **Step 2: `wheel-spinner.tsx` (client)**

```tsx
'use client'
// Tirage : le SERVEUR décide (spinWheel), ici on anime jusqu'au secteur renvoyé puis on révèle le lot.
// Aucune lib : rotation CSS sur le SVG, révélation du « coffre » = carte en animate-in (tw-animate-css).
export function WheelSpinner({ data }: { data: WheelData }) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'claiming' | 'spinning' | 'reveal' | 'done'>('idle')
  const [result, setResult] = useState<SpinResult | null>(null)
  const [ticket, setTicket] = useState(data.ticket)
  const claimed = useRef(false)
  // Éligible sans ticket → réclamer une fois au montage (le serveur revérifie), puis refresh.
  useEffect(() => {
    if (!data.eligible || ticket || claimed.current) return
    claimed.current = true
    setPhase('claiming')
    void claimTicket().then((r) => { if (r.success && r.data.ticketId) router.refresh(); else setPhase('idle') })
  }, [data.eligible, ticket, router])
  const spin = async () => {
    if (!ticket || phase !== 'idle') return
    setPhase('spinning')
    const r = await spinWheel({ ticketId: ticket.id })
    if (!r.success) { toast.error(r.error); setPhase('idle'); router.refresh(); return }
    setResult(r.data)
    // angle cible : milieu du secteur (avec un aléa visuel dans le secteur), pointeur en haut (0°)
    const angles = sectorAngles(data.config.sectors)
    const a = angles.find((x) => x.index === r.data.sectorIndex) ?? angles[0]
    const target = a.a0 + (a.a1 - a.a0) * (0.15 + Math.random() * 0.7)
    const current = ((rotation % 360) + 360) % 360
    const targetMod = ((-target % 360) + 360) % 360
    setRotation(rotation + ((targetMod - current + 360) % 360) + 5 * 360)
    setTicket(null)
    window.setTimeout(() => setPhase('reveal'), 4900)
  }
  …
  // rendu : titre config, <WheelSvg rotation spinning={phase==='spinning'} />, bouton « Tourner la roue 🎡 » (ActionButton pending={phase==='spinning'||phase==='claiming'} disabled={!ticket}),
  // sous le bouton : ticket ? `Un tour disponible — ${ticket.reason}` : data.eligible ? 'Ton tour arrive…' : 'Termine dans le top 3 du classement de la semaine pour gagner un tour.',
  // phase 'reveal' → <WheelResult result onDone={() => { setPhase('done'); router.refresh() }} />
}
```
`wheel-result.tsx` (client, léger) : Raté → carte « 😅 Raté ! » + texte ; gagné → « 🎁 » puis après 450 ms la carte du lot (`animate-in zoom-in-95 fade-in`) « Tu gagnes : {label} » (+ « {amountEur} € » si monétaire) + « Ton gain est enregistré — l'agence te le versera / l'appliquera. » ; bouton « OK » → `onDone`.

- [ ] **Step 3: `my-spins.tsx` (RSC)** — table « Mes gains » : date, semaine, résultat (lot ou Raté), montant € (— si non monétaire), payé (✓ si `paidAt`, sinon « à venir »). Vide → « Aucun tirage pour l'instant. »

- [ ] **Step 4: `wheel-history.tsx` (RSC, encadrant)** — en-tête « Total gagné : X € (N tirages) », par semaine (repliable `details`, ouvert pour la plus récente) : table chatter / date / lot / montant / payé. Copie FR ; pas de bouton payer (compta plus tard).

- [ ] **Step 5: `wheel-config-dialog.tsx` (client, admin)** — bouton « Configurer » → `Dialog` RHF (`'use no memo'`, `useFieldArray` × 2, `zodResolver(wheelConfigForm)`, `useForm<WheelConfigFormValues, unknown, WheelConfigInput>`) : titre ; **Secteurs** (lignes : libellé, poids, case « perdant », % calculé sur la somme, ✕ ; « + Cadeau », « + Raté ») ; **Lots du coffre** (lignes : libellé, poids, montant € (vide = non monétaire), %, ✕ ; « + lot ») ; aperçu `WheelSvg` des secteurs en direct ; erreurs de refine sous chaque liste ; submit → `saveWheelConfig` → toast + fermeture + `router.refresh()`. Reset à l'ouverture (piège des dialogs).

- [ ] **Step 6: `wheel-tabs.tsx` (client, patron `me-tabs.tsx`)** — `?vue=historique` pour les encadrants ; `WheelTemplate.tsx` (RSC) : en-tête (h1 = `config.title`, sous-titre « Top 3 du classement de la semaine = un tour ») ; si `canSpin` (droit `frm-entrainement`) → `WheelSpinner` + `MySpins` ; si `frm-suivi` → onglet Historique ; admin → `WheelConfigDialog` en haut à droite. Un encadrant sans `frm-entrainement` voit la roue en aperçu (`WheelSvg` statique) sans bouton.

- [ ] **Step 7: Route** — `app/(dash)/formation/roue/page.tsx` : `requireAccess(['frm-entrainement', 'frm-suivi'])`, `canSpin = hasPageAccess(profile, 'frm-entrainement')`, `isSuivi = hasPageAccess(profile, 'frm-suivi')`, kickoff `getWheel(profile.id)` et (si `isSuivi`) `getWheelHistory()` sans await, `Suspense` avec `WheelSkeleton`, `loading.tsx`.

- [ ] **Step 8: Vérifier** — `typecheck`, `lint`, `test` ; sizes < 300 ; aucune lib ajoutée.

- [ ] **Step 9: Commit** — `feat(formation): page Roue — roue SVG animée, tirage, coffre, mes gains, historique encadrant, config admin`

---

### Task 5: Sidebar — item « Roue » + pastille streamée

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (item `{ href: '/formation/roue', label: 'Roue', icon: Gift, anyOf: ['frm-entrainement', 'frm-suivi'] }` après « Ma formation » ; test `workspaces.test.ts` si une liste d'items y est assertée)
- Create: `apps/web/src/lib/services/wheel-pending.ts` (`getWheelPending(profileId): Promise<number>` → `rpc('training_wheel_pending', { p_profile })`, `Number(data ?? 0)`)
- Modify: `apps/web/src/app/(dash)/layout.tsx` (`wheelPendingPromise = hasPageAccess(profile, 'frm-entrainement') ? getWheelPending(profile.id).catch(() => 0) : Promise.resolve(0)` — après `getProfile()`), `apps/web/src/components/app-sidebar.tsx` (prop `wheelPendingPromise?: Promise<number>` ; `WheelBadge` = même composant que `InsightsBadge` (renommer en `CountBadge({ promise })` réutilisé) ; rendu sur `item.href.endsWith('/roue')`).

- [ ] **Step 1: Implémenter** (les 4 fichiers) ; l'icône `Gift` de `lucide-react`.
- [ ] **Step 2: Vérifier** — `typecheck`, `lint`, `test` (`workspaces.test.ts`), et que le layout ne bloque pas sur la promesse (non attendue).
- [ ] **Step 3: Commit** — `feat(formation): entrée Roue dans la sidebar + pastille « tour disponible »`

---

### Task 6: Ma formation — sélecteur de classement (semaine / semaine dernière / global)

**Files:**
- Modify: `apps/web/src/features/training-me/types.ts` (`RankScope = 'semaine' | 'semaine-derniere' | 'global'`, `MeData.rankingScope`, `RankRow` gagne `weekly?: true` — ou un type `WeeklyRankRow { profileId; displayName; points; casesDone; avgTotal }` et `MeData.weeklyRanking: WeeklyRankRow[] | null`), `services/get-me.ts` (paramètre `scope`, RPC `training_weekly_ranking` avec `mondayOf(todayParis())` ou `lastCompletedWeek(todayParis())` selon le scope ; le classement global reste `training_ranking`), `MeTemplate.tsx`, `components/me-ranking.tsx` (colonnes selon le scope : hebdo = #, Chatter, Points, Cas, Moyenne ; légende « Top 3 de la semaine = un tour de roue » ; ma ligne mise en avant ; `myRank` recalculé sur la vue courante), create `components/me-ranking-select.tsx` (client : `Select`/`ToggleGroup` 3 valeurs → `router.replace(?vue=classement&classement=…)`), `app/(dash)/formation/ma-formation/page.tsx` (`searchParams.classement`, défaut `semaine`).

- [ ] **Step 1: Implémenter** — `getMe(profileId, scope)` : une seule RPC de classement selon le scope (pas les deux) ; `myRank` = index dans la vue affichée.
- [ ] **Step 2: Vérifier** — `typecheck`, `lint`, `test`.
- [ ] **Step 3: Commit** — `feat(formation): Ma formation — classement de la semaine / semaine dernière / global`

---

### Task 7: Docs + vérification globale

**Files:**
- Modify: `CLAUDE.md` (bloc Formation : Roue — tickets top 3 hebdo, tirage serveur, `training_wheel_*`, 0122 UAT ; « écritures service-role »), `docs/superpowers/specs/2026-08-19-formation-roue-design.md` (statut implémenté / à recetter).

- [ ] **Step 1: Docs** (diff minimal).
- [ ] **Step 2: Vérification globale** — `pnpm --filter @glagency/web lint && typecheck && test` ; `pnpm --filter @glagency/core test` ; `pnpm --filter @glagency/db typecheck` ; `pnpm --filter @glagency/web build` ; `supabase db push --db-url "$DB" --dry-run` → up to date ; `wc -l` (< 300) ; grep « aucune lib » (`package.json` inchangé).
- [ ] **Step 3: Commit** — `docs(formation): roue — CLAUDE.md, spec (statut)`

---

## Self-review

**Couverture spec** : §2 règles (semaine, points, ticket paresseux, tirage, config, pastille) → T1 (RPC/last_week), T2 (règles pures), T3 (actions), T5 (pastille) ✓ ; §3 modèle → T1 ✓ ; §4 feature/UI/sidebar/classement → T3, T4, T5, T6 ✓ ; §5 sécurité/perf/tests → transversal (Global Constraints), T2/T3 tests ✓ ; §6 recette → message de fin ✓. `member_events` `recompense` → T1 (SQL) + T2 (core) ✓.

**Types** : `WheelSector`/`WheelPrize` (core) ← T3 types/services/actions ← T4 (`WheelSvg`, dialog) ✓ ; `SpinResult { sectorIndex, sectorLabel, won, prize }` (T3) ← `WheelSpinner` (T4) ✓ ; `sectorAngles` (T4 `wheel-svg`) ← `wheel-spinner` ✓ ; RPC `training_weekly_ranking(p_week)` (T1) ← `claimTicket` (T3), `get-me` (T6) ✓ ; `training_wheel_pending(p_profile)` (T1) ← `get-wheel` (T3), `wheel-pending.ts` (T5) ✓ ; `pickWeighted(items, rand)` (T2) ← `spinWheel` (T3) ✓ ; `lastCompletedWeek`/`wheelWeekLabel`/`WHEEL_TOP_N` (T2) ← T3/T6 ✓.

**Placeholders** : aucun ; les composants décrits en prose (T4 steps 3-6, T5, T6) portent contenu, données, actions et états.
