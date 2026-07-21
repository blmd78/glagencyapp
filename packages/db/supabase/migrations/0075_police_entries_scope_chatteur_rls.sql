-- 0075 — Cloisonnement PAR CHATTEUR du Tracker sanctions (police_entries) porté en RLS.
-- Avant (0022 + durcissements) : police_read = has_page('police'), police_insert/update = droit
-- d'écriture — AUCUN filtre chatteur ; le cloisonnement (un non-admin ne voit/écrit que les
-- sanctions de SES chatteurs) n'existait que côté app (getChatterScope + inScope). Un porteur de la
-- page « police » pouvait donc lire/écrire les sanctions de tous les chatteurs en requête directe.
-- On aligne sur « RLS = enforcement réel du cloisonnement » (CLAUDE.md), comme 0074 l'a fait pour les
-- rapports. Le périmètre reproduit EXACTEMENT getChatterScope : le chatteur de l'entrée doit avoir un
-- lien chatter_creators ACTIF vers un modèle présent dans MES profile_creators (admin = tout). Le
-- filtre app reste comme couche optimiste + il sert encore à cloisonner les OPTIONS (chatterOptions,
-- résolues via le client admin qui bypasse la RLS).
--
-- `police_delete` (admin only) inchangée. Prédicat de périmètre inliné (explicite, robuste : ne
-- dépend pas de l'application récursive de la RLS de chatter_creators dans le sous-select).

drop policy police_read on public.police_entries;
create policy police_read on public.police_entries for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.has_page('police'))
      and exists (
        select 1 from public.chatter_creators cc
        where cc.chatter_id = police_entries.chatter_id and cc.active = true
          and exists (
            select 1 from public.profile_creators pc
            where pc.profile_id = (select auth.uid()) and pc.creator_id = cc.creator_id
          )
      )
    )
  );

drop policy police_insert on public.police_entries;
create policy police_insert on public.police_entries for insert to authenticated
  with check (
    ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.chatter_creators cc
        where cc.chatter_id = police_entries.chatter_id and cc.active = true
          and exists (
            select 1 from public.profile_creators pc
            where pc.profile_id = (select auth.uid()) and pc.creator_id = cc.creator_id
          )
      )
    )
  );

drop policy police_update on public.police_entries;
create policy police_update on public.police_entries for update to authenticated
  using (
    ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.chatter_creators cc
        where cc.chatter_id = police_entries.chatter_id and cc.active = true
          and exists (
            select 1 from public.profile_creators pc
            where pc.profile_id = (select auth.uid()) and pc.creator_id = cc.creator_id
          )
      )
    )
  )
  with check (
    ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.chatter_creators cc
        where cc.chatter_id = police_entries.chatter_id and cc.active = true
          and exists (
            select 1 from public.profile_creators pc
            where pc.profile_id = (select auth.uid()) and pc.creator_id = cc.creator_id
          )
      )
    )
  );
