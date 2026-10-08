-- Test de la migration 0189 (clé anti-doublon de « Préparer »). À jouer sur l'UAT avec psql : TOUT est
-- annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0189_script_prepare_requests.test.sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000189a1', 'test-0189-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000189a2', 'test-0189-b@example.invalid');
-- Encadrants : depuis 0190, seuls l'admin et l'encadrement réservent des clés.
update profiles set role = 'manager' where id in ('00000000-0000-4000-8000-0000000189a1', '00000000-0000-4000-8000-0000000189a2');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000189a1","role":"authenticated"}';

-- 1. Réserver une clé à son nom : accepté. La même clé une 2e fois : refusée (c'est le doublon).
insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000018aaa1', '00000000-0000-4000-8000-0000000189a1');
do $$
begin
  insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000018aaa1', '00000000-0000-4000-8000-0000000189a1');
  raise exception 'KO : la même clé réservée deux fois';
exception when unique_violation then null;
end $$;

-- 2. Réserver au nom d'un autre : refusé.
do $$
begin
  insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000018aaa2', '00000000-0000-4000-8000-0000000189a2');
  raise exception 'KO : clé réservée au nom d''un autre';
exception when insufficient_privilege then null;
end $$;

-- 3. Libérer sa clé (après un échec) : accepté.
delete from script_prepare_requests where request_id = '00000000-0000-4000-8000-00000018aaa1';
do $$
begin
  if exists (select 1 from script_prepare_requests where request_id = '00000000-0000-4000-8000-00000018aaa1') then
    raise exception 'KO : clé non libérée';
  end if;
end $$;
insert into script_prepare_requests (request_id, created_by) values ('00000000-0000-4000-8000-00000018aaa1', '00000000-0000-4000-8000-0000000189a1');

-- 4. Un autre utilisateur ne voit pas, ne modifie pas, ne libère pas les clés des autres.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000189a2","role":"authenticated"}';
do $$
declare n int;
begin
  if (select count(*) from script_prepare_requests where request_id = '00000000-0000-4000-8000-00000018aaa1') <> 0 then
    raise exception 'KO : clé d''un autre lisible';
  end if;
  delete from script_prepare_requests where request_id = '00000000-0000-4000-8000-00000018aaa1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'KO : clé d''un autre libérée'; end if;
end $$;

select 'OK : 0189 — une clé par clic, réservée une seule fois, à son nom, invisible des autres' as resultat;
rollback;
