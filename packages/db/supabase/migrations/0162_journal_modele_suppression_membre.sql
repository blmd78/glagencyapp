-- 0162 — Supprimer un membre qui a des modèles assignées ne plante plus.
--
-- Incident du 2026-09-15 (Axel, admin) : la corbeille de Membres échouait sur tout membre rattaché
-- à au moins une modèle — logs Auth, `DELETE /admin/users` 500, « insert or update on table
-- member_events violates foreign key constraint member_events_profile_id_fkey ».
--
-- Mécanisme : `deleteUser` → cascade `profiles_id_fkey` (le profil disparaît) → cascade
-- `profile_creators_profile_id_fkey` → le trigger AFTER DELETE `trg_log_member_model_changes`
-- (0101, réécrit en 0110) insère « modèle retiré » dans `member_events` pour un profil qui n'existe
-- plus → la FK refuse l'insert → TOUTE la suppression est annulée. Un membre sans modèle se
-- supprimait, d'où un bug resté invisible jusqu'ici.
--
-- Correctif : le garde-fou que portent déjà les trois autres triggers du journal
-- (`log_police_entry_delete` 0106, `log_police_report_delete` 0107,
-- `training_legacy_claim_journal` 0123) — profil absent, pas d'événement. Il n'y a rien à
-- journaliser : l'historique du membre part avec lui (`member_events` en cascade).
--
-- Corps identique à 0110 hormis le garde-fou. Le code en production n'en dépend pas : la
-- migration peut précéder ou suivre le déploiement.

create or replace function public.log_member_model_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := coalesce(new.profile_id, old.profile_id);
  v_creator uuid := coalesce(new.creator_id, old.creator_id);
  v_actor   uuid;
  v_name    text;
  v_old     text;
  v_new     text;
begin
  -- Garde-fou (patron 0106) : profil supprimé en cascade → pas d'événement, sinon la FK de
  -- member_events refuse l'insert et fait échouer la suppression du membre elle-même.
  if not exists (select 1 from profiles where id = v_profile) then
    return null;
  end if;

  select coalesce(auth.uid(), p.updated_by) into v_actor from profiles p where p.id = v_profile;
  select name into v_name from creators where id = v_creator;
  v_name := coalesce(v_name, '?');
  -- `Emma · matin, soir (HS)` ; `Emma` seul sans placement (INSERT/DELETE) ; null (UPDATE) sans.
  if tg_op <> 'INSERT' then
    select v_name || ' · ' || string_agg(x || case when x = any(old.hs_shifts) then ' (HS)' else '' end, ', ' order by ord)
      into v_old from unnest(old.shifts) with ordinality as t(x, ord);
  end if;
  if tg_op <> 'DELETE' then
    select v_name || ' · ' || string_agg(x || case when x = any(new.hs_shifts) then ' (HS)' else '' end, ', ' order by ord)
      into v_new from unnest(new.shifts) with ordinality as t(x, ord);
  end if;

  if tg_op = 'INSERT' then
    insert into member_events (profile_id, created_by, kind, to_value)
    values (v_profile, v_actor, 'modele', coalesce(v_new, v_name));
  elsif tg_op = 'UPDATE' then
    if new.shifts is distinct from old.shifts or new.hs_shifts is distinct from old.hs_shifts then
      insert into member_events (profile_id, created_by, kind, from_value, to_value)
      values (v_profile, v_actor, 'shift', v_old, v_new);
    end if;
  else
    insert into member_events (profile_id, created_by, kind, from_value)
    values (v_profile, v_actor, 'modele', coalesce(v_old, v_name));
  end if;
  return null; -- AFTER trigger : la valeur de retour est ignorée.
end;
$$;
