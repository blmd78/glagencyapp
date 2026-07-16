-- 0053 — Comptes rendus journaliers (page « Dashboard », face chatteurs).
-- Un compte rendu texte libre PAR PERSONNE ET PAR JOUR (unique — l'app upsert).
-- Lecture : chacun LE SIEN (admin compris), superadmin tout.
-- Écriture : le sien uniquement, si droit de page `dashboard` — les admins passent
-- d'office via is_admin(). NB : is_admin() couvre le superadmin (0041) et neutralise
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
