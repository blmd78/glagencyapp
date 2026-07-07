-- 0022 — Planning repos : compo des colonnes = MODÈLES (creators) + cellules = chatteurs en IDs.
--
-- Une colonne (g1…g6) est un groupe de MODÈLES (creators). Sa compo est datée
-- (effective_from = lundi) et LOCALE au planning (ne touche jamais creators/chatters/team_id).
-- Édition réservée admin (is_admin, cf. 0008). Les cellules (chatteurs au repos) passent en
-- chatter_ids[] (fallback names texte conservé pour l'encadrement hors-liste).

-- 1) Compo datée des colonnes = modèles (creators)
create table rest_planning_column_members (
  col            text not null,                 -- g1…g6 (jamais managers/policiers)
  effective_from date not null,                 -- lundi à partir duquel la compo s'applique
  creator_ids    uuid[] not null default '{}',  -- modèles (creators) de la colonne
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id) on delete set null,
  primary key (col, effective_from)
);

alter table rest_planning_column_members enable row level security;

-- Lecture : tous ceux qui voient le planning (admins + page `repos`).
create policy rest_colmembers_read on rest_planning_column_members
  for select to authenticated using (public.has_page('repos'));

-- Écriture : admin uniquement.
create policy rest_colmembers_write on rest_planning_column_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed initial : compo actuelle (codée en dur) parsée en creator_id, effective_from = semaine
-- existante, pour que le header affiche des chips dès la prod. IDs vérifiés (1 creator actif).
insert into rest_planning_column_members (col, effective_from, creator_ids) values
  ('g1','2026-07-06', array['67996f82-bc4a-5bfc-8dbb-dbb7c8e2d69e','07911c5d-b2cd-5871-9305-e27d2ef33c82','1c16f17e-1361-5212-8ca1-18608a2904ba']::uuid[]),
  ('g2','2026-07-06', array['42b117eb-a6ba-5b1e-9ef9-9f81f9c7bcae','53c0bcf5-75ba-57d3-8176-669a623a938f']::uuid[]),
  ('g3','2026-07-06', array['7d37f916-8691-53af-be62-0f136e6ef7f4','43e41213-bb5a-5d8d-b248-ee8a7a5ad3dd','04bc4ce2-352e-5994-b6ca-5f5c6d6c29d5']::uuid[]),
  ('g4','2026-07-06', array['90522f8b-8b13-58c1-97e9-4bf3ecf312be']::uuid[]),
  ('g5','2026-07-06', array['2dd21463-b8e8-5804-98e6-e45abf3e0d96','c5c04147-2fc7-5878-ace3-0d2eff26602f']::uuid[]),
  ('g6','2026-07-06', array['64a0afb3-a71f-59a9-99e7-bc4a001ed1f6','3b2606d5-d53e-5079-8c6c-10cb79588390']::uuid[]);

-- 2) Cellules : ajout des IDs chatteurs (on garde names pour l'existant / encadrement hors-liste)
alter table rest_planning_cells add column chatter_ids uuid[] not null default '{}';

-- 3) Backfill de la seule semaine existante (2026-07-06), colonnes modèles g1…g6.
--    Résolution par token : override explicite > 1 chatteur actif par display_name >
--    1 chatteur par alias. Couvre 129/129 pseudos. managers/policiers non touchés.
with tokens as (
  select c.week_start, c.day, c.col, trim(t) as tok, ord
  from rest_planning_cells c,
       lateral unnest(string_to_array(c.names, ',')) with ordinality as u(t, ord)
  where c.week_start = date '2026-07-06'
    and c.col in ('g1','g2','g3','g4','g5','g6')
    and coalesce(trim(c.names),'') <> ''
),
override(tok, cid) as (values
  ('Ahmed','e1c47f4a-1bd6-5043-b7f1-148a6b03f5e4'::uuid),
  ('Angela','4e1f8871-935b-5db0-876f-7dbb417c35e3'),
  ('Josaphat','3d8b0f54-edd5-5fed-b338-36e523135efb'),
  ('Lina','bdc34370-bbee-537e-a44f-e3c9c52d08d8'),
  ('Soa Ni','72c4fb05-679a-52f9-b1b3-76545a88ae88'),
  ('Volana Zoely','b4d06da5-2d46-516c-8c2f-ee0a69b192a7'),
  ('Gédeon','c88e3377-47c5-42b3-bfcf-8ede709ed629'),
  ('workhard','a4c2f416-bcba-55bf-a60c-41cbaed680fb'),
  ('Jaureskpd','1f074af5-0994-46c9-86dc-f90071c86995'),
  ('Eriely','68647276-ae2c-5aa7-b3dc-347a0b994916'),
  ('Ornella','51457d88-b78e-5358-ae0f-0985459d100d'),
  ('Rockie','627422c1-e461-4c90-aedd-69faeebe0e3a'),
  ('Leonard','f4b1bbf6-e791-5128-9398-169a7f487644'),
  ('Osirix','26dae017-1a1d-5d6b-9357-39cde06be43f'),
  ('Princy','dbfb3ef7-8122-5c6d-87e1-2f99be217fd5'),
  ('Flo','482fdf30-7fe6-5205-b6be-c6e0ac6b9309'),
  ('Tsilavo','586fec9f-32d9-5c49-a216-a8da4bfd9e26')
),
resolved as (
  select tk.week_start, tk.day, tk.col, tk.ord, tk.tok,
    coalesce(
      (select o.cid from override o where lower(o.tok) = lower(tk.tok)),
      (select (array_agg(ch.id order by ch.id))[1]
         from chatters ch
         where ch.active and lower(trim(ch.display_name)) = lower(tk.tok)
         having count(*) = 1),
      (select (array_agg(distinct a.chatter_id))[1]
         from chatter_alias a
         where lower(trim(a.raw_label)) = lower(tk.tok)
            or a.raw_label_norm = lower(regexp_replace(tk.tok, '[^[:alnum:]]', '', 'g'))
         having count(distinct a.chatter_id) = 1)
    ) as cid
  from tokens tk
),
agg as (
  select week_start, day, col,
         array_agg(cid order by ord) filter (where cid is not null) as ids,
         string_agg(tok, ', ' order by ord) filter (where cid is null) as leftover
  from resolved
  group by week_start, day, col
)
update rest_planning_cells c
set chatter_ids = coalesce(a.ids, '{}'),
    names       = coalesce(a.leftover, '')
from agg a
where c.week_start = a.week_start and c.day = a.day and c.col = a.col;
