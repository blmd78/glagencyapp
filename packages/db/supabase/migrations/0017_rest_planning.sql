-- 0017 — Planning des jours de repos (reprend la Google Sheet hebdo de l'agence) :
-- une cellule = (semaine, jour, colonne d'équipe) → prénoms en texte libre.
-- Accès par le système de pages (profiles.pages) : la page `repos` est cochable
-- dans la gestion des membres → les sous-managers qui l'ont peuvent lire ET écrire.

create table rest_planning_cells (
  week_start date not null,                       -- lundi de la semaine
  day        smallint not null check (day between 0 and 6),  -- 0 = lundi … 6 = dimanche
  col        text not null,                       -- clé de colonne (groupes de modèles / encadrement)
  names      text not null default '',            -- prénoms, texte libre (comme la sheet)
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  primary key (week_start, day, col)
);
create index rest_planning_cells_week_idx on rest_planning_cells (week_start);

create table rest_planning_weeks (
  week_start    date primary key,
  sent_telegram boolean not null default false,   -- « Planning envoyé sur Telegram ? »
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles(id) on delete set null
);

-- ── RLS : admin, ou utilisateur ayant la page `repos` dans ses droits.
create or replace function public.has_page(slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (role = 'admin' or slug = any (pages))
  );
$$;
revoke all on function public.has_page(text) from public;
grant execute on function public.has_page(text) to authenticated;

alter table rest_planning_cells enable row level security;
alter table rest_planning_weeks enable row level security;

create policy rest_cells_read  on rest_planning_cells for select to authenticated using (public.has_page('repos'));
create policy rest_cells_write on rest_planning_cells for insert to authenticated with check (public.has_page('repos'));
create policy rest_cells_update on rest_planning_cells for update to authenticated
  using (public.has_page('repos')) with check (public.has_page('repos'));
create policy rest_weeks_read  on rest_planning_weeks for select to authenticated using (public.has_page('repos'));
create policy rest_weeks_write on rest_planning_weeks for insert to authenticated with check (public.has_page('repos'));
create policy rest_weeks_update on rest_planning_weeks for update to authenticated
  using (public.has_page('repos')) with check (public.has_page('repos'));
