-- 0066 — Durcit relances_insert : une relance doit cibler une VRAIE conversation du périmètre.
--
-- Avant, le with_check ne contraignait que `creator_id ∈ profile_creators` : un `fan_id`
-- arbitraire (inexistant) passait, permettant des relances FANTÔMES / crédit erroné à
-- l'intérieur de son propre modèle (faiblesse d'intégrité relevée à l'audit — pas une fuite
-- cross-tenant). On exige désormais qu'une ligne `spender_conversations (creator_id, fan_id)`
-- existe. La sous-requête est soumise à la RLS de `spender_conversations` (cloisonnement par
-- modèle) → on ne peut relancer qu'un spender réellement visible du caller.
--
-- Aucune relance légitime n'est bloquée : le tracker ne propose QUE des conversations issues
-- de `spender_conversations` (get-spenders.ts) — on ne peut relancer que ce qu'on voit déjà.
-- Le reste du with_check (has_page + périmètre modèle) est préservé à l'identique.
alter policy "relances_insert" on public.relances
  with check (
    (select has_page('crm-spenders'::text))
    and (
      (select is_admin())
      or (creator_id in (
        select profile_creators.creator_id from profile_creators
        where profile_creators.profile_id = (select auth.uid())))
    )
    and exists (
      select 1 from spender_conversations sc
      where sc.creator_id = relances.creator_id and sc.fan_id = relances.fan_id
    )
  );
