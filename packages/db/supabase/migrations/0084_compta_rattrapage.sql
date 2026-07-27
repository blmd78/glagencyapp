-- 0084 — RATTRAPAGE : inscrit la compta dans l'historique des migrations.
--
-- Les 6 tables `compta_*` et la fonction `chatter_first_seen()` ont été créées À LA MAIN en
-- production, hors migration. Les migrations 0018/0055/0057/0060 les référencent déjà (index,
-- policies) sans jamais les créer : rejouer l'historique depuis zéro échouait donc, et une base
-- neuve était impossible à reconstruire. Cette migration comble le trou.
--
-- ÉTAT VÉRIFIÉ le 2026-07-27 : prod et UAT sont structurellement IDENTIQUES sur ce périmètre
-- (colonnes, types, défauts, contraintes, index, policies et corps de fonction — diff à vide
-- sur les six). Le DDL ci-dessous est extrait de la PROD via les catalogues (`pg_constraint`,
-- `pg_indexes`, `pg_policies`, `pg_get_functiondef`) et reproduit l'existant à l'identique.
-- Corollaire : sur prod comme sur UAT, appliquer cette migration ne DOIT rien changer — elle
-- ne fait que se faire enregistrer dans `schema_migrations`. Tout est donc idempotent.
--
-- ⚠️ Reproduit fidèlement deux choix discutables de l'existant, à NE PAS « corriger » ici sous
-- peine de casser la prod : `compta_primes.amount` et `compta_debts.amount` sont du `text`
-- (« 100 € ») et non du numérique. Si ça doit changer, ce sera une migration de conversion
-- dédiée, avec reprise des données.

