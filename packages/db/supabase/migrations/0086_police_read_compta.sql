-- 0086 — La compta lit les sanctions de SES rattachés, sans le droit de page `police`.
--
-- `police_entries` n'est lisible qu'avec `has_page('police')` (0078), droit qui donne accès à
-- TOUTES les sanctions, non cloisonnées. Cinq sous-managers portent `compta` sans `police` :
-- leur fiche de paie affichait 0 € de sanctions SANS erreur — la requête RLS ne lève pas, elle
-- renvoie zéro ligne — donc un net surestimé et une retenue disparue en silence.
--
-- Policy ADDITIONNELLE (les policies permissives se cumulent en OR) : `police_read` n'est pas
-- touchée, la page Police garde son comportement exact. Ici l'accès est CLOISONNÉ aux rattachés
-- directs, contrairement à la page Police qui est volontairement globale depuis 0078.

create policy police_read_compta on public.police_entries for select to authenticated
  using (
    (select public.has_page('compta'))
    and (
      (select public.is_admin())
      or ((select public.is_manager()) and (select public.manages(chatter_id)))
    )
  );
