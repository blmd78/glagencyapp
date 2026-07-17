-- 0059 — Rôles : renommage `user` → `chatteur` + nouveau rôle `sous-manager`.
--
-- `sous-manager` = mêmes droits qu'un `manager` POUR L'INSTANT (page Membres, lecture de
-- SON équipe), mais stocké comme valeur DISTINCTE → un futur cloisonnement plus fin sera
-- possible sans re-migrer les données.
--
-- Sûreté de déploiement (prod) : le CHECK autorise TRANSITOIREMENT `user` ET `chatteur`.
-- Ça couvre la fenêtre « migration appliquée mais app pas encore déployée » (l'ancienne app
-- écrit encore `user`, la nouvelle écrit `chatteur`) → aucune violation de contrainte quel
-- que soit l'ordre. Une migration ultérieure retirera `user` une fois l'app 100 % déployée.
-- Convention projet : `text` + `check`, jamais d'enum.

-- 1) CHECK élargi : ajoute `sous-manager` + `chatteur`, garde `user` (transitoire).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role = any (array[
    'superadmin'::text, 'admin'::text, 'manager'::text,
    'sous-manager'::text, 'chatteur'::text,
    'user'::text  -- TRANSITOIRE — à retirer dans une migration ultérieure post-déploiement
  ]));

-- 2) Migration des données existantes : user → chatteur.
update profiles set role = 'chatteur' where role = 'user';

-- 3) DEFAULT de colonne : `user` → `chatteur` (posé en 0008, jamais re-touché depuis).
alter table profiles alter column role set default 'chatteur';

-- 4) Trigger d'inscription : défaut `user` → `chatteur`. Définition répliquée à l'identique
--    de 0041 (security definer + search_path public), seul le `else` change.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, email)
  values (
    new.id,
    case
      when lower(new.email) in ('blmd8345@gmail.com', 'glbagencyy@gmail.com')
        then 'superadmin'
      else 'chatteur'
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5) is_manager() inclut `sous-manager` → il hérite des droits manager (page Membres,
--    lecture de SON équipe rattachée). Définition répliquée à l'identique de 0054, seule la
--    condition de rôle change. `manages()` reste basée sur manager_id (inchangée).
create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('manager', 'sous-manager')
  );
$$;
-- create or replace préserve l'ACL de 0054 (revoke public / grant authenticated) ;
-- on la ré-affirme par sûreté (idempotent).
revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to authenticated;