-- ── Tables ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.compta_settings (
  chatter_id   uuid primary key references public.chatters(id) on delete cascade,
  mode         text not null default 'percent' check (mode = any (array['percent'::text, 'fixed'::text])),
  rate         numeric(5,2) not null default 10,
  fixed_amount numeric(10,2) not null default 0,
  is_setter    boolean not null default false,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

create table if not exists public.compta_primes (
  chatter_id uuid primary key references public.chatters(id) on delete cascade,
  amount     text not null default '100 €'::text,
  status     text not null default 'due' check (status = any (array['due'::text, 'paid'::text, 'skipped'::text])),
  paid_at    date,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.compta_day_entries (
  chatter_id uuid not null references public.chatters(id) on delete cascade,
  date       date not null,
  bonus      numeric(10,2) not null default 0,
  malus      numeric(10,2) not null default 0,
  handoffs   integer not null default 0,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (chatter_id, date)
);

create table if not exists public.compta_week_entries (
  chatter_id   uuid not null references public.chatters(id) on delete cascade,
  week_start   date not null,
  bonus        numeric(10,2) not null default 0,
  malus        numeric(10,2) not null default 0,
  handoffs     integer not null default 0,
  fixe_setter  numeric(10,2) not null default 0,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null,
  primary key (chatter_id, week_start)
);

create table if not exists public.compta_payments (
  id           uuid primary key default gen_random_uuid(),
  chatter_id   uuid not null references public.chatters(id) on delete cascade,
  month        date not null,
  amount       numeric(10,2) not null,
  paid_at      date not null default current_date,
  paid_by      uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  -- Jours couverts par ce paiement (rapprochement avec compta_day_entries).
  covered_days date[]
);

-- Pas de FK vers `chatters` : une dette peut viser quelqu'un qui n'est pas (ou plus) chatteur,
-- d'où `name`/`model` en texte libre. Conforme à l'existant.
create table if not exists public.compta_debts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  model      text,
  amount     text not null,
  settled    boolean not null default false,
  settled_at date,
  note       text,
  created_at timestamptz not null default now()
);

-- ── Index (hors PK, créés par la contrainte) ─────────────────────────────────────────────
-- Ceux sur `updated_by`/`paid_by` existent déjà via 0055 (`if not exists`) — répétés ici pour
-- qu'une base RECONSTRUITE depuis zéro les ait même si 0055 passe avant.

create index if not exists compta_day_entries_date_idx        on public.compta_day_entries (date);
create index if not exists compta_day_entries_updated_by_idx  on public.compta_day_entries (updated_by);
create index if not exists compta_week_entries_updated_by_idx on public.compta_week_entries (updated_by);
create index if not exists compta_settings_updated_by_idx     on public.compta_settings (updated_by);
create index if not exists compta_primes_updated_by_idx       on public.compta_primes (updated_by);
create index if not exists compta_payments_chatter_id_idx     on public.compta_payments (chatter_id);
create index if not exists compta_payments_month_idx          on public.compta_payments (month);
create index if not exists compta_payments_paid_by_idx        on public.compta_payments (paid_by);

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────
-- Deux régimes : admin = tout ; porteur du droit de page `compta` = lecture, et écriture
-- seulement sur les saisies jour/semaine. Réglages, primes, paiements et dettes restent
-- admin-only en écriture. `(select is_admin())` / `(select has_page(...))` : forme scalarisée
-- posée par 0057 (initplan), conservée telle quelle.

alter table public.compta_settings     enable row level security;
alter table public.compta_primes       enable row level security;
alter table public.compta_day_entries  enable row level security;
alter table public.compta_week_entries enable row level security;
alter table public.compta_payments     enable row level security;
alter table public.compta_debts        enable row level security;

-- `drop ... if exists` puis `create` : `create policy` n'a pas d'`if not exists`, et la
-- migration doit pouvoir passer sur une base où les policies existent déjà (prod, UAT). La
-- migration tourne dans une transaction — aucune fenêtre sans policy visible de l'extérieur.

drop policy if exists compta_settings_admin_all on public.compta_settings;
create policy compta_settings_admin_all on public.compta_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_primes_admin_all on public.compta_primes;
create policy compta_primes_admin_all on public.compta_primes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_week_entries_admin_all on public.compta_week_entries;
create policy compta_week_entries_admin_all on public.compta_week_entries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_payments_admin_all on public.compta_payments;
create policy compta_payments_admin_all on public.compta_payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists compta_debts_admin_all on public.compta_debts;
create policy compta_debts_admin_all on public.compta_debts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists day_entries_admin_all on public.compta_day_entries;
create policy day_entries_admin_all on public.compta_day_entries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists day_entries_member_read on public.compta_day_entries;
create policy day_entries_member_read on public.compta_day_entries for select to authenticated
  using ((select public.has_page('compta'::text)));

drop policy if exists day_entries_member_insert on public.compta_day_entries;
create policy day_entries_member_insert on public.compta_day_entries for insert to authenticated
  with check ((select public.has_page('compta'::text)));

drop policy if exists day_entries_member_update on public.compta_day_entries;
create policy day_entries_member_update on public.compta_day_entries for update to authenticated
  using ((select public.has_page('compta'::text))) with check ((select public.has_page('compta'::text)));

drop policy if exists week_entries_member_read on public.compta_week_entries;
create policy week_entries_member_read on public.compta_week_entries for select to authenticated
  using ((select public.has_page('compta'::text)));

drop policy if exists week_entries_member_insert on public.compta_week_entries;
create policy week_entries_member_insert on public.compta_week_entries for insert to authenticated
  with check ((select public.has_page('compta'::text)));

drop policy if exists week_entries_member_update on public.compta_week_entries;
create policy week_entries_member_update on public.compta_week_entries for update to authenticated
  using ((select public.has_page('compta'::text))) with check ((select public.has_page('compta'::text)));

drop policy if exists payments_member_read on public.compta_payments;
create policy payments_member_read on public.compta_payments for select to authenticated
  using ((select public.has_page('compta'::text)));

-- ── Fonction ─────────────────────────────────────────────────────────────────────────────
-- Premier jour de données MyPuls par chatteur — sert à ne pas facturer un chatteur avant son
-- arrivée. `stable` + `search_path` figé, conforme à l'existant en prod.

create or replace function public.chatter_first_seen()
returns table(chatter_id uuid, first_seen date)
language sql
stable
set search_path to 'public'
as $function$
  select chatter_id, min(date) from chatter_daily group by chatter_id
$function$;
