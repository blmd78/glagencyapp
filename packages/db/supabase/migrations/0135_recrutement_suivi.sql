-- L'onglet Recrutement s'ouvre aux encadrants qui portent le droit « Suivi » de la Formation.
--
-- Jusqu'ici il était strictement admin — nav `adminOnly`, page `requireAdmin()`, et RLS
-- `is_admin()` sur les trois tables du test. Or le recrutement précède la formation dans le
-- parcours réel : c'est l'encadrant qui suit la promo qui a besoin de voir arriver les dossiers,
-- et c'est lui qui intègre les gens à l'agence.
--
-- LECTURE ouverte à `has_page('frm-suivi')`. Les ÉCRITURES sensibles (bloquer, débloquer,
-- supprimer un dossier, et toute la configuration du test) restent admin : la RLS de ces tables
-- n'a de toute façon aucune politique d'écriture, tout passe par des Server Actions gardées, et
-- c'est là que la frontière se pose — pas ici.
--
-- `recruit_attempts` porte la CLÉ DE CORRECTION du QI (`qi_answers`) : l'ouvrir à un encadrant
-- lui donnerait les bonnes réponses du test. On l'ouvre quand même à `frm-suivi` — c'est le même
-- niveau de confiance que le reste de la face (il voit déjà les briefs de fan et les réponses
-- attendues des cas) — mais on le note, parce que ce n'est pas neutre.
drop policy if exists recruit_candidates_read on public.recruit_candidates;
create policy recruit_candidates_read on public.recruit_candidates for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('frm-suivi')));

drop policy if exists recruit_attempts_read on public.recruit_attempts;
create policy recruit_attempts_read on public.recruit_attempts for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('frm-suivi')));

drop policy if exists recruit_messages_read on public.recruit_messages;
create policy recruit_messages_read on public.recruit_messages for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('frm-suivi')));

-- `recruit_blocklist` NE bouge PAS : elle liste des appareils, e-mails et IP de personnes
-- écartées. C'est une donnée de police, pas de recrutement — elle reste admin.
