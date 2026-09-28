# Agence — calendrier et cloche de notifications : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un onglet « Agence » (calendrier du mois, écriture admin, lecture pour tous) et une cloche de nouveautés dans la barre du haut.

**Architecture:** Deux tables, `agency_events` et `agency_notification_seen`, plus une RPC `security invoker` qui calcule la cloche à la volée depuis la dernière ouverture. La page suit la convention `app → Template (Server Component) → feuilles client`. Les écritures passent par des Server Actions admin et le client service-role. La cloche est lancée sans `await` dans le layout, comme les pastilles de la sidebar.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), Supabase (Postgres + RLS), shadcn/ui existant (`Dialog`, `ToggleGroup`, `Calendar`, `Popover`, `ComboboxMultiple`, `DropdownMenu`, `Checkbox`, `ConfirmDialog`), React Hook Form + Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-agence-calendrier-notifications-design.md`

## Global Constraints

- **Tout en composants shadcn existants** (`apps/web/src/components/ui/*`). Aucune nouvelle dépendance.
- **Formulaire** : RHF + `zodResolver`, avec **un seul schéma** partagé dans `features/agency/schema.ts`, le même objet pour le formulaire et pour `runAction` (`docs/guidelines-standard-feature.md` §5).
  - Zod v4 : `z.uuid()`, `z.flattenError`.
  - `'use no memo'` dans les composants RHF.
  - `form.reset(...)` à la réouverture du dialog.
- **Migrations** : `text` + `check`, **jamais** d'`enum`. Numéro **`0175`**. Application par `supabase db push --db-url` via le **pooler** (cf. `AGENTS.md`). Prod **sur go explicite de Benoit** seulement.
- **Écritures** : service-role **après** la garde admin (`adminGuard` + `requireAdminProfileLive`). Aucune policy d'écriture sur `agency_events`.
- **Design** : épuré, aucun filet ni séparateur décoratif (seules les bordures fonctionnelles, comme les cases du calendrier). Titre de page : `<h1 className="text-2xl font-semibold tracking-tight">`.
- **Libellés** : « Agence », « Ajouter un événement », « Jour » / « Période », « Rappeler le jour J », « Visible par », « Tout voir dans Agence », « Aucune nouveauté. ».
- **Rôles visables** : `chatteur`, `sous-manager`, `manager`, `police`. Les admins et le superadmin voient toujours tout.
- **Commits** : Benoit veut qu'on lui **demande avant chaque commit** (`CLAUDE.md`). L'étape « Commit » de chaque tâche prépare le `git add` et **attend son accord**.

## Review Focus

1. **Admin en « en tant que » qui ouvre la cloche** : il ne doit **pas** marquer comme vues les nouveautés de la personne consultée. `markNotificationsSeen` ne fait rien quand le cookie d'impersonation est présent (Task 6).
2. **Une période repliée en Jour** : un admin choisit une période du 12 au 14, repasse sur « Jour » et enregistre. L'événement doit durer un seul jour, le 12. C'est `eventRow`, testé en Task 4.
3. **Un nouvel événement publié après que la personne a vidé la cloche**, sans qu'elle recharge la page : la pastille doit se rallumer à la navigation suivante. Le « vidé » est rattaché à l'objet de données, pas à un booléen (Task 6, vérification manuelle).
4. **Rappel du jour J** : il apparaît à **00:00 heure de Paris**, pas à 00:00 UTC. Il n'apparaît pas si l'événement a été créé le jour même. C'est la vérification SQL de la Task 1.
5. **Chatteur qui ne travaille que dans Formation** et clique « Tout voir dans Agence » : la page s'ouvre, sans redirection vers une autre page. La page n'exige que la session (Task 5), et `canAccessNav` laisse passer `everyone` (Task 2).

---

### Task 1: Migration 0175 — tables, RLS, RPC de la cloche

**Files:**
- Create: `packages/db/supabase/migrations/0175_agence_evenements.sql`
- Modify: `packages/db/src/types.ts` (régénéré)

**Interfaces:**
- Produces:
  - table `agency_events(id uuid, title text, start_date date, end_date date, remind_on_day boolean, audience text[], created_by uuid, created_at timestamptz, updated_at timestamptz)` ;
  - table `agency_notification_seen(profile_id uuid pk, seen_at timestamptz)` ;
  - RPC `agency_notifications(p_limit int default 10) returns jsonb`, de forme `{ unread: number, items: { id, kind: 'event'|'reminder', title, startDate, endDate, at }[] }`.

- [ ] **Step 1: Écrire la migration**

```sql
-- Agence : le calendrier des événements de l'agence, et la cloche de nouveautés.
-- Spec : docs/superpowers/specs/2026-09-25-agence-calendrier-notifications-design.md
--
-- La cloche est CALCULÉE À LA VOLÉE (décision Benoit 2026-09-25) : on ne stocke que l'heure de la
-- dernière ouverture de chacun (`agency_notification_seen`). Pas une ligne par personne et par
-- événement, pas de robot de nuit pour les rappels du jour J.

create table if not exists public.agency_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 120),
  start_date    date not null,
  end_date      date not null,
  remind_on_day boolean not null default false,
  audience      text[] not null default array['chatteur','sous-manager','manager','police']::text[],
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint agency_events_dates check (end_date >= start_date),
  constraint agency_events_audience check (
    cardinality(audience) >= 1
    and audience <@ array['chatteur','sous-manager','manager','police']::text[]
  )
);
create index if not exists agency_events_start_idx   on public.agency_events (start_date);
create index if not exists agency_events_end_idx     on public.agency_events (end_date);
create index if not exists agency_events_created_idx on public.agency_events (created_at desc);

create table if not exists public.agency_notification_seen (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

alter table public.agency_events            enable row level security;
alter table public.agency_notification_seen enable row level security;

-- LECTURE : admin (superadmin compris), ou un rôle visé par l'événement. Membre parti = rien.
-- AUCUNE policy d'écriture : les Server Actions écrivent en service-role après la garde admin.
create policy agency_events_read on public.agency_events
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.left_at is null and p.role = any(audience)
    )
  );

-- Sa propre ligne, et seulement elle.
create policy agency_notification_seen_own on public.agency_notification_seen
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select on public.agency_events to authenticated;
grant select, insert, update on public.agency_notification_seen to authenticated;

-- La cloche. `security invoker` : la RLS de `agency_events` s'applique à l'appelant, qui ne voit
-- donc que les nouveautés qui le visent.
--   • « event »    : un événement, daté de sa création ;
--   • « reminder » : un événement à rappeler, daté de 00:00 HEURE DE PARIS de son premier jour —
--                    omis s'il a été créé ce jour-là ou après (sa notice « event » suffit).
-- Seules les nouveautés passées et des 30 derniers jours comptent. `unread` = celles postérieures à
-- la dernière ouverture (toutes si la personne n'a jamais ouvert sa cloche).
create or replace function public.agency_notifications(p_limit int default 10)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with today as (
    select (now() at time zone 'Europe/Paris')::date as d
  ),
  items as (
    select e.id, 'event'::text as kind, e.title, e.start_date, e.end_date, e.created_at as at
    from agency_events e
    where e.created_at > now() - interval '30 days'
    union all
    select e.id, 'reminder'::text, e.title, e.start_date, e.end_date,
           (e.start_date::timestamp at time zone 'Europe/Paris') as at
    from agency_events e, today t
    where e.remind_on_day
      and e.start_date <= t.d
      and e.start_date > t.d - 30
      and e.created_at < (e.start_date::timestamp at time zone 'Europe/Paris')
  ),
  visible as (
    select * from items where at <= now()
  ),
  seen as (
    select s.seen_at from agency_notification_seen s where s.profile_id = auth.uid()
  )
  select jsonb_build_object(
    'unread', (
      select count(*) from visible v
      where v.at > coalesce((select seen_at from seen), '-infinity'::timestamptz)
    ),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', x.id, 'kind', x.kind, 'title', x.title,
                 'startDate', x.start_date, 'endDate', x.end_date, 'at', x.at
               ) order by x.at desc)
      from (select * from visible order by at desc limit greatest(p_limit, 0)) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.agency_notifications(int) to authenticated;
```

- [ ] **Step 2: Appliquer sur l'UAT, à blanc puis pour de vrai**

```bash
cd packages/db
RAW=$(grep '^DATABASE_URL_UAT=' ../../.env | cut -d= -f2- | sed 's/^"//; s/"$//')
PW=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).password)" "$RAW")
POOL="postgresql://postgres.ihkksdmgtrbbjugeboks:${PW}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
supabase db push --db-url "$POOL" --dry-run   # attendu : « Would push these migrations: • 0175_agence_evenements.sql »
supabase db push --db-url "$POOL"              # attendu : « Applying migration 0175_agence_evenements.sql... Finished »
```

- [ ] **Step 3: Vérifier le comportement sur l'UAT (tout annulé par `rollback`)**

Écrire `/tmp/agence-check.sql`, puis le lancer avec `psql "$POOL" -v ON_ERROR_STOP=1 -f /tmp/agence-check.sql` :

```sql
\set QUIET on
select id as chatteur from profiles where role = 'chatteur' and left_at is null limit 1 \gset
begin;
-- Trois événements, écrits comme le ferait le service-role.
insert into agency_events (title, start_date, end_date, audience, created_at)
  values ('TEST police seul', current_date, current_date, '{police}', now() - interval '1 hour');
insert into agency_events (title, start_date, end_date, created_at)
  values ('TEST tout le monde', current_date + 3, current_date + 5, now() - interval '1 hour');
insert into agency_events (title, start_date, end_date, remind_on_day, created_at)
  values ('TEST rappel', (now() at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date, true, now() - interval '3 days');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'chatteur', 'role', 'authenticated')::text, true);

-- 1) Le chatteur ne voit pas l'événement réservé à la police ; il voit les 2 autres + le rappel.
select jsonb_path_query_array(public.agency_notifications(10), '$.items[*].title') as titres,
       public.agency_notifications(10)->'unread' as non_vus;
-- attendu : titres = ["TEST tout le monde", "TEST rappel" (kind reminder), "TEST rappel" (kind event)] ;
--           AUCUN « TEST police seul » ; non_vus = 3

-- 2) Ouvrir la cloche remet à zéro.
insert into agency_notification_seen (profile_id, seen_at) values (:'chatteur', now())
  on conflict (profile_id) do update set seen_at = excluded.seen_at;
select public.agency_notifications(10)->'unread' as non_vus_apres;   -- attendu : 0

-- 3) Un chatteur ne peut pas écrire d'événement.
do $$ begin
  insert into agency_events (title, start_date, end_date) values ('pirate', current_date, current_date);
  raise exception 'ÉCHEC : un chatteur a pu écrire un événement';
exception when insufficient_privilege then raise notice 'OK : écriture refusée au chatteur';
end $$;
rollback;
```

Vérifier que la sortie correspond aux commentaires « attendu ». Le rappel du jour J doit être daté de 00:00 Paris : dans `items`, son `at` se termine par `+02:00` ou `+01:00` à minuit local, soit `22:00:00+00` ou `23:00:00+00` en UTC.

- [ ] **Step 4: Régénérer les types**

```bash
supabase gen types typescript --db-url "$POOL" > src/types.ts
git diff --stat src/types.ts   # attendu : agency_events, agency_notification_seen, agency_notifications ajoutés
```

- [ ] **Step 5: Commit (après accord de Benoit)**

```bash
git add packages/db/supabase/migrations/0175_agence_evenements.sql packages/db/src/types.ts
git commit -m "feat(agence): tables des événements, lecture par rôle, et la cloche calculée à la volée"
```

---

### Task 2: L'item « Agence » dans la sidebar, visible par tous

**Files:**
- Modify: `apps/web/src/config/workspaces.ts` (interface `NavItem`, `canAccessNav`, nav de la face `chatter`, import d'icône)
- Test: `apps/web/src/config/workspaces.test.ts`

**Interfaces:**
- Produces : `NavItem.everyone?: boolean` ; l'item `{ href: '/chatter/agence', label: 'Agence', icon: CalendarDays, everyone: true, bottom: true }`.

- [ ] **Step 1: Écrire les tests qui échouent** (à la fin de `workspaces.test.ts`)

```ts
describe('Agence — visible par tous, au-dessus de Membres', () => {
  const chatter = WORKSPACES.find((w) => w.id === 'chatter')!
  const agence = chatter.nav.find((n) => n.href === '/chatter/agence')

  it('existe et se voit sans aucun droit coché', () => {
    expect(agence).toBeDefined()
    expect(canAccessNav(agence!, user([]))).toBe(true)
  })

  it('est placé juste au-dessus de Membres', () => {
    const bottom = chatter.nav.filter((n) => !n.group && n.bottom).map((n) => n.href)
    expect(bottom.indexOf('/chatter/agence')).toBe(bottom.indexOf('/chatter/members') - 1)
  })

  it('n’ajoute aucune case à cocher dans Membres', () => {
    expect(pageChoicesFor('chatter').some((c) => (c.slug as string) === 'agence')).toBe(false)
  })

  it('ne devient jamais la page d’atterrissage', () => {
    expect(landingHref({ role: 'chatteur', superadmin: false, manager: false, pages: [] })).not.toBe('/chatter/agence')
  })
})
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm --filter @glagency/web exec vitest run src/config/workspaces.test.ts`
Expected: FAIL. `agence` est `undefined` (« expected undefined to be defined »).

- [ ] **Step 3: Implémenter**

Dans l'interface `NavItem`, après `bottom?: boolean` :

```ts
  /**
   * Visible par TOUT profil connecté, sans droit à cocher dans Membres (ex. Agence : le calendrier
   * de l'agence se lit par tous). Pas un `PageSlug` : la page n'exige que la session.
   */
  everyone?: boolean
