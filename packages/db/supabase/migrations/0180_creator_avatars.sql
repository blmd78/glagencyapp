-- 0180 — Photos des modèles (spec docs/superpowers/specs/2026-10-02-photos-modeles-agence-design.md,
-- partie A).
--
-- MyPuls sert la photo de chaque modèle (`/creator/<mypuls_creator_id>/avatar`, WebP 100 × 100) ;
-- le script `pnpm --filter @glagency/ingestion avatars` la récupère UNE fois et la range ici. Pas de
-- cron : on relance le script quand une nouvelle modèle arrive.
--
-- `avatar_path` = clé de l'objet dans le bucket ; null = pas (encore) de photo.
-- Bucket PRIVÉ, sans policy sur storage.objects : écriture en service-role (le script), lecture
-- par URLs signées générées côté serveur — même patron que `agency-events` (0176).
--
-- Prend 0180 avant le chantier « identité chatteur MyPuls » (décision Benoit 2026-10-02) : ce
-- chantier prendra le numéro libre suivant.

alter table public.creators add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-avatars', 'creator-avatars', false, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
