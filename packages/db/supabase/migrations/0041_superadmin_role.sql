-- Rôle SUPERADMIN — hiérarchie : superadmin ⊃ admin ⊃ user.
-- NB : en prod, profiles.role est du TEXTE avec CHECK ('admin'/'manager'/'user') — les
-- fichiers 0001/0002 (enum app_role) divergent du schéma réellement appliqué.
-- Décision produit : seuls les superadmins gèrent les MEMBRES (rôles, pages, accès) ;
-- pour tout le reste, superadmin = admin (les admins existants ne perdent rien d'autre).

-- 0) Le CHECK sur role s'élargit d'abord (il bloquait la nouvelle valeur).
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role = any (array['superadmin'::text, 'admin'::text, 'manager'::text, 'user'::text]));

-- 1) Les deux propriétaires passent superadmin.
update profiles set role = 'superadmin'
where lower(email) in ('blmd8345@gmail.com', 'glbagencyy@gmail.com');

-- 2) is_admin() = LE point central de toutes les policies RLS admin :
--    superadmin y hérite de tout — aucune policy existante à réécrire.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'superadmin'));
$$;

-- 3) Nouveau point central pour ce qui est réservé aux propriétaires.
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin');
$$;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- 4) Écriture sur profiles (rôles/pages/liens) : superadmin UNIQUEMENT — ferme la porte
--    à l'auto-promotion d'un admin via l'API PostgREST (l'app passe par le service-role,
--    gardé par requireSuperadmin ; ceci est la ceinture au niveau base).
drop policy if exists profiles_admin_write on profiles;
create policy profiles_superadmin_write on profiles for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- 5) Inscription : les deux propriétaires arrivent directement superadmin (le trigger
--    live nommait déjà exactement ces deux emails comme admins automatiques).
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
      else 'user'
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