```

Dans `canAccessNav`, juste après la ligne `if (item.superadminOnly && !a.isSuperadmin) return false` :

```ts
  if (item.everyone) return true
```

Dans la nav de la face `chatter`, entre l'item Dashboard et l'item Membres :

```ts
      // Calendrier de l'agence (spec 2026-09-25) : lecture pour TOUS, écriture admin dans la page.
      // `bottom` : jamais page d'atterrissage (`landingHref` saute les items du bas).
      { href: '/chatter/agence', label: 'Agence', icon: CalendarDays, everyone: true, bottom: true },
```

Ajouter `CalendarDays` à l'import `lucide-react` du fichier, s'il n'y est pas.

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @glagency/web exec vitest run src/config/workspaces.test.ts`
Expected: PASS, tous les tests du fichier.

- [ ] **Step 5: Commit (après accord de Benoit)**

```bash
git add apps/web/src/config/workspaces.ts apps/web/src/config/workspaces.test.ts
git commit -m "feat(agence): l'onglet Agence, visible par tous, au-dessus de Membres"
```

---

### Task 3: La mise en page du mois (pur, testé)

**Files:**
- Create: `apps/web/src/features/agency/month-layout.ts`
- Test: `apps/web/src/features/agency/month-layout.test.ts`

**Interfaces:**
- Consumes : `AgencyRole` de `./schema` (Task 4). Pour que ce fichier compile seul, créer en même temps un `schema.ts` minimal avec seulement `AGENCY_ROLES` et `AgencyRole` (voir Task 4, Step 3) ; la Task 4 le complète.
- Produces :
  - `type AgencyEvent = { id: string; title: string; startDate: string; endDate: string; remindOnDay: boolean; audience: AgencyRole[] }`
  - `type EventBar = { event: AgencyEvent; startCol: number; span: number; lane: number; continuesBefore: boolean; continuesAfter: boolean }`
  - `type WeekRow = { days: string[]; bars: EventBar[]; lanes: number }`
  - `monthGrid(month: string): { start: string; end: string }`
  - `layoutMonth(month: string, events: AgencyEvent[]): WeekRow[]`
  - `parseMonth(value: string | undefined, today: string): string`
  - `shiftMonth(month: string, n: number): string`
  - `formatEventDates(start: string, end: string): string`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest'
