-- Test de la migration 0184 (import de scripts). À jouer sur l'UAT avec psql : TOUT est annulé à la
-- fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0184_import_scripts.test.sql
\set ON_ERROR_STOP on
begin;

-- Fixtures (parties au rollback) : un manager avec la modèle A seule, un admin, deux modèles.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000184a1', 'test-0184-manager@example.invalid'),
  ('00000000-0000-4000-8000-0000000184a2', 'test-0184-admin@example.invalid');
-- Le déclencheur on_auth_user_created (0002) a créé les profils : on fixe leur rôle.
update profiles set role = 'manager' where id = '00000000-0000-4000-8000-0000000184a1';
update profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000184a2';
insert into creators (id, name) values
  ('00000000-0000-4000-8000-0000000184c1', 'Test 0184 A'),
  ('00000000-0000-4000-8000-0000000184c2', 'Test 0184 B');
insert into profile_creators (profile_id, creator_id) values
  ('00000000-0000-4000-8000-0000000184a1', '00000000-0000-4000-8000-0000000184c1');
insert into notion_connection (access_token_encrypted, workspace_id, workspace_name, bot_id)
values ('v1:x:y:z', 'w', 'Agence test', 'b');

-- ── En tant que MANAGER ─────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000184a1","role":"authenticated"}';

-- 1. Modèle de son périmètre : insertion acceptée.
insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
values ('00000000-0000-4000-8000-0000000184a1', '00000000-0000-4000-8000-0000000184c1', 'p1', 'Script A', '{}', '{}');

-- 2. Modèle hors périmètre : refusée par la RLS.
do $$
begin
  insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
  values ('00000000-0000-4000-8000-0000000184a1', '00000000-0000-4000-8000-0000000184c2', 'p2', 'Script B', '{}', '{}');
  raise exception 'KO : un manager a importé pour une modèle hors de son périmètre';
exception when insufficient_privilege then null;
end $$;

-- 3. Usurpation de created_by : refusée.
do $$
begin
  insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
  values ('00000000-0000-4000-8000-0000000184a2', '00000000-0000-4000-8000-0000000184c1', 'p3', 'Script C', '{}', '{}');
  raise exception 'KO : un manager a créé un import au nom d''un autre';
exception when insufficient_privilege then null;
end $$;

-- 4. Déplacer son import vers une modèle hors périmètre : refusé.
do $$
begin
  update script_imports set creator_id = '00000000-0000-4000-8000-0000000184c2' where notion_page_id = 'p1';
  raise exception 'KO : un manager a déplacé un import hors de son périmètre';
exception when insufficient_privilege then null;
end $$;

-- 5. Verrou d'envoi : le passage prepared → sending ne touche qu'une fois la ligne.
do $$
declare n int;
begin
  update script_imports set status = 'sending', sent_at = now() where notion_page_id = 'p1' and status = 'prepared';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'KO : premier passage en sending : % ligne(s)', n; end if;
  update script_imports set status = 'sending', sent_at = now() where notion_page_id = 'p1' and status = 'prepared';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'KO : double envoi possible (% ligne(s) au 2e passage)', n; end if;
end $$;

-- 6. Lecture : le manager voit son import ; la connexion Notion lui est invisible.
do $$
begin
  if (select count(*) from script_imports where notion_page_id like 'p%') <> 1 then
    raise exception 'KO : le manager ne voit pas exactement son import';
  end if;
  if (select count(*) from notion_connection) <> 0 then
    raise exception 'KO : la connexion Notion est lisible par un utilisateur connecté';
  end if;
end $$;

-- ── En tant qu'ADMIN ────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000184a2","role":"authenticated"}';

-- 7. Admin : toute modèle, et il voit les imports des autres.
insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
values ('00000000-0000-4000-8000-0000000184a2', '00000000-0000-4000-8000-0000000184c2', 'p4', 'Script D', '{}', '{}');
do $$
begin
  if (select count(*) from script_imports where notion_page_id in ('p1', 'p4')) <> 2 then
    raise exception 'KO : l''admin ne voit pas tous les imports';
  end if;
  if (select count(*) from notion_connection) <> 0 then
    raise exception 'KO : la connexion Notion est lisible même par un admin connecté (service role seul attendu)';
  end if;
end $$;

-- 8. Statut hors liste : refusé (par le check de 0184, ou en amont par le déclencheur de 0186).
do $$
begin
  update script_imports set status = 'autre' where notion_page_id = 'p4';
  raise exception 'KO : statut hors liste accepté';
exception when check_violation or insufficient_privilege then null;
end $$;

select 'OK : 0184 — RLS de script_imports, verrou d''envoi, notion_connection service role seul' as resultat;
rollback;
