-- has_page() : le superadmin hérite de tout, comme dans is_admin() (le rôle a été
-- introduit avec is_admin() mis à jour, mais has_page() avait été oublié → les policies
-- « has_page(slug) AND ... » renvoyaient 0 ligne aux superadmins).
create or replace function public.has_page(slug text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (role in ('admin', 'superadmin') or slug = any(pages))
  )
$$;