import { layoutMonth, monthGrid, parseMonth, shiftMonth, type AgencyEvent } from './month-layout'

const ev = (id: string, startDate: string, endDate = startDate): AgencyEvent => ({
  id, title: id, startDate, endDate, remindOnDay: false, audience: ['chatteur'],
})
const rowOf = (weeks: ReturnType<typeof layoutMonth>, day: string) => weeks.find((w) => w.days.includes(day))!

describe('monthGrid', () => {
  it('octobre 2026 : du lundi 28/09 au dimanche 01/11', () => {
    expect(monthGrid('2026-10')).toEqual({ start: '2026-09-28', end: '2026-11-01' })
  })
})

describe('layoutMonth', () => {
  it('5 semaines de 7 jours pour octobre 2026', () => {
    const weeks = layoutMonth('2026-10', [])
    expect(weeks).toHaveLength(5)
    expect(weeks.every((w) => w.days.length === 7)).toBe(true)
  })

  it('un jour seul : une barre d’une case, dans la bonne colonne', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-10-14')]), '2026-10-14')
    expect(w.bars).toEqual([expect.objectContaining({ startCol: 2, span: 1, lane: 0, continuesBefore: false, continuesAfter: false })])
  })

  it('une période à cheval sur deux semaines se coupe en deux barres', () => {
    const weeks = layoutMonth('2026-10', [ev('a', '2026-10-17', '2026-10-20')])
    expect(rowOf(weeks, '2026-10-17').bars[0]).toMatchObject({ startCol: 5, span: 2, continuesAfter: true })
    expect(rowOf(weeks, '2026-10-20').bars[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true })
  })

  it('une période qui commence avant le mois s’affiche dès la 1re case de la grille', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-09-20', '2026-09-29')]), '2026-09-28')
    expect(w.bars[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true, continuesAfter: false })
  })

  it('deux événements le même jour s’empilent sur deux lignes', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-10-14'), ev('b', '2026-10-14')]), '2026-10-14')
    expect(w.bars.map((b) => b.lane).sort()).toEqual([0, 1])
    expect(w.lanes).toBe(2)
  })

  it('ignore un événement hors de la grille', () => {
    expect(layoutMonth('2026-10', [ev('a', '2026-12-01')]).every((w) => w.bars.length === 0)).toBe(true)
  })
})

