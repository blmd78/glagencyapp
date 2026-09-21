-- Chantier Uncove analytics (spec docs/superpowers/specs/2026-09-21-uncove-analytics-design.md).
-- Comptes créatrices Uncove ajoutés MANUELLEMENT (coller un user_token capturé après un login
-- humain — le login Uncove est sous Turnstile, pas rejouable côté serveur ; le JWT, lui, est
-- longue durée). Relevé quotidien Subs + CA par compte. Slug de page « uncove » (face Chatteurs).
-- Écritures = service-role après garde admin dans les Server Actions ; RLS = LECTURE seule
-- (has_page('uncove') / admin). Le token vit dans une table SÉPARÉE admin-only, jamais lisible
-- côté client (même parti pris que training_*_secrets, cf. 0113).

-- 1) Comptes (sans secret) — lisibles par les porteurs de la page.
create table if not exists public.uncove_accounts (
  id             uuid primary key default gen_random_uuid(),
  label          text not null default '',
  uncove_user_id text not null,                       -- « users/7157370201 » (extrait du JWT)
  currency       text not null default 'eur',
  status         text not null default 'ok' check (status in ('ok', 'reconnect')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null
);
create unique index if not exists uncove_accounts_user_id_key on public.uncove_accounts(uncove_user_id);

alter table public.uncove_accounts enable row level security;
create policy uncove_accounts_read on public.uncove_accounts for select to authenticated
  using (public.is_admin() or public.has_page('uncove'));
-- Insert/update/delete : service-role uniquement (aucune policy authenticated → RLS refuse).

-- 2) Token chiffré (AES via lib/snap-crypto.ts) — table SÉPARÉE admin-only, jamais côté client.
create table if not exists public.uncove_account_tokens (
  account_id      uuid primary key references public.uncove_accounts(id) on delete cascade,
  token_encrypted text not null,
  updated_at      timestamptz not null default now()
);
alter table public.uncove_account_tokens enable row level security;
create policy uncove_account_tokens_admin on public.uncove_account_tokens for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3) Relevé quotidien par compte : Subs (new/canceled/current) + CA (revenue, devise du compte).
create table if not exists public.uncove_daily (
  account_id    uuid not null references public.uncove_accounts(id) on delete cascade,
  day           date not null,
  subs_new      integer not null default 0,
  subs_canceled integer not null default 0,
  subs_current  integer not null default 0,
  revenue       numeric not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (account_id, day)
);
alter table public.uncove_daily enable row level security;
create policy uncove_daily_read on public.uncove_daily for select to authenticated
  using (public.is_admin() or public.has_page('uncove'));
-- Écritures : service-role uniquement.
