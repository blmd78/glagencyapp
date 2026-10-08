-- Test de la migration 0186 (verrous de script_imports). À jouer sur l'UAT avec psql : TOUT est
-- annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0186_import_scripts_verrous.test.sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000186a1', 'test-0186-manager@example.invalid'),
  ('00000000-0000-4000-8000-0000000186a2', 'test-0186-chatteur@example.invalid');
update profiles set role = 'manager' where id = '00000000-0000-4000-8000-0000000186a1';
update profiles set role = 'chatteur' where id = '00000000-0000-4000-8000-0000000186a2';
insert into creators (id, name) values ('00000000-0000-4000-8000-0000000186c1', 'Test 0186 A');
insert into profile_creators (profile_id, creator_id) values
  ('00000000-0000-4000-8000-0000000186a1', '00000000-0000-4000-8000-0000000186c1'),
  ('00000000-0000-4000-8000-0000000186a2', '00000000-0000-4000-8000-0000000186c1');

set local role authenticated;

-- ── Un CHATTEUR rattaché à la modèle ne peut pas importer ─────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000186a2","role":"authenticated"}';
do $$
begin
  insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
  values ('00000000-0000-4000-8000-0000000186a2', '00000000-0000-4000-8000-0000000186c1', 'c1', 'Script', '{}', '{}');
  raise exception 'KO : un chatteur a créé un import';
exception when insufficient_privilege then null;
end $$;

-- ── Le MANAGER rattaché ───────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000186a1","role":"authenticated"}';

-- 1. Une ligne ne naît pas « sent » ni avec un id MyPuls.
do $$
begin
  insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft, status)
  values ('00000000-0000-4000-8000-0000000186a1', '00000000-0000-4000-8000-0000000186c1', 'm0', 'Script', '{}', '{}', 'sent');
  raise exception 'KO : insertion directe d''un import « sent »';
exception when insufficient_privilege then null;
end $$;

insert into script_imports (created_by, creator_id, notion_page_id, notion_title, summary, draft)
values ('00000000-0000-4000-8000-0000000186a1', '00000000-0000-4000-8000-0000000186c1', 'm1', 'Script', '{}', '{"name":"ok"}');

-- 2. Le brouillon et le rapport ne se réécrivent pas.
do $$
begin
  update script_imports set draft = '{"name":"pirate"}' where notion_page_id = 'm1';
  raise exception 'KO : brouillon réécrit';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update script_imports set errors = '[]' , summary = '{"x":1}' where notion_page_id = 'm1';
  raise exception 'KO : rapport réécrit';
exception when insufficient_privilege then null;
end $$;

-- 3. Statut : prepared → sending → sent accepté ; sent → prepared refusé ; prepared → sent refusé.
do $$
begin
  update script_imports set status = 'sent' where notion_page_id = 'm1';
  raise exception 'KO : prepared → sent accepté sans passer par sending';
exception when insufficient_privilege then null;
end $$;
update script_imports set status = 'sending', sent_at = now() where notion_page_id = 'm1';
update script_imports set mypuls_script_id = 4242 where notion_page_id = 'm1';
update script_imports set status = 'sent' where notion_page_id = 'm1';
do $$
begin
  update script_imports set status = 'prepared' where notion_page_id = 'm1';
  raise exception 'KO : un import envoyé a été remis en « prepared » (renvoi possible)';
exception when insufficient_privilege then null;
end $$;

select 'OK : 0186 — rôle exigé, naissance en prepared, rapport et brouillon figés, statuts bornés' as resultat;
rollback;