describe('parseMonth / shiftMonth', () => {
  it('garde un mois valide, sinon le mois du jour', () => {
    expect(parseMonth('2026-11', '2026-09-25')).toBe('2026-11')
    expect(parseMonth('2026-13', '2026-09-25')).toBe('2026-09')
    expect(parseMonth(undefined, '2026-09-25')).toBe('2026-09')
  })
  it('passe l’année dans les deux sens', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm --filter @glagency/web exec vitest run src/features/agency/month-layout.test.ts`
Expected: FAIL, « Failed to resolve import "./month-layout" ».

- [ ] **Step 3: Implémenter**

D'abord `schema.ts` minimal (complété en Task 4) :

```ts
/** Les rôles qu'un événement peut viser. Les admins voient toujours tout (RLS `agency_events_read`). */
export const AGENCY_ROLES = ['chatteur', 'sous-manager', 'manager', 'police'] as const
export type AgencyRole = (typeof AGENCY_ROLES)[number]
```

Puis `month-layout.ts` :

```ts
import { addDays, addMonths, endOfMonth, frDayMonthShort, frWeekdayDate, mondayOf } from '@glagency/core'
import type { AgencyRole } from './schema'

export type AgencyEvent = {
  id: string
  title: string
  startDate: string
  endDate: string
  remindOnDay: boolean
  audience: AgencyRole[]
}

/** La part d'un événement dans UNE semaine de la grille. */
export type EventBar = {
  event: AgencyEvent
  /** Colonne de départ, 0 = lundi. */
  startCol: number
  span: number
  /** Ligne d'empilement dans la semaine (0 = la plus haute). */
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export type WeekRow = { days: string[]; bars: EventBar[]; lanes: number }

/** Bornes de la grille d'un mois (`AAAA-MM`) : du lundi de sa 1re semaine au dimanche de sa dernière. */
export function monthGrid(month: string): { start: string; end: string } {
  const first = `${month}-01`
  return { start: mondayOf(first), end: addDays(mondayOf(endOfMonth(first)), 6) }
}

/**
 * Les semaines du mois et, pour chacune, ses barres d'événements. Une période qui passe d'une
 * semaine à l'autre y est coupée en autant de barres. Empilement glouton : chaque barre prend la
 * première ligne libre ; les événements les plus tôt, puis les plus longs, passent en premier.
 */
export function layoutMonth(month: string, events: AgencyEvent[]): WeekRow[] {
  const { start, end } = monthGrid(month)
  const sorted = [...events].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      b.endDate.localeCompare(a.endDate) ||
      a.title.localeCompare(b.title, 'fr'),
  )
  const rows: WeekRow[] = []
  for (let weekStart = start; weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const laneEnds: string[] = []
    const bars: EventBar[] = []
    for (const event of sorted) {
      if (event.endDate < weekStart || event.startDate > weekEnd) continue
      const from = event.startDate > weekStart ? event.startDate : weekStart
      const to = event.endDate < weekEnd ? event.endDate : weekEnd
      let lane = laneEnds.findIndex((last) => last < from)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(to)
      } else laneEnds[lane] = to
      bars.push({
        event,
        startCol: days.indexOf(from),
        span: days.indexOf(to) - days.indexOf(from) + 1,
        lane,
        continuesBefore: event.startDate < weekStart,
        continuesAfter: event.endDate > weekEnd,
      })
    }
    rows.push({ days, bars, lanes: laneEnds.length })
  }
  return rows
}

/** Le mois de l'URL s'il est bien formé (`AAAA-MM`), sinon celui du jour (heure de Paris). */
export function parseMonth(value: string | undefined, today: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7)
}

export const shiftMonth = (month: string, n: number): string => addMonths(`${month}-01`, n).slice(0, 7)

/** « mercredi 14 octobre » pour un jour, « 17 oct. → 20 oct. » pour une période. */
export function formatEventDates(start: string, end: string): string {
  return start === end ? frWeekdayDate(start) : `${frDayMonthShort(start)} → ${frDayMonthShort(end)}`
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @glagency/web exec vitest run src/features/agency/month-layout.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit (après accord de Benoit)**

```bash
git add apps/web/src/features/agency/month-layout.ts apps/web/src/features/agency/month-layout.test.ts apps/web/src/features/agency/schema.ts
git commit -m "feat(agence): la grille du mois et l'empilement des événements"
```

---

### Task 4: Le schéma du formulaire et les Server Actions

**Files:**
- Create or complete: `apps/web/src/features/agency/schema.ts`
- Create: `apps/web/src/features/agency/actions.ts`
- Test: `apps/web/src/features/agency/schema.test.ts`

**Interfaces:**
- Consumes : table `agency_events` (Task 1).
- Produces :
  - `AGENCY_ROLES`, `type AgencyRole`, `AGENCY_ROLE_LABELS: Record<AgencyRole, string>` ;
  - `eventInput` (Zod), `type EventInput = { id?: string; title: string; mode: 'jour' | 'periode'; startDate: string; endDate: string; remindOnDay: boolean; audience: AgencyRole[] }` ;
  - `eventIdInput` ;
  - `eventRow(v: EventInput): { title; start_date; end_date; remind_on_day; audience }` ;
  - `saveEvent(raw: unknown): Promise<ActionResult>` (crée si pas d'`id`, sinon modifie) ;
  - `deleteEvent(raw: unknown): Promise<ActionResult>`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest'
import { AGENCY_ROLES, eventInput, eventRow, type EventInput } from './schema'

const base: EventInput = {
  title: 'Mise en avant Juliette', mode: 'jour', startDate: '2026-10-14', endDate: '2026-10-14',
  remindOnDay: false, audience: [...AGENCY_ROLES],
}

describe('eventInput', () => {
  it('accepte un jour', () => expect(eventInput.safeParse(base).success).toBe(true))

  it('accepte une période dont la fin suit le début', () => {
    expect(eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-16' }).success).toBe(true)
  })

  it('refuse une période qui finit avant de commencer, sur le champ de fin', () => {
    const r = eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-10' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['endDate'])
  })

  it('refuse un nom vide (espaces compris) et une audience vide', () => {
    expect(eventInput.safeParse({ ...base, title: '   ' }).success).toBe(false)
    expect(eventInput.safeParse({ ...base, audience: [] }).success).toBe(false)
  })

  it('refuse un rôle inconnu', () => {
    expect(eventInput.safeParse({ ...base, audience: ['admin'] }).success).toBe(false)
  })
})

describe('eventRow', () => {
  it('en mode Jour, la fin EST le début, même si une période avait été choisie avant', () => {
    expect(eventRow({ ...base, mode: 'jour', endDate: '2026-10-20' }).end_date).toBe('2026-10-14')
  })
  it('en mode Période, garde la fin choisie', () => {
    expect(eventRow({ ...base, mode: 'periode', endDate: '2026-10-20' }).end_date).toBe('2026-10-20')
  })
})
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm --filter @glagency/web exec vitest run src/features/agency/schema.test.ts`
Expected: FAIL, « eventInput is not exported » ou « eventRow is not a function ».

- [ ] **Step 3: Écrire `schema.ts` complet**

```ts
import { z } from 'zod'

/** Les rôles qu'un événement peut viser. Les admins voient toujours tout (RLS `agency_events_read`). */
export const AGENCY_ROLES = ['chatteur', 'sous-manager', 'manager', 'police'] as const
export type AgencyRole = (typeof AGENCY_ROLES)[number]

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  chatteur: 'Chatteurs',
  'sous-manager': 'Sous-managers',
  manager: 'Managers',
  police: 'Police',
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')

/** Saisie d'un événement — le MÊME objet pour le formulaire (resolver) et pour `runAction`. */
export const eventInput = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, 'Donne un nom à l’événement').max(120, '120 caractères maximum'),
    mode: z.enum(['jour', 'periode']),
    startDate: day,
    endDate: day,
    remindOnDay: z.boolean(),
    audience: z.array(z.enum(AGENCY_ROLES)).min(1, 'Choisis au moins un rôle'),
  })
  .refine((v) => v.mode === 'jour' || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La fin doit suivre le début',
  })
export type EventInput = z.infer<typeof eventInput>

export const eventIdInput = z.object({ id: z.uuid() })

/**
 * La ligne `agency_events` d'une saisie. En mode Jour, la fin EST le début : un admin qui choisit
 * une période puis repasse sur « Jour » ne doit pas enregistrer l'ancienne fin.
 */
