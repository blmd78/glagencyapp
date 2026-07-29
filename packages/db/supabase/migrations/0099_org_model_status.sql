-- 0099 — Organisation : STATUT par ligne modèle (✅ validé / ⭐ / ⚠️), la seule donnée de
-- l'onglet Organisation qui n'existe nulle part ailleurs (tout le reste est dérivé de
-- Membres/Chatters). Convention repo : text + check, jamais d'enum.
create table public.org_model_status (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  status     text check (status in ('valide', 'star', 'attention')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index org_model_status_updated_by_idx on public.org_model_status (updated_by);

alter table public.org_model_status enable row level security;
-- Lecture : porteurs de la page Organisation (has_page inclut les admins).
create policy org_status_read on public.org_model_status for select to authenticated
  using ((select public.has_page('organisation')));
-- Écriture : admin uniquement (le board s'édite en admin, v1).
create policy org_status_write on public.org_model_status for insert to authenticated
  with check ((select public.is_admin()));
create policy org_status_update on public.org_model_status for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
