-- 0029 — Champs closing CRM sur chatters (fusion gla-workflow, tranche 1).
-- `role` : colonne de 0001 jamais écrite (l'ingestion ne la remplit pas) réutilisée pour
-- closer/setter. `team` : équipe de closing rouge/bleue — NE PAS confondre avec team_id
-- (team de management). `shift` : mêmes valeurs que police_entries.shift (0022).
-- Écriture : has_page('chatters'), limitée à ces 3 colonnes par grant de colonnes
-- (une policy UPDATE seule ouvrirait display_name, team_id, etc.).
alter table chatters
  add constraint chatters_role_check check (role in ('closer','setter'));

alter table chatters
  add column team  text check (team  in ('rouge','bleue')),
  add column shift text check (shift in ('matin','aprem','soir'));

revoke update on chatters from authenticated;
grant update (role, team, shift) on chatters to authenticated;

create policy chatters_crm_update on chatters for update to authenticated
  using (public.has_page('chatters')) with check (public.has_page('chatters'));
