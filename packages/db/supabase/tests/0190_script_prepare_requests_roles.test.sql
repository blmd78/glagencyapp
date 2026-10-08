-- Test de la migration 0190 (clés de « Préparer » réservées à l'admin et à l'encadrement). À jouer sur
-- l'UAT avec psql : TOUT est annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0190_script_prepare_requests_roles.test.sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000190a1', 'test-0190-manager@example.invalid'),
  ('00000000-0000-4000-8000-0000000190a2', 'test-0190-chatteur@example.invalid');
update profiles set role = 'manager' where id = '00000000-0000-4000-8000-0000000190a1';
update profiles set role = 'chatteur' where id = '00000000-0000-4000-8000-0000000190a2';

set local role authenticated;

-- 1. Un chatteur ne réserve pas de clé (seuls l'admin et l'encadrement préparent).
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000190a2","role":"authenticated"}';
do $$
begin
  insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000019aaa1', '00000000-0000-4000-8000-0000000190a2');
  raise exception 'KO : un chatteur a réservé une clé de préparation';
exception when insufficient_privilege then null;
end $$;

-- 2. Un manager, oui.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000190a1","role":"authenticated"}';
insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000019aaa2', '00000000-0000-4000-8000-0000000190a1');

select 'OK : 0190 — clés de préparation réservées à l''admin et à l''encadrement' as resultat;
rollback;
