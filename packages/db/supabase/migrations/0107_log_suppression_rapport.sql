-- 0107 — La SUPPRESSION d'un rapport du soir s'inscrit au journal de vie du membre.
--
-- Même doctrine que 0106 (sanctions) et 0101 : `member_events` est alimentée EXCLUSIVEMENT
-- par trigger — l'événement est écrit par la base au DELETE, donc aussi lors d'un ménage en
-- SQL direct (created_by null → « système » à l'écran).
--
-- RATTACHEMENT : l'événement se pose sur CHAQUE CHATTEUR SUIVI du rapport — c'est LEUR
-- feedback du soir qui disparaît, et le journal est celui des membres (première version sur
-- l'AUTEUR : le flux affichait « Membre : blmd8345 · Superadmin », factuel mais illisible —
-- retour Benoit 2026-08-06). L'auteur de la suppression reste la colonne « Par ». Un rapport
-- SANS suivi (chiffres seuls) retombe sur l'auteur — sinon sa suppression serait muette.
--
-- BEFORE DELETE, pas AFTER : les lignes (police_report_lines) partent en cascade avec le
-- rapport — après, il n'y a plus rien à lire.
--
-- `from_value` = fait supprimé en une valeur parseable, même format que `sortie`/`sanction`
-- (« date (détail) ») : '2026-08-03 (Julie)'. Le nom du modèle est résolu ICI (il est en base,
-- contrairement aux libellés d'erreur des sanctions) — un historique doit rester lisible même
-- si le modèle disparaît ensuite. `memberEventLabel` (@glagency/core, testé) rédige la phrase.

alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport'));

create or replace function public.log_police_report_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_fait  text;
  v_n     int  := 0;
begin
  v_fait := to_char(old.day, 'YYYY-MM-DD') || ' ('
    || coalesce((select name from creators where id = old.creator_id), 'modèle supprimé')
    || ')';

  -- Un événement PAR CHATTEUR SUIVI — borné aux profils existants : `chatter_id` référence
  -- historiquement `chatters` (0071), et la FK de member_events exigerait un profil.
  insert into member_events (profile_id, created_by, kind, from_value)
  select l.chatter_id, v_actor, 'rapport', v_fait
  from police_report_lines l
  where l.report_id = old.id
    and exists (select 1 from profiles p where p.id = l.chatter_id);
  get diagnostics v_n = row_count;

  -- Rapport sans suivi : la trace retombe sur l'AUTEUR (jamais de suppression muette).
  if v_n = 0 and old.author_id is not null
     and exists (select 1 from profiles where id = old.author_id) then
    insert into member_events (profile_id, created_by, kind, from_value)
    values (old.author_id, v_actor, 'rapport', v_fait);
  end if;

  return old;
end;
$$;

drop trigger if exists police_reports_log_delete on public.police_reports;
create trigger police_reports_log_delete
  before delete on public.police_reports
  for each row execute function public.log_police_report_delete();
