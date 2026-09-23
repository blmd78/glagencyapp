-- 0172 — Les RÉSEAUX de chaque modèle, lisibles côté Chatteurs (Équipe › Sources de trafic).
-- Demande Benoit 2026-09-23 : « affiche tous les modèles, toutes les sources » — pas seulement
-- celles qui ont une note.
--
-- Savoir qu'une modèle a des liens Instagram exige de lire `mkt_links`, fermée aux chatteurs (et
-- qui doit le rester : noms et URLs des liens, activité). Cette fonction ne rend QUE les couples
-- (modèle, groupe) — rien sur les liens eux-mêmes.
--
-- `security definer` parce que la RLS de `mkt_links` refuserait tout ; le cloisonnement est donc
-- ÉCRIT ICI, MIROIR EXACT de `creators_scoped_read` (0008, réécrite en 0057) : admin, ou modèle
-- assignée dans `profile_creators`. Si cette policy change, cette fonction doit suivre.
-- Sans le droit `sources-trafic`, la fonction ne rend rien.

create or replace function public.mkt_model_sources()
returns table (creator_id uuid, group_key text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.creator_id, l.type
  from mkt_links l
  where l.creator_id is not null
    and public.has_page('sources-trafic')
    and (
      public.is_admin()
      or exists (
        select 1 from profile_creators pc
        where pc.profile_id = auth.uid() and pc.creator_id = l.creator_id
      )
    );
$$;

revoke all on function public.mkt_model_sources() from public;
grant execute on function public.mkt_model_sources() to authenticated;
