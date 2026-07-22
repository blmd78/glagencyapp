-- 0079 — Lien membre↔chatteur. Chaque membre (profiles role chatteur) pointe SON chatteur MyPuls
-- (chatters). 1↔1 : `unique` garantit qu'un chatteur est lié à au plus un membre. `on delete set
-- null` : si le chatteur MyPuls disparaît, le lien se vide sans casser le membre. Permet de LIRE le
-- closing (role/team, colonnes 0077) du membre depuis la page Chatteurs et Spenders. Écriture du
-- lien = admin/superadmin (garde applicative) ; la colonne suit la RLS row-level existante de profiles.
alter table public.profiles
  add column chatter_id uuid unique references public.chatters(id) on delete set null;

-- Backfill : relier automatiquement les membres dont le match par nom est SANS AMBIGUÏTÉ dans les
-- deux sens (le membre matche exactement 1 chatteur ET ce chatteur matche exactement 1 membre).
-- Les ambigus / sans-match restent null (traités au sélecteur manuel admin). Jamais de doublon → ne
-- viole pas `unique`.
update public.profiles p set chatter_id = c.id
from public.chatters c
where p.role = 'chatteur' and p.chatter_id is null
  and lower(trim(p.display_name)) = lower(trim(c.display_name))
  and (select count(*) from public.chatters c2
       where lower(trim(c2.display_name)) = lower(trim(p.display_name))) = 1
  and (select count(*) from public.profiles p2
       where p2.role = 'chatteur' and lower(trim(p2.display_name)) = lower(trim(c.display_name))) = 1;