export function eventRow(v: EventInput) {
  return {
    title: v.title,
    start_date: v.startDate,
    end_date: v.mode === 'jour' ? v.startDate : v.endDate,
    remind_on_day: v.remindOnDay,
    audience: [...v.audience],
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm --filter @glagency/web exec vitest run src/features/agency/schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Écrire `actions.ts`**

```ts
'use server'

// Écritures du calendrier Agence — ADMIN seul. Service-role après la garde : `agency_events` n'a
// AUCUNE policy d'écriture (0175), comme le reste des écritures sensibles du projet.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { adminGuard, requireAdminProfileLive, runAction, type ActionResult } from '@/lib/actions'
import { eventIdInput, eventInput, eventRow } from './schema'

/** Crée l'événement (sans `id`) ou le modifie. Une modification ne renotifie personne. */
export async function saveEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventInput,
    input: raw,
    guard: adminGuard,
    handler: async (v) => {
      const profile = await requireAdminProfileLive()
      const admin = createAdminClient()
      const { error } = v.id
        ? await admin
            .from('agency_events')
            .update({ ...eventRow(v), updated_at: new Date().toISOString() })
            .eq('id', v.id)
        : await admin.from('agency_events').insert({ ...eventRow(v), created_by: profile.id })
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/agence')
    },
  })
}

/** Supprime l'événement : il disparaît du calendrier et de la cloche de tout le monde. */
export async function deleteEvent(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: eventIdInput,
    input: raw,
    guard: adminGuard,
    handler: async ({ id }) => {
      await requireAdminProfileLive()
      const { error } = await createAdminClient().from('agency_events').delete().eq('id', id)
      if (error) throw new Error(error.message)
      revalidatePath('/chatter/agence')
    },
  })
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @glagency/web exec tsc --noEmit -p .`
Expected: aucune erreur. Les types de `agency_events` viennent de la Task 1.

- [ ] **Step 7: Commit (après accord de Benoit)**

```bash
git add apps/web/src/features/agency/schema.ts apps/web/src/features/agency/schema.test.ts apps/web/src/features/agency/actions.ts
git commit -m "feat(agence): le formulaire d'événement et ses actions admin"
```

---

### Task 5: La page Agence — calendrier et fenêtre d'événement

**Files:**
- Create: `apps/web/src/features/agency/services/get-agency-month.ts`
- Create: `apps/web/src/features/agency/AgencyTemplate.tsx`
- Create: `apps/web/src/features/agency/components/month-grid.tsx`
- Create: `apps/web/src/features/agency/components/event-chip.client.tsx`
- Create: `apps/web/src/features/agency/components/event-dialog.client.tsx`
- Create: `apps/web/src/features/agency/components/date-field.client.tsx`
- Create: `apps/web/src/app/(dash)/chatter/agence/page.tsx`

**Interfaces:**
- Consumes :
  - `layoutMonth`, `monthGrid`, `parseMonth`, `shiftMonth`, `formatEventDates`, `AgencyEvent`, `WeekRow` (Task 3) ;
  - `eventInput`, `EventInput`, `AGENCY_ROLES`, `AGENCY_ROLE_LABELS` (Task 4) ;
  - `saveEvent`, `deleteEvent` (Task 4).
- Produces : `getAgencyMonth(month: string): Promise<AgencyEvent[]>` ; la route `/chatter/agence?mois=AAAA-MM`.

- [ ] **Step 1: Le service de lecture**

```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { monthGrid, type AgencyEvent } from '../month-layout'
import type { AgencyRole } from '../schema'

/**
 * Les événements visibles sur la grille d'un mois. Client utilisateur : la RLS
 * (`agency_events_read`) ne rend que ceux qui visent le rôle de l'appelant. Pas de `fetchAll` :
 * la table est petite, quelques événements par mois, et le filtre de dates borne la lecture à la
 * grille (42 jours au plus).
 */
export async function getAgencyMonth(month: string): Promise<AgencyEvent[]> {
  const { start, end } = monthGrid(month)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agency_events')
    .select('id, title, start_date, end_date, remind_on_day, audience')
    .lte('start_date', end)
    .gte('end_date', start)
    .order('start_date')
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.start_date,
    endDate: e.end_date,
    remindOnDay: e.remind_on_day,
    audience: e.audience as AgencyRole[],
  }))
}
```

- [ ] **Step 2: Le champ de date (Jour ou Période)**

`components/date-field.client.tsx` :

```tsx
'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { parseDay } from '@/lib/period'
import { formatEventDates } from '../month-layout'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Choix d'un jour ou d'une période, en `AAAA-MM-JJ`. Pas le `DayPicker` partagé : il borne la saisie
 * aux 14 derniers jours (sanctions), alors qu'un événement se pose des semaines à l'avance.
 * `modal` : dans un Dialog Radix, un Popover non modal perd le focus.
 */
export function DateField({
  mode,
  start,
  end,
  onChange,
}: {
  mode: 'jour' | 'periode'
  start: string
  end: string
  onChange: (start: string, end: string) => void
}) {
  const [open, setOpen] = useState(false)
  const from = parseDay(start) ?? undefined
  const to = parseDay(end) ?? undefined
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 justify-start gap-2 text-sm font-normal">
          <CalendarIcon className="size-4" />
          {formatEventDates(start, mode === 'jour' ? start : end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {mode === 'jour' ? (
          <Calendar
            mode="single"
            selected={from}
            defaultMonth={from}
            locale={fr}
            onSelect={(d) => {
              if (!d) return
              onChange(iso(d), iso(d))
              setOpen(false)
            }}
            autoFocus
          />
        ) : (
          <Calendar
            mode="range"
            selected={{ from, to }}
            defaultMonth={from}
            numberOfMonths={2}
            locale={fr}
            onSelect={(r) => {
              if (!r?.from) return
              onChange(iso(r.from), iso(r.to ?? r.from))
              if (r.to && r.to > r.from) setOpen(false)
            }}
            autoFocus
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 3: La fenêtre Ajouter / Modifier**

`components/event-dialog.client.tsx` :

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { Controller, useController, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { todayParis } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { callAction } from '@/lib/actions-client'
import { deleteEvent, saveEvent } from '../actions'
import type { AgencyEvent } from '../month-layout'
import { AGENCY_ROLES, AGENCY_ROLE_LABELS, eventInput, type AgencyRole, type EventInput } from '../schema'
import { DateField } from './date-field.client'

const blank = (): EventInput => {
  const d = todayParis()
  return { title: '', mode: 'jour', startDate: d, endDate: d, remindOnDay: false, audience: [...AGENCY_ROLES] }
}
const fromEvent = (e: AgencyEvent): EventInput => ({
  id: e.id,
  title: e.title,
  mode: e.startDate === e.endDate ? 'jour' : 'periode',
  startDate: e.startDate,
  endDate: e.endDate,
  remindOnDay: e.remindOnDay,
  audience: e.audience,
})
const errorCls = 'text-xs text-red-600 dark:text-red-400'

/**
 * Ajouter (sans `event`) ou modifier un événement — ADMIN seul, `adminGuard` côté serveur.
 * `'use no memo'` : le React Compiler casse `formState` de RHF (cf. `compta-link-dialog.tsx`).
 */
export function EventDialog({ event, trigger }: { event?: AgencyEvent; trigger?: ReactNode }) {
  'use no memo'
  const [open, setOpen] = useState(false)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventInput>({ resolver: zodResolver(eventInput), defaultValues: event ? fromEvent(event) : blank() })
  const mode = useWatch({ control, name: 'mode' })
  const { field: start } = useController({ control, name: 'startDate' })
  const { field: end } = useController({ control, name: 'endDate' })

  const submit = handleSubmit(async (values) => {
    const res = await callAction(saveEvent(values))
    if (!res.success) {
      setError('root', { message: res.error })
      toast.error(res.error)
      return
    }
    toast.success(event ? 'Événement modifié' : 'Événement publié')
    setOpen(false)
  })

  const remove = async () => {
    if (!event) return
    const res = await callAction(deleteEvent({ id: event.id }))
    if (!res.success) return res.error
    toast.success('Événement supprimé')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Réouverture = données fraîches, jamais le brouillon ou l'erreur d'avant.
        if (o) reset(event ? fromEvent(event) : blank())
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus className="size-4" />
            Ajouter un événement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? 'Modifier l’événement' : 'Nouvel événement'}</DialogTitle>
          <DialogDescription>
            {event
              ? 'Une modification ne renotifie personne.'
              : 'Les rôles choisis le voient dans Agence et sont notifiés dans la cloche.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="agency-title">Nom</Label>
            <Input id="agency-title" maxLength={120} aria-invalid={!!errors.title} {...register('title')} />
            {errors.title && <p className={errorCls}>{errors.title.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <ToggleGroupItem value="jour">Jour</ToggleGroupItem>
                  <ToggleGroupItem value="periode">Période</ToggleGroupItem>
                </ToggleGroup>
              )}
            />
            <DateField
              mode={mode}
              start={start.value}
              end={end.value}
              onChange={(s, e) => {
                start.onChange(s)
                end.onChange(e)
              }}
            />
            {errors.endDate && <p className={errorCls}>{errors.endDate.message}</p>}
          </div>

          <Controller
            control={control}
            name="remindOnDay"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Rappeler le jour J
              </label>
            )}
          />

          <div className="grid gap-1.5">
            <Label>Visible par</Label>
            <Controller
              control={control}
              name="audience"
              render={({ field }) => (
                <ComboboxMultiple
                  trigger={
                    <Button type="button" variant="outline" className="h-auto min-h-9 justify-start font-normal">
                      {field.value.length === AGENCY_ROLES.length
                        ? 'Tout le monde'
                        : field.value.map((r) => AGENCY_ROLE_LABELS[r]).join(', ') || 'Choisir…'}
                    </Button>
                  }
                  options={AGENCY_ROLES.map((r) => ({ value: r, label: AGENCY_ROLE_LABELS[r] }))}
                  value={field.value}
                  onChange={(next) => field.onChange(next as AgencyRole[])}
                  placeholder="Rechercher un rôle…"
                />
              )}
            />
            {errors.audience && <p className={errorCls}>{errors.audience.message}</p>}
          </div>

          {errors.root && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.root.message}
            </p>
          )}

          <DialogFooter className="gap-2">
            {event && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="mr-auto text-red-600">
                    <Trash2 className="size-4" />
                    Supprimer
                  </Button>
                }
                title="Supprimer cet événement ?"
                description="Il disparaît du calendrier et de la cloche de tout le monde."
                onConfirm={remove}
              />
            )}
            <ActionButton type="submit" pending={isSubmitting}>
              {event ? 'Enregistrer' : 'Publier'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: La barre d'un événement (admin : édition ; autres : lecture)**

`components/event-chip.client.tsx` :

```tsx
'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatEventDates, type EventBar } from '../month-layout'
import { EventDialog } from './event-dialog.client'

export function EventChip({ bar, canEdit }: { bar: EventBar; canEdit: boolean }) {
  const { event } = bar
  const chip = (
    <button
      type="button"
      title={event.title}
      className={cn(
        'w-full truncate rounded-sm bg-primary/10 px-1.5 text-left text-xs leading-5 hover:bg-primary/15',
        bar.continuesBefore && 'rounded-l-none',
        bar.continuesAfter && 'rounded-r-none',
      )}
    >
      {event.title}
    </button>
  )
  if (canEdit) return <EventDialog event={event} trigger={chip} />
  return (
    <Popover>
      <PopoverTrigger asChild>{chip}</PopoverTrigger>
      <PopoverContent className="w-64 text-sm" align="start">
        <p className="font-medium">{event.title}</p>
        <p className="text-muted-foreground">{formatEventDates(event.startDate, event.endDate)}</p>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 5: La grille du mois (Server Component)**

`components/month-grid.tsx` :

```tsx
import { cn } from '@/lib/utils'
import type { WeekRow } from '../month-layout'
import { EventChip } from './event-chip.client'

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
/** Hauteur d'une ligne d'événements (barre 20 px + 4 px d'écart). */
const LANE_PX = 24

export function MonthGrid({ month, today, weeks, canEdit }: { month: string; today: string; weeks: WeekRow[]; canEdit: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5">{d}</div>
        ))}
      </div>
      {weeks.map((w) => (
        <div key={w.days[0]} className="relative grid grid-cols-7 border-b last:border-b-0" style={{ minHeight: 64 + w.lanes * LANE_PX }}>
          {w.days.map((d) => (
            <div key={d} className={cn('border-r px-2 pt-1.5 text-xs last:border-r-0', d.slice(0, 7) !== month && 'text-muted-foreground/50')}>
              <span className={cn(d === today && 'font-semibold text-primary underline underline-offset-4')}>{Number(d.slice(8))}</span>
            </div>
          ))}
          {w.bars.length > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 gap-y-1 px-1"
              style={{ gridTemplateRows: `repeat(${w.lanes}, 20px)` }}
            >
              {w.bars.map((b) => (
                <div key={`${b.event.id}-${w.days[0]}`} className="pointer-events-auto" style={{ gridColumn: `${b.startCol + 1} / span ${b.span}`, gridRow: b.lane + 1 }}>
                  <EventChip bar={b} canEdit={canEdit} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Le Template et la page**

`AgencyTemplate.tsx` :

```tsx
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { frMonthLong } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { MonthGrid } from './components/month-grid'
import { EventDialog } from './components/event-dialog.client'
import { layoutMonth, shiftMonth, type AgencyEvent } from './month-layout'

const monthHref = (mois: string) => ({ pathname: '/chatter/agence' as const, query: { mois } })

/** Agence — le calendrier des événements de l'agence. Écriture admin, lecture pour tous. */
export function AgencyTemplate({ month, today, events, canEdit }: { month: string; today: string; events: AgencyEvent[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Agence</h1>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, -1))} aria-label="Mois précédent"><ChevronLeft className="size-4" /></Link>
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">{frMonthLong(`${month}-01`)}</span>
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href={monthHref(shiftMonth(month, 1))} aria-label="Mois suivant"><ChevronRight className="size-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/chatter/agence">Aujourd’hui</Link>
          </Button>
        </div>
        {canEdit && (
          <div className="ml-auto">
            <EventDialog />
          </div>
        )}
      </div>
      <MonthGrid month={month} today={today} weeks={layoutMonth(month, events)} canEdit={canEdit} />
    </div>
  )
}
```

`app/(dash)/chatter/agence/page.tsx` :

```tsx
import { redirect } from 'next/navigation'
import { todayParis } from '@glagency/core'
import { getProfile } from '@/lib/auth'
import { AgencyTemplate } from '@/features/agency/AgencyTemplate'
import { parseMonth } from '@/features/agency/month-layout'
import { getAgencyMonth } from '@/features/agency/services/get-agency-month'

/**
 * Agence — ouverte à TOUT profil connecté (nav `everyone`, spec 2026-09-25) : la session suffit,
 * aucun `requireAccess`. Les contrôles d'écriture ne s'affichent qu'aux admins, et les Server
 * Actions refont la garde.
 */
export default async function AgencePage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  const { mois } = await searchParams
  const today = todayParis()
  const month = parseMonth(mois, today)
  const events = await getAgencyMonth(month)
  return <AgencyTemplate month={month} today={today} events={events} canEdit={profile.role === 'admin'} />
}
```

- [ ] **Step 7: Routes typées, typecheck, lint, tests**

```bash
pnpm --filter @glagency/web exec next typegen
pnpm --filter @glagency/web exec tsc --noEmit -p .
pnpm --filter @glagency/web exec eslint src/features/agency "src/app/(dash)/chatter/agence"
pnpm --filter @glagency/web exec vitest run
```

Expected : aucune erreur ; tous les tests passent.

- [ ] **Step 8: Vérification à l'écran (dev branché sur l'UAT)**

`pnpm --filter @glagency/web dev`, puis :
- en **admin** sur `/chatter/agence` :
  - créer « TEST jour » (un jour) et « TEST période » (une période qui passe un dimanche) : elles s'affichent sur les bonnes cases, la période en deux barres ;
  - modifier puis supprimer (confirmation demandée) ;
  - choisir une période, repasser sur « Jour », enregistrer : l'événement ne dure qu'un jour ;
- en **chatteur** (« en tant que » depuis Membres) : pas de bouton, la barre ouvre un popover en lecture ; un événement visant « Police » seulement n'apparaît pas ;
- ◀ ▶ et « Aujourd'hui » changent le mois dans l'URL (`?mois=`) ;
- avec un compte qui n'a **que** des droits Formation (« en tant que » un chatteur en formation) : `/chatter/agence` s'ouvre sans redirection, la sidebar de la partie Chatteurs y montre « Agence » (Review Focus 5).

- [ ] **Step 9: Commit (après accord de Benoit)**

```bash
git add apps/web/src/features/agency "apps/web/src/app/(dash)/chatter/agence"
git commit -m "feat(agence): le calendrier du mois, et la fenêtre d'événement pour les admins"
```

---

### Task 6: La cloche dans la barre du haut

**Files:**
- Create: `apps/web/src/lib/notifications/get-notifications.ts`
- Create: `apps/web/src/lib/notifications/actions.ts`
- Create: `apps/web/src/components/notification-bell.client.tsx`
- Modify: `apps/web/src/app/(dash)/layout.tsx` (imports, `DashDynamic`, header)

**Interfaces:**
- Consumes : la RPC `agency_notifications` et la table `agency_notification_seen` (Task 1) ; la route `/chatter/agence` (Task 5).
- Produces :
  - `type NotificationItem = { id: string; kind: 'event' | 'reminder'; title: string; startDate: string; endDate: string; at: string }` ;
  - `type Notifications = { unread: number; items: NotificationItem[] }` ;
  - `getNotifications(): Promise<Notifications>` ;
  - `markNotificationsSeen(): Promise<ActionResult>` ;
  - `<NotificationBell promise={Promise<Notifications | null>} />`.

- [ ] **Step 1: La lecture**

`lib/notifications/get-notifications.ts` :

```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type NotificationItem = {
  id: string
  kind: 'event' | 'reminder'
  title: string
  startDate: string
  endDate: string
  at: string
}
export type Notifications = { unread: number; items: NotificationItem[] }

/**
 * La cloche de l'utilisateur courant (RPC `agency_notifications`, 0175). Lue par le layout à
 * chaque rendu, pour tout le monde : UNE requête légère sur une petite table, la RLS fait le tri
 * par rôle. Cast depuis `Json` : cf. `docs/guidelines-data-loading.md`.
 */
export async function getNotifications(): Promise<Notifications> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('agency_notifications', { p_limit: 10 })
  if (error) throw new Error(error.message)
  return (data as unknown as Notifications | null) ?? { unread: 0, items: [] }
}
```

- [ ] **Step 2: L'action « vu »**

`lib/notifications/actions.ts` :

```ts
'use server'

