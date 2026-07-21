-- 0074 — Cloisonnement PAR MODÈLE des rapports du soir porté en RLS (finding sécurité I1).
-- Avant (0071) : police_reports_read = is_admin() OR has_page('police') — AUCUN filtre modèle ;
-- le cloisonnement (on ne voit/écrit que ses modèles assignés) n'existait QUE côté app (inScope /
-- creatorInScope). Un porteur de la page « police » (même en lecture seule) pouvait donc lire tous
-- les rapports de tous les modèles en requête PostgREST directe (le filtre app est court-circuité).
-- On aligne sur le principe « RLS = enforcement réel du cloisonnement par modèle » (CLAUDE.md) et
-- sur le patron `creators_scoped_read` (0008) : admin = tout, sinon uniquement les modèles présents
-- dans profile_creators. Le filtre app RESTE (couche optimiste + erreurs métier lisibles).
--
-- police_report_lines : PAS besoin de les modifier — leur RLS fait un `exists (… police_reports …)`,
-- donc soumis à la RLS ci-dessous (on ne lit/écrit une ligne que si son en-tête parent l'autorise).

drop policy police_reports_read on public.police_reports;
create policy police_reports_read on public.police_reports for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.has_page('police'))
      and exists (
        select 1 from public.profile_creators pc
        where pc.profile_id = (select auth.uid()) and pc.creator_id = police_reports.creator_id
      )
    )
  );

drop policy police_reports_write on public.police_reports;
create policy police_reports_write on public.police_reports for all to authenticated
  using (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.profile_creators pc
        where pc.profile_id = (select auth.uid()) and pc.creator_id = police_reports.creator_id
      )
    )
  )
  with check (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.profile_creators pc
        where pc.profile_id = (select auth.uid()) and pc.creator_id = police_reports.creator_id
      )
    )
  );
