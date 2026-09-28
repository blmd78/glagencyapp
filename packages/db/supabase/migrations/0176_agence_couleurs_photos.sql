-- Agence : une couleur et une photo par événement, et la légende des couleurs (demande Benoit
-- 2026-09-28).
--
-- COULEUR : palette FERMÉE — les 8 teintes validées daltonisme de `apps/web/src/lib/mkt-groups.ts`
-- (`GROUP_PALETTE`), recopiées ici pour que la base refuse toute autre valeur. `null` = le gris
-- neutre d'avant : les événements existants ne changent pas d'apparence.
--
-- LÉGENDE : le nom de chaque couleur, réglé une fois par un admin ; une couleur sans nom n'y
-- figure pas. Lisible par tout compte connecté (aucune donnée sensible), écrite en service-role
-- après la garde admin, comme `agency_events`.
--
-- PHOTO : bucket Storage PRIVÉ `agency-events`, 5 Mo maximum, JPEG / PNG / WebP seulement (SVG
-- exclu : il peut embarquer du script). Aucune policy sur `storage.objects` : l'envoi passe par une
-- URL d'upload signée délivrée par une Server Action admin, et la lecture par des URLs signées
-- générées côté serveur pour les seuls événements que la RLS de `agency_events` rend à l'appelant —
-- une photo suit donc « Visible par ». `image_path` = la clé de l'objet dans le bucket.

alter table public.agency_events
  add column if not exists color text,
  add column if not exists image_path text;

alter table public.agency_events
  add constraint agency_events_color check (
    color is null
    or color in ('#8b5cf6','#ec4899','#06b6d4','#ca8a04','#059669','#ea580c','#3b82f6','#65a30d')
  ),
  add constraint agency_events_image_path check (
    image_path is null or image_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
  );

create table if not exists public.agency_legend (
  color      text primary key check (
    color in ('#8b5cf6','#ec4899','#06b6d4','#ca8a04','#059669','#ea580c','#3b82f6','#65a30d')
  ),
  label      text not null check (length(btrim(label)) between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.agency_legend enable row level security;

-- LECTURE : tout compte connecté. AUCUNE policy d'écriture (service-role après garde admin).
create policy agency_legend_read on public.agency_legend
  for select to authenticated
  using (true);

grant select on public.agency_legend to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-events', 'agency-events', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