import { z } from 'zod'
import { getProfile } from '@/lib/auth'
import { noGuard, runAction, type ActionResult } from '@/lib/actions'
import { readStateCookie } from '@/lib/impersonation/session'
import { createClient } from '@/lib/supabase/server'

/**
 * La cloche vient d'être ouverte : ses nouveautés sont vues. En « en tant que », on n'écrit RIEN :
 * c'est l'admin qui regarde, pas la personne consultée — sa pastille doit rester allumée.
 * Client utilisateur : la RLS n'autorise que SA propre ligne.
 */
export async function markNotificationsSeen(): Promise<ActionResult> {
  return runAction({
    schema: z.undefined(),
    input: undefined,
    guard: noGuard,
    handler: async () => {
      const profile = await getProfile()
      if (!profile || (await readStateCookie())) return
      const supabase = await createClient()
      const { error } = await supabase
        .from('agency_notification_seen')
        .upsert({ profile_id: profile.id, seen_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
  })
}
```

- [ ] **Step 3: Le composant cloche**

`components/notification-bell.client.tsx` :

```tsx
'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { callAction } from '@/lib/actions-client'
import { markNotificationsSeen } from '@/lib/notifications/actions'
import type { Notifications } from '@/lib/notifications/get-notifications'
import { frDayMonthShort } from '@glagency/core'

// `components/` n'importe pas depuis `features/` (frontière ESLint) : format recopié en une ligne.
const dates = (s: string, e: string) => (s === e ? frDayMonthShort(s) : `${frDayMonthShort(s)} → ${frDayMonthShort(e)}`)

/**
 * La cloche de la barre du haut. La pastille retombe à 0 à l'OUVERTURE du menu (décision Benoit
 * 2026-09-25). « Vidé » est rattaché à l'OBJET de données, pas à un booléen : le layout re-rend à
 * chaque navigation avec une nouvelle promesse, et une nouveauté arrivée depuis doit se revoir.
 */
export function NotificationBell({ promise }: { promise: Promise<Notifications | null> }) {
  const data = use(promise)
  const [clearedFor, setClearedFor] = useState<Notifications | null>(null)
  if (!data) return null
  const unread = clearedFor === data ? 0 : data.unread

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open || unread === 0) return
        setClearedFor(data)
        void callAction(markNotificationsSeen())
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={unread ? `${unread} nouveauté(s)` : 'Nouveautés'}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Nouveautés</DropdownMenuLabel>
        {data.items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Aucune nouveauté.</p>
        ) : (
          data.items.map((n) => (
            <DropdownMenuItem key={`${n.kind}-${n.id}`} asChild>
              <Link href={{ pathname: '/chatter/agence', query: { mois: n.startDate.slice(0, 7) } }} className="flex flex-col items-start gap-0.5">
                <span className="text-xs text-muted-foreground">{n.kind === 'reminder' ? 'C’est aujourd’hui' : 'Nouvel événement'}</span>
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{dates(n.startDate, n.endDate)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem asChild>
          <Link href="/chatter/agence" className="mt-1 justify-center text-sm font-medium">
            Tout voir dans Agence
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Brancher dans le layout**

Dans `app/(dash)/layout.tsx` :

1. Ajouter les imports :

```ts
import { NotificationBell } from '@/components/notification-bell.client'
import { getNotifications } from '@/lib/notifications/get-notifications'
```

2. Dans `DashDynamic`, après `moduleWheelPendingPromise`, lancer la cloche **sans `await`** :

```ts
  // La cloche (spec Agence 2026-09-25) : pour TOUT le monde — l'annonce d'agence concerne chacun,
  // la RLS trie par rôle. Une seule requête légère, lancée sans attendre et streamée sous Suspense
  // comme les pastilles ; `null` en cas d'échec = cloche absente, jamais une page cassée.
  const notificationsPromise = getNotifications().catch(() => null)
```

3. Dans le header, à gauche de `HeaderPeriod` :

```tsx
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<div className="size-8" />}>
              <NotificationBell promise={notificationsPromise} />
            </Suspense>
            <Suspense fallback={<div className="h-8 w-44 rounded-md border bg-muted/40" />}>
              <HeaderPeriod />
            </Suspense>
          </div>
```

- [ ] **Step 5: Typecheck, lint, tests, build**

```bash
pnpm --filter @glagency/web exec tsc --noEmit -p .
pnpm --filter @glagency/web exec eslint src/lib/notifications src/components/notification-bell.client.tsx "src/app/(dash)/layout.tsx"
pnpm --filter @glagency/web exec vitest run
pnpm --filter @glagency/web build
```

Expected : aucune erreur, build réussi.

- [ ] **Step 6: Vérification à l'écran (dev branché sur l'UAT)**

- en **admin**, publier « TEST cloche » ;
- en **chatteur** (« en tant que ») : la cloche affiche 1 ; l'ouvrir montre « Nouvel événement · TEST cloche · … » ; la ligne mène à Agence sur le bon mois ; la pastille disparaît. **Quitter le mode « en tant que »** : la ligne `agency_notification_seen` de ce chatteur **n'a pas été écrite** (Review Focus 1). Vérifier par SQL sur l'UAT : `select * from agency_notification_seen where profile_id = '<id>'` doit être vide ;
- publier un 2ᵉ événement pendant qu'une autre session de l'utilisateur reste ouverte, puis naviguer : la pastille se rallume (Review Focus 3) ;
- la cloche est présente dans les 3 parties (Chatteurs, Marketing, Formation).

- [ ] **Step 7: Commit (après accord de Benoit)**

```bash
git add apps/web/src/lib/notifications apps/web/src/components/notification-bell.client.tsx "apps/web/src/app/(dash)/layout.tsx"
git commit -m "feat(agence): la cloche des nouveautés dans la barre du haut"
```

---

### Task 7: Documentation et mise en prod

**Files:**
- Modify: `AGENTS.md` (état des migrations et règle Agence)

- [ ] **Step 1: Mettre à jour `AGENTS.md`**

Remplacer la ligne d'état des migrations par :

```markdown
**État au 2026-09-25** : prod = UAT = **0175**. **Prochaine migration = `0176`**.
```

Ajouter dans la section Règles, après le bloc « Groupes de liens marketing » :

```markdown
- **Agence** (`/chatter/agence`, `agency_*` de `0175`, spec
  `docs/superpowers/specs/2026-09-25-agence-calendrier-notifications-design.md`) : calendrier des
  événements de l'agence. **Écriture ADMIN** (service-role après garde, aucune policy d'écriture),
  **lecture pour tous** — l'item de nav porte `everyone: true` (visible sans case à cocher, jamais
  page d'atterrissage). Un événement = nom + jour ou période + rappel jour J optionnel + `audience`
  (rôles visés, tous par défaut ; RLS de lecture par rôle, admins = tout). **La cloche** de la barre
  du haut est CALCULÉE À LA VOLÉE (RPC `agency_notifications`, `security invoker`) depuis
  `agency_notification_seen.seen_at` : pas de ligne par personne, pas de robot. Rappel = 00:00
  heure de Paris du 1er jour. En « en tant que », ouvrir la cloche n'écrit rien.
```

- [ ] **Step 2: Vérification finale**

```bash
pnpm --filter @glagency/web exec tsc --noEmit -p .
pnpm --filter @glagency/web exec vitest run
pnpm --filter @glagency/web build
```

- [ ] **Step 3: Commit, push et PR (après accord de Benoit)**

```bash
git add AGENTS.md
git commit -m "docs(agents): Agence — calendrier et cloche (0175)"
git push origin develop
gh pr create --base main --head develop --title "Release — Agence : calendrier de l'agence et cloche de nouveautés" \
  --body "Onglet Agence (calendrier, écriture admin, lecture pour tous) + cloche des nouveautés dans la barre du haut. Migration 0175 à appliquer en prod AVANT le merge. Spec : docs/superpowers/specs/2026-09-25-agence-calendrier-notifications-design.md"
```

- [ ] **Step 4: Mise en prod (go explicite de Benoit requis)**

1. **Appliquer `0175` en prod AVANT le merge** : la page et la cloche lisent les nouvelles tables, et sans elles la cloche serait simplement absente, sans casser la page. Même commande qu'en Task 1, Step 2, avec l'URL pooler de la prod (`postgres.cqmfpsnqaxymswijdnfz`, mot de passe tiré de `DATABASE_URL`).
2. Merger (`git merge --no-ff develop` sur `main`, puis `main` → `develop`, cf. `docs/git-workflow.md`) et vérifier le déploiement Vercel ainsi que l'absence d'erreurs d'exécution.
