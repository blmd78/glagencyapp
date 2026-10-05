-- 0179 — Trafic LinkScale (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md).
--
-- Un lien LinkScale (lien de bio) = une ligne de `mkt_ls_links`, identifiée par son id LinkScale.
-- L'attribution (modèle, réseau, compte Instagram, opérateur X) est DÉDUITE par le relevé depuis la
-- note et le dossier ; `manual = true` la fige (correction depuis Marketing › Trafic) : le relevé
-- nocturne n'y touche plus. `kind = 'inconnu'` = vu dans les stats mais absent de la liste
-- (lien supprimé côté LinkScale) : son trafic reste.
--
-- `mkt_ls_daily` : une ligne par lien et par jour (heure de Paris). `visitors` = visiteurs humains
-- uniques du jour ; `mym_clicks` = clics de boutons vers mym.fans, NULL pour une redirection
-- directe (aucun bouton : rien à compter, et surtout pas un faux zéro).
--
-- Même porte que le reste des tables marketing (0018, resserrée en 0060 ; patron 0170). Le relevé
-- écrit en service-role.

create table if not exists public.mkt_ls_links (
  id                uuid primary key default gen_random_uuid(),
  ls_id             text not null unique,
  url               text not null default '',
  note              text not null default '',
  folders           text[] not null default '{}',
  kind              text not null default 'inconnu'
                    check (kind in ('landing', 'redirect', 'shortcut', 'inconnu')),
  destination       text,
  creator_id        uuid references public.creators(id) on delete set null,
  platform          text not null default 'autre'
                    check (platform in ('x', 'instagram', 'threads', 'snapchat', 'autre')),
  social_account_id uuid references public.mkt_social_accounts(id) on delete set null,
  operator          text,
  manual            boolean not null default false,
  first_seen        date,
  last_seen         date,
  created_at        timestamptz not null default now()
);
create index if not exists mkt_ls_links_creator_idx on public.mkt_ls_links (creator_id);
create index if not exists mkt_ls_links_account_idx on public.mkt_ls_links (social_account_id);

create table if not exists public.mkt_ls_daily (
  link_id    uuid not null references public.mkt_ls_links(id) on delete cascade,
  date       date not null,
  visitors   integer not null default 0 check (visitors >= 0),
  bots       integer not null default 0 check (bots >= 0),
  mym_clicks integer check (mym_clicks >= 0),
  primary key (link_id, date)
);
create index if not exists mkt_ls_daily_date_idx on public.mkt_ls_daily (date);

alter table public.mkt_ls_links enable row level security;
create policy mkt_ls_links_all on public.mkt_ls_links for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));

alter table public.mkt_ls_daily enable row level security;
create policy mkt_ls_daily_all on public.mkt_ls_daily for all to authenticated
  using ((select public.can_write_page('marketing'::text)))
  with check ((select public.can_write_page('marketing'::text)));
