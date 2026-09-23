-- 0171 — Les notes des sources de trafic (0170) se CONSULTENT côté Chatteurs, sur une page à part
-- (Équipe › Sources de trafic, droit `sources-trafic`). Demande Benoit 2026-09-23.
--
-- Pourquoi un droit à part plutôt qu'Équipe › Modèles : cette page-là est un comparatif de CA,
-- ouvert à 2 chatteurs sur 403. Y loger les notes aurait forcé à choisir entre ouvrir le CA aux
-- chatteurs ou les priver des notes.
--
-- LECTURE SEULE, et CLOISONNÉE : un porteur du droit ne lit que les notes de SES modèles. Le
-- cloisonnement passe par `creators` — la sous-requête s'évalue sous la RLS de l'appelant
-- (`creators_scoped_read`, 0008), exactement comme Infos modèles. L'admin voit tout (`has_page`
-- rend vrai pour lui, et `creators` aussi). L'écriture reste au pôle marketing (policy de 0170).
--
-- Les groupes ne portent que libellés, couleurs et mots-clés : leur lecture ouverte au même droit
-- ne dit rien de plus que la page elle-même (le nom du réseau à côté de sa note).

create policy mkt_source_notes_equipe_read on public.mkt_source_notes for select to authenticated
  using (
    (select public.has_page('sources-trafic'))
    and exists (select 1 from public.creators c where c.id = mkt_source_notes.creator_id)
  );

create policy mkt_link_groups_equipe_read on public.mkt_link_groups for select to authenticated
  using ((select public.has_page('sources-trafic')));
