-- 0189 — Clé anti-doublon de « Préparer » (import de scripts, demande Benoit 2026-10-08).
--
-- Test réel du 2026-10-08 : un seul clic sur « Préparer » a produit DEUX préparations (deux lignes
-- script_imports à 55 s d'écart, deux conversions Claude). Le navigateur génère désormais une clé par
-- clic ; le serveur la RÉSERVE ici avant de convertir. Une copie de la requête trouve la clé déjà prise :
-- elle attend l'import de la première (import_id) au lieu d'en relancer un. Clé libérée après un échec.
-- RLS : chacun réserve, lit, complète et libère SES clés (created_by), jamais celles des autres.
create table if not exists public.script_prepare_requests (
  request_id uuid primary key,
  created_by uuid not null references public.profiles(id) on delete cascade,
  import_id uuid references public.script_imports(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.script_prepare_requests enable row level security;
comment on table public.script_prepare_requests is
  'Clés anti-doublon de « Préparer » (une par clic) → import produit (0189).';

drop policy if exists script_prepare_requests_own on public.script_prepare_requests;
create policy script_prepare_requests_own on public.script_prepare_requests for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
