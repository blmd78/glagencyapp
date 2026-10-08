-- 0187 — Verrou d'envoi des scripts MyPuls (revue croisée du 2026-10-07 de l'import de scripts).
--
-- Tous les envois du CRM partagent la session MyPuls « scripts » (ingest_session id = 'scripts'), et
-- `switchCreator` y change la modèle COURANTE de la session : deux envois simultanés (deux managers,
-- deux modèles) pouvaient déposer un script chez la mauvaise modèle. Un seul envoi à la fois :
--   - une ligne unique `scripts`, son détenteur (l'import en cours) et l'heure de prise ;
--   - prise atomique (un seul UPDATE conditionnel) ; un verrou abandonné (envoi coupé par la durée
--     maximale Vercel, 800 s) est repris au-delà de 15 min — même seuil que « interrompu » à l'écran ;
--   - rendu par son seul détenteur ;
--   - service role uniquement (RLS sans policy, fonctions retirées à public / anon / authenticated).
create table if not exists public.script_send_lock (
  id text primary key default 'scripts' check (id = 'scripts'),
  holder uuid,
  acquired_at timestamptz
);
alter table public.script_send_lock enable row level security;
insert into public.script_send_lock (id) values ('scripts') on conflict (id) do nothing;

create or replace function public.acquire_script_send_lock(p_holder uuid)
returns boolean
language sql
set search_path = public, pg_temp
as $$
  with taken as (
    update public.script_send_lock
       set holder = p_holder, acquired_at = now()
     where id = 'scripts'
       and (holder is null or acquired_at < now() - interval '15 minutes')
    returning 1
  )
  select exists (select 1 from taken)
$$;

create or replace function public.release_script_send_lock(p_holder uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.script_send_lock
     set holder = null, acquired_at = null
   where id = 'scripts' and holder = p_holder
$$;

revoke all on function public.acquire_script_send_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_script_send_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_script_send_lock(uuid) to service_role;
grant execute on function public.release_script_send_lock(uuid) to service_role;
