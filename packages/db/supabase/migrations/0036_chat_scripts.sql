-- 0036 — Scripts de chat par modèle (page « Scripts », face chatteurs).
-- Un script = la séquence ORDONNÉE d'items d'un modèle : messages copiables (label en
-- badge, ex. « MESSAGE 8 • 10€ »), notes d'attente (grises), avertissements (ambre),
-- titres de section. Source : docs « Scripts Mym » des modèles, migrés dans le CRM.
-- Lecture : admin ou modèle assigné (profile_creators) ; écriture admin uniquement —
-- les membres consultent/copient, seuls les admins font évoluer le funnel.

create table script_items (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  -- Ordre d'affichage (espacé de 10 au seed pour insérer sans tout renuméroter).
  position   integer not null default 0,
  kind       text not null default 'message' check (kind in ('section', 'message', 'note', 'warn')),
  label      text not null default '',
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
create index script_items_creator_idx on script_items (creator_id, position);

alter table script_items enable row level security;

create policy script_items_scoped_read on script_items for select to authenticated
  using (public.is_admin() or exists (
    select 1 from profile_creators pc
    where pc.profile_id = (select auth.uid()) and pc.creator_id = script_items.creator_id));
create policy script_items_admin_ins on script_items for insert to authenticated
  with check (public.is_admin());
create policy script_items_admin_upd on script_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy script_items_admin_del on script_items for delete to authenticated
  using (public.is_admin());
