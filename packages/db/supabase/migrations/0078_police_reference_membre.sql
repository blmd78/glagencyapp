-- 0078 — Police (Tracker sanctions + Rapport du soir) référence désormais le MEMBRE (profiles,
-- role chatteur) au lieu du chatteur MyPuls (chatters), ET repasse EN NON-CLOISONNÉ.
--
-- Décision : les 2 sélecteurs Police listent TOUS les membres role chatteur (aucun filtre modèle),
-- et tout porteur de la page « Police » voit/gère les sanctions et rapports de tous les chatteurs.
-- On ANNULE donc le cloisonnement PAR MODÈLE du tracker (0075) et des rapports (0074) posé plus tôt
-- cette session. Le nom de colonne `chatter_id` est CONSERVÉ (c'est toujours « le chatteur »,
-- désormais son compte membre) pour ne pas casser le RPC 0073, les schémas Zod et l'UI.
--
-- Données existantes (features neuves — quelques lignes de test) : EFFACÉES (elles pointent des
-- chatteurs MyPuls qui ne sont pas des profiles → la repointe de FK les rejetterait).

-- 1) Données + repointe des FK chatters → profiles (on delete cascade conservé : supprimer un
--    membre efface ses sanctions / lignes de suivi).
delete from public.police_report_lines;
delete from public.police_reports;
delete from public.police_entries;

alter table public.police_entries drop constraint police_entries_chatter_id_fkey;
alter table public.police_entries
  add constraint police_entries_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;

alter table public.police_report_lines drop constraint police_report_lines_chatter_id_fkey;
alter table public.police_report_lines
  add constraint police_report_lines_chatter_id_fkey
  foreign key (chatter_id) references public.profiles(id) on delete cascade;

-- 2) RLS Tracker (police_entries) — retour au NON cloisonné (annule 0075). Lecture = page Police ;
--    écriture = droit d'écriture de la page ; suppression = admin (0022, inchangée).
drop policy police_read on public.police_entries;
create policy police_read on public.police_entries for select to authenticated
  using ((select public.has_page('police')));

drop policy police_insert on public.police_entries;
create policy police_insert on public.police_entries for insert to authenticated
  with check (
    (select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police')))
  );

drop policy police_update on public.police_entries;
create policy police_update on public.police_entries for update to authenticated
  using (
    (select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police')))
  )
  with check (
    (select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police')))
  );

-- 3) RLS Rapports (police_reports) — retour au NON cloisonné par modèle (annule 0074). Lecture =
--    admin OU page Police ; écriture = SON propre rapport + droit d'écriture. Les lignes
--    (police_report_lines) héritent de l'en-tête → RLS inchangée.
drop policy police_reports_read on public.police_reports;
create policy police_reports_read on public.police_reports for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('police')));

drop policy police_reports_write on public.police_reports;
create policy police_reports_write on public.police_reports for all to authenticated
  using (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  )
  with check (
    author_id = (select auth.uid())
    and ((select public.can_write_page('police')) or ((select public.is_police()) and (select public.has_page('police'))))
  );
