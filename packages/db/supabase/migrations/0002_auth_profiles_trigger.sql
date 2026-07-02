-- 0002 — Provisioning automatique du profil applicatif à la création d'un compte.
-- Sans ce trigger, un utilisateur créé dans auth.users n'a AUCUNE ligne dans
-- public.profiles -> pas de rôle, pas d'accès. Le trigger comble ce trou et
-- attribue le rôle 'admin' aux e-mails de l'allowlist (les autres = 'member').

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    case
      when lower(new.email) in ('blmd8345@gmail.com', 'glbagencyy@gmail.com')
        then 'admin'::app_role
      else 'member'::app_role
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
