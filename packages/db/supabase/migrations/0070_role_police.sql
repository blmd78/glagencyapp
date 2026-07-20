-- 0070 — Rôle applicatif `police` : FONCTIONNEL, pas hiérarchique. Consulte + écrit SON
-- tracker (table `police_entries`), lecture seule partout ailleurs (pas de droit
-- is_admin/is_manager posé par ce rôle). Reprend EXACTEMENT la liste de 0059 + `police`.
-- Additif : CHECK élargi, aucune donnée existante modifiée. Convention projet : text + check,
-- jamais d'enum. Migration ENTIÈREMENT idempotente (rejouable sans erreur).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role = any (array[
    'superadmin'::text, 'admin'::text, 'manager'::text,
    'sous-manager'::text, 'chatteur'::text, 'police'::text,
    'user'::text  -- TRANSITOIRE (0059) — toujours pas retiré, hors périmètre de cette migration
  ]));

-- is_police() : même patron que is_admin()/is_manager() (0008/0054/0059) — security definer
-- (évite d'empiler l'évaluation RLS de `profiles` dans les policies des autres tables),
-- stable, search_path figé.
create or replace function public.is_police()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'police'
  );
$$;
revoke all on function public.is_police() from public;
grant execute on function public.is_police() to authenticated;

-- Écriture `police_entries` : ADDITIF — admin/manager/sous-manager gardent leur droit
-- (`can_write_page('police')`, posé par 0060), on AJOUTE le rôle fonctionnel `police`
-- lui-même (`is_police() and has_page('police')`) — un chatteur reste exclu des deux
-- branches. `police_read` (has_page seul) et `police_delete` (is_admin seul) INCHANGÉES.
drop policy if exists police_insert on police_entries;
create policy police_insert on police_entries for insert to authenticated
  with check (
    public.can_write_page('police')
    or (public.is_police() and public.has_page('police'))
  );

drop policy if exists police_update on police_entries;
create policy police_update on police_entries for update to authenticated
  using (
    public.can_write_page('police')
    or (public.is_police() and public.has_page('police'))
  )
  with check (
    public.can_write_page('police')
    or (public.is_police() and public.has_page('police'))
  );
