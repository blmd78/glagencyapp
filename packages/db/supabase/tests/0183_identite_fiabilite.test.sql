-- Test de la migration 0183 (identité chatteur + fiabilité). À jouer sur l'UAT avec psql : TOUT
-- est annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0183_identite_fiabilite.test.sql
\set ON_ERROR_STOP on
begin;

-- Aide (temporaire, partie au rollback) : `ok` du contrôle `p_code` dans un retour de
-- finish_chatter_day ; null si le contrôle est absent.
create function pg_temp.ok_de(r jsonb, p_code text) returns boolean language sql as $$
  select (e->>'ok')::boolean from jsonb_array_elements(r->'checks') e where e->>'code' = p_code limit 1
$$;

insert into chatters (id, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Test Lionel'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test lioneldiv'),
  ('00000000-0000-4000-8000-0000000000a3', 'Test Autre');
insert into chatter_alias (chatter_id, raw_label, raw_label_norm, source) values
  ('00000000-0000-4000-8000-0000000000a1', 'Test Lionel', 'testlionel', 'manual'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test lioneldiv', 'testlioneldiv', 'manual');
-- Résumé sur A, ventes sur B, mêmes jours : le déséquilibre type (cas Lionel).
insert into chatter_daily (chatter_id, date, ca, ca_ppv, ca_tips) values
  ('00000000-0000-4000-8000-0000000000a1', '2000-01-01', 10, 10, 0),
  ('00000000-0000-4000-8000-0000000000a1', '2000-01-02', 5, 5, 0);
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
select '00000000-0000-4000-8000-0000000000a2', (select id from creators order by id limit 1), d, c, c, 0
from (values ('2000-01-01'::date, 10::numeric), ('2000-01-02'::date, 5::numeric)) v(d, c);
-- Spenders : conversation d'abord sur A, puis « réassignée » à B (deux libellés d'un même compte).
insert into spender_conversations (creator_id, fan_id, username, captured_at, assigned_chatter_id)
values ((select id from creators order by id limit 1), -424242, 'test-0183', now(), '00000000-0000-4000-8000-0000000000a1');
update spender_conversations set assigned_chatter_id = '00000000-0000-4000-8000-0000000000a2' where fan_id = -424242;
insert into chatter_identity_issues (issue_key, kind, chatter_id, other_chatter_id, detail)
values ('test:0183:doublon', 'doublon', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', 'test');
-- Repos : B dans une cellule (semaine fictive de l'an 2000), à côté d'un autre id qui ne bouge pas.
insert into rest_planning_cells (week_start, day, col, chatter_ids)
values ('2000-01-03', 0, 'test-0183',
        array['00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b9']::uuid[]);

-- 1. Fusion B → A, avec l'id MyPuls 990001 posé sur A.
select merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '990001');
do $$
begin
  if exists (select 1 from chatter_daily where chatter_id = '00000000-0000-4000-8000-0000000000a2')
     or exists (select 1 from chatter_creator_daily where chatter_id = '00000000-0000-4000-8000-0000000000a2')
     or exists (select 1 from chatter_alias where chatter_id = '00000000-0000-4000-8000-0000000000a2') then
    raise exception 'KO : il reste des lignes sur la fiche vidée';
  end if;
  if (select sum(ca) from chatter_creator_daily where chatter_id = '00000000-0000-4000-8000-0000000000a1') <> 15 then
    raise exception 'KO : CA des ventes après fusion';
  end if;
  if (select mypuls_user_id from chatters where id = '00000000-0000-4000-8000-0000000000a1') is distinct from '990001' then
    raise exception 'KO : id MyPuls non posé sur la fiche gardée';
  end if;
  if (select assigned_chatter_id from spender_conversations where fan_id = -424242) <> '00000000-0000-4000-8000-0000000000a1' then
    raise exception 'KO : conversation non déplacée';
  end if;
  -- Reste la 1re assignation (null → A) ; partis : l'artefact du trigger (B → A) et A → B devenu A → A.
  if (select count(*) from spender_assignment_events where fan_id = -424242) <> 1
     or exists (select 1 from spender_assignment_events where fan_id = -424242 and from_chatter_id is not distinct from to_chatter_id) then
    raise exception 'KO : historique d''assignation (%)', (select json_agg(e) from spender_assignment_events e where fan_id = -424242);
  end if;
  if exists (select 1 from chatter_identity_issues where issue_key = 'test:0183:doublon') then
    raise exception 'KO : anomalie de la fiche vidée non effacée';
  end if;
  -- Repos (array_replace, comme la v2) : B remplacé par A, l'autre id intact.
  if (select chatter_ids from rest_planning_cells where week_start = '2000-01-03' and col = 'test-0183')
     is distinct from array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b9']::uuid[] then
    raise exception 'KO : cellule de repos (%)',
      (select chatter_ids from rest_planning_cells where week_start = '2000-01-03' and col = 'test-0183');
  end if;
  -- La fiche vidée est GARDÉE (défaut de la v2).
  if not exists (select 1 from chatters where id = '00000000-0000-4000-8000-0000000000a2') then
    raise exception 'KO : fiche vidée supprimée';
  end if;
end $$;

-- 2. Garde : ids MyPuls contradictoires → refus.
update chatters set mypuls_user_id = '990002' where id = '00000000-0000-4000-8000-0000000000a3';
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : ids contradictoires acceptés';
exception when others then
  if sqlerrm not like 'ids MyPuls différents%' then raise; end if;
end $$;

-- 3. Garde : fiche à vider reliée à un membre → refus.
update chatters set mypuls_user_id = null where id = '00000000-0000-4000-8000-0000000000a3';
update profiles set chatter_id = '00000000-0000-4000-8000-0000000000a3'
 where id = (select id from profiles where chatter_id is null order by id limit 1);
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : membre relié accepté';
exception when others then
  if sqlerrm not like 'la fiche à vider est rattachée%' then raise; end if;
end $$;
update profiles set chatter_id = null where chatter_id = '00000000-0000-4000-8000-0000000000a3';

-- 3 bis. Garde : clé étrangère non traitée par la fusion (chatter_creators, lue dans pg_constraint) → refus.
insert into chatter_creators (chatter_id, creator_id)
values ('00000000-0000-4000-8000-0000000000a3', (select id from creators order by id limit 1));
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : référence non traitée acceptée';
exception when others then
  if sqlerrm not like 'fiche référencée dans chatter_creators.chatter_id%' then raise; end if;
end $$;
delete from chatter_creators where chatter_id = '00000000-0000-4000-8000-0000000000a3';
-- Même garde par le SEUL catalogue : une clé étrangère dont la colonne ne s'appelle pas `chatter_id`
-- (le filet par nom ne la voit pas), dans un autre schéma. Schéma et table partent au rollback final
-- (pas de `drop` ici : il prendrait un verrou ACCESS EXCLUSIVE sur public.chatters). service_role
-- doit pouvoir la lire : la fusion la recense au test 12.
create schema test_0183;
create table test_0183.ref (fiche uuid references public.chatters(id));
grant usage on schema test_0183 to service_role;
grant select on test_0183.ref to service_role;
insert into test_0183.ref values ('00000000-0000-4000-8000-0000000000a3');
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : clé étrangère hors liste acceptée (fusion)';
exception when others then
  if sqlerrm not like 'fiche référencée dans ref.fiche%' then raise; end if;
end $$;
do $$
begin
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000a3');
  raise exception 'KO : clé étrangère hors liste acceptée (suppression)';
exception when others then
  if sqlerrm not like 'fiche % encore référencée dans ref.fiche%' then raise; end if;
end $$;
delete from test_0183.ref;

-- 3 ter. Id demandé : la fiche gardée doit pouvoir le porter, sinon refus explicite (jamais ignoré).
insert into chatters (id, display_name) values
  ('00000000-0000-4000-8000-0000000000a7', 'Test vide'),
  ('00000000-0000-4000-8000-0000000000a8', 'Test porteuse');
-- a) La gardée porte déjà un AUTRE id (A = 990001, 990777 demandé) → refus.
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3', '990777');
  raise exception 'KO : id demandé différent de celui de la gardée accepté';
exception when others then
  if sqlerrm not like 'ids MyPuls différents (990777 demandé / 990001 porté)%' then raise; end if;
end $$;
-- b) Une troisième fiche (A) porte l'id demandé, les deux fiches fusionnées n'en ont pas → refus.
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a7', '990001');
  raise exception 'KO : id déjà porté par une autre fiche accepté';
exception when others then
  if sqlerrm not like 'id MyPuls 990001 déjà porté par une autre fiche%' then raise; end if;
end $$;
-- c) L'id demandé est déjà celui de la gardée → rien à faire, la fusion passe.
do $$
declare r jsonb;
begin
  r := merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a7', '990001');
  if r->>'mypuls_user_id' is distinct from '990001' then raise exception 'KO : id de la gardée (%)', r; end if;
end $$;
-- d) Id demandé qui n'est pas un entier positif → refus, avant tout le reste.
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a7', 'abc');
  raise exception 'KO : id demandé invalide accepté';
exception when others then
  if sqlerrm not like 'id MyPuls demandé invalide (abc)%' then raise; end if;
end $$;
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a7', '0123');
  raise exception 'KO : id demandé à zéro initial accepté';
exception when others then
  if sqlerrm not like 'id MyPuls demandé invalide (0123)%' then raise; end if;
end $$;
-- e) L'id demandé est celui de la fiche vidée → il passe sur la gardée, la vidée n'en a plus.
update chatters set mypuls_user_id = '990005' where id = '00000000-0000-4000-8000-0000000000a8';
do $$
declare r jsonb;
begin
  r := merge_chatters('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000a8', '990005');
  if r->>'mypuls_user_id' is distinct from '990005'
     or (select mypuls_user_id from chatters where id = '00000000-0000-4000-8000-0000000000a8') is not null then
    raise exception 'KO : id de la fiche vidée non passé sur la gardée (%)', r;
  end if;
end $$;

-- 4. apply_chatter_identity : id déjà pris → refusé et rendu ; id libre → posé ; rejeu → ni posé ni
--    refusé ; anomalie upsertée.
do $$
declare r jsonb;
begin
  r := apply_chatter_identity(
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990001"}]'::jsonb,
    '[{"issue_key":"test:0183:k","kind":"fiche_creee","detail":"v1","chatter_id":"00000000-0000-4000-8000-0000000000a3"}]'::jsonb);
  if (r->>'linked')::int <> 0 or jsonb_array_length(r->'refused') <> 1 then raise exception 'KO : collision non refusée (%)', r; end if;
  r := apply_chatter_identity(
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990003"}]'::jsonb,
    '[{"issue_key":"test:0183:k","kind":"fiche_creee","detail":"v2","chatter_id":"00000000-0000-4000-8000-0000000000a3"}]'::jsonb);
  if (r->>'linked')::int <> 1 then raise exception 'KO : id libre non posé (%)', r; end if;
  if (select count(*) from chatter_identity_issues where issue_key = 'test:0183:k') <> 1
     or (select detail from chatter_identity_issues where issue_key = 'test:0183:k') <> 'v2' then
    raise exception 'KO : anomalie non upsertée';
  end if;
  r := apply_chatter_identity(
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990003"}]'::jsonb, '[]'::jsonb);
  if (r->>'linked')::int <> 0 or jsonb_array_length(r->'refused') <> 0 then
    raise exception 'KO : rejeu d''un id déjà posé sur la même fiche (%)', r;
  end if;
  -- Même clé deux fois dans un appel : pas d'échec, une ligne, la dernière l'emporte.
  perform apply_chatter_identity('[]'::jsonb,
    '[{"issue_key":"test:0183:dup","kind":"doublon","detail":"d1"},{"issue_key":"test:0183:dup","kind":"doublon","detail":"d2"}]'::jsonb);
  if (select count(*) from chatter_identity_issues where issue_key = 'test:0183:dup') <> 1
     or (select detail from chatter_identity_issues where issue_key = 'test:0183:dup') <> 'd2' then
    raise exception 'KO : clé d''anomalie en double';
  end if;
end $$;

-- 5. delete_empty_chatter : supprime une fiche vide (alias compris), refuse une fiche avec faits.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a4', E'Test\n Aucune vente sur la période');
insert into chatter_alias (chatter_id, raw_label, raw_label_norm, source) values
  ('00000000-0000-4000-8000-0000000000a4', E'Test\n Aucune vente sur la période', 'testaucuneventesurlapériode', 'scrape');
select delete_empty_chatter('00000000-0000-4000-8000-0000000000a4');
do $$
begin
  if exists (select 1 from chatters where id = '00000000-0000-4000-8000-0000000000a4') then raise exception 'KO : fiche vide non supprimée'; end if;
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000a1');
  raise exception 'KO : fiche avec faits supprimée';
exception when others then
  if sqlerrm not like 'fiche % encore référencée%' then raise; end if;
end $$;

-- 5 bis. delete_empty_chatter : refuse une fiche sans faits mais reliée à un membre.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a6', 'Test reliée');
update profiles set chatter_id = '00000000-0000-4000-8000-0000000000a6'
 where id = (select id from profiles where chatter_id is null order by id limit 1);
do $$
begin
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000a6');
  raise exception 'KO : fiche reliée à un membre supprimée';
exception when others then
  if sqlerrm not like 'fiche % encore référencée dans profiles.chatter_id%' then raise; end if;
end $$;
update profiles set chatter_id = null where chatter_id = '00000000-0000-4000-8000-0000000000a6';

-- 6. unattributed_sales : la pseudo-fiche « Indéterminé (…) », et elle seule.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a5', 'Indéterminé (TestModele)');
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
values ('00000000-0000-4000-8000-0000000000a5', (select id from creators order by id limit 1), '2000-01-01', 38.32, 38.32, 0);
do $$
declare j json;
begin
  j := unattributed_sales('2000-01-01', '2000-01-02');
  if json_array_length(j) <> 1 or (j->0->>'ca')::numeric <> 38.32 then raise exception 'KO : ventes sans chatteur (%)', j; end if;
end $$;

-- 6 bis. Pseudo-fiche « Indéterminé (…) » : jamais fusionnée (ni gardée ni vidée), jamais supprimée.
insert into chatters (id, display_name) values ('00000000-0000-4000-8000-0000000000a9', 'Indéterminé (TestVide)');
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a9');
  raise exception 'KO : pseudo-fiche vidée par une fusion';
exception when others then
  if sqlerrm not like 'pseudo-fiche « Indéterminé (…) » : jamais fusionnée%' then raise; end if;
end $$;
do $$
begin
  perform merge_chatters('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-0000000000a7');
  raise exception 'KO : pseudo-fiche gardée par une fusion';
exception when others then
  if sqlerrm not like 'pseudo-fiche « Indéterminé (…) » : jamais fusionnée%' then raise; end if;
end $$;
do $$
begin
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000a9');
  raise exception 'KO : pseudo-fiche vide supprimée';
exception when others then
  if sqlerrm not like 'pseudo-fiche « Indéterminé (…) » : jamais supprimée%' then raise; end if;
end $$;

-- 7. RLS : lecture et « Vu » admin sur les anomalies, lecture admin sur les contrôles.
do $$
begin
  if (select count(*) from pg_policies where tablename = 'chatter_identity_issues') <> 2
     or (select count(*) from pg_policies where tablename = 'ingest_day_checks') <> 1 then
    raise exception 'KO : policies';
  end if;
  -- « Vu » : authenticated ne peut écrire QUE resolved_at / resolved_by.
  if not has_column_privilege('authenticated', 'public.chatter_identity_issues', 'resolved_at', 'update')
     or not has_column_privilege('authenticated', 'public.chatter_identity_issues', 'resolved_by', 'update')
     or has_column_privilege('authenticated', 'public.chatter_identity_issues', 'detail', 'update')
     or has_column_privilege('authenticated', 'public.chatter_identity_issues', 'kind', 'update') then
    raise exception 'KO : droits de colonnes du « Vu »';
  end if;
  -- « Vu » signé par l'admin connecté lui-même : `with check` sur resolved_by.
  if not exists (select 1 from pg_policies
                  where tablename = 'chatter_identity_issues' and policyname = 'chatter_identity_issues_admin_ack'
                    and with_check like '%resolved_by%' and with_check like '%auth.uid()%') then
    raise exception 'KO : with check du « Vu »';
  end if;
end $$;

-- 8. finish_chatter_day : fermé par défaut (contrôle ou total manquant = échec), b1/b2 calculés EN
--    BASE, c_lien_refuse, statut, upsert. Chaque `ok` est vérifié, pas seulement le statut.
insert into chatter_daily (chatter_id, date, ca, ca_ppv, ca_tips) values ('00000000-0000-4000-8000-0000000000a1', '2000-01-03', 7, 7, 0);
insert into chatter_creator_daily (chatter_id, creator_id, date, ca, ca_ppv, ca_tips)
values ('00000000-0000-4000-8000-0000000000a1', (select id from creators order by id limit 1), '2000-01-03', 7, 7, 0);
do $$
declare
  r jsonb;
  -- Les trois contrôles du client, tous ok ; totaux justes (7,00 € en base des deux côtés).
  k_client constant jsonb := '[{"code":"a_resume_ventes","ok":true,"detail":"t"},
                               {"code":"b_total_page","ok":true,"detail":"t"},
                               {"code":"c_fiche_compte","ok":true,"detail":"t"}]';
  k_juste  constant jsonb := '{"summary_cents":700,"sales_cents":700,"sales_count":1,"page_net_cents":700,"page_sales_count":1}';
begin
  -- a) Jour juste, contrôles du client complets → ok, et les cinq contrôles ok.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, k_juste, k_client);
  if r->>'status' <> 'ok' or jsonb_array_length(r->'checks') <> 5
     or exists (select 1 from jsonb_array_elements(r->'checks') e where (e->>'ok')::boolean is not true) then
    raise exception 'KO : jour juste (%)', r;
  end if;
  -- b) Seul a_resume_ventes transmis → b_total_page et c_fiche_compte ajoutés en échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, k_juste,
    '[{"code":"a_resume_ventes","ok":true,"detail":"t"}]'::jsonb);
  if r->>'status' <> 'a_verifier'
     or pg_temp.ok_de(r, 'a_resume_ventes') is not true
     or pg_temp.ok_de(r, 'b_total_page') is not false or pg_temp.ok_de(r, 'c_fiche_compte') is not false
     or pg_temp.ok_de(r, 'b_resume_ecrit') is not true or pg_temp.ok_de(r, 'b_ventes_ecrites') is not true
     or not exists (select 1 from jsonb_array_elements(r->'checks') e
                     where e->>'code' = 'c_fiche_compte' and e->>'detail' = 'contrôle non transmis') then
    raise exception 'KO : contrôles du client manquants acceptés (%)', r;
  end if;
  -- c) Aucun contrôle du client → les trois en échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, k_juste, '[]'::jsonb);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'a_resume_ventes') is not false
     or pg_temp.ok_de(r, 'b_total_page') is not false or pg_temp.ok_de(r, 'c_fiche_compte') is not false then
    raise exception 'KO : aucun contrôle du client accepté (%)', r;
  end if;
  -- d) Code hors des six connus → échec, même déclaré ok.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, k_juste,
    k_client || '[{"code":"z_inconnu","ok":true,"detail":"x"}]'::jsonb);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'z_inconnu') is not false then
    raise exception 'KO : code de contrôle inconnu accepté (%)', r;
  end if;
  -- e) b1 : 8,00 € lus au résumé, 7,00 € en base → b_resume_ecrit en échec, b_ventes_ecrites ok.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, '{"summary_cents":800,"sales_cents":700}'::jsonb, k_client);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'b_resume_ecrit') is not false
     or pg_temp.ok_de(r, 'b_ventes_ecrites') is not true then
    raise exception 'KO : résumé non écrit non détecté (%)', r;
  end if;
  -- f) b1 sans summary_cents → échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, '{"sales_cents":700}'::jsonb, k_client);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'b_resume_ecrit') is not false
     or pg_temp.ok_de(r, 'b_ventes_ecrites') is not true then
    raise exception 'KO : total du résumé absent accepté (%)', r;
  end if;
  -- g) b2 : une vente perdue (ou écartée), 8,00 € lus, 7,00 € en base → b_ventes_ecrites en échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb,
    '{"summary_cents":700,"sales_cents":800,"sales_count":2,"page_net_cents":800,"page_sales_count":2}'::jsonb, k_client);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'b_ventes_ecrites') is not false
     or pg_temp.ok_de(r, 'b_resume_ecrit') is not true then
    raise exception 'KO : vente perdue non détectée (%)', r;
  end if;
  -- h) b2 sans sales_cents → échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, '{"summary_cents":700}'::jsonb, k_client);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'b_ventes_ecrites') is not false then
    raise exception 'KO : total des ventes absent accepté (%)', r;
  end if;
  -- i) Contrôle du client sans `ok` → échec.
  r := finish_chatter_day('2000-01-03', '[]'::jsonb, '[]'::jsonb, k_juste,
    '[{"code":"a_resume_ventes","detail":"sans ok"},{"code":"b_total_page","ok":true,"detail":"t"},
      {"code":"c_fiche_compte","ok":true,"detail":"t"}]'::jsonb);
  if r->>'status' <> 'a_verifier' then raise exception 'KO : contrôle sans ok accepté (%)', r; end if;
  -- j) Lien refusé (990001 est déjà sur A) → c_lien_refuse en échec, tout le reste ok.
  r := finish_chatter_day('2000-01-03',
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000a3","mypuls_user_id":"990001"}]'::jsonb, '[]'::jsonb,
    k_juste, k_client);
  if r->>'status' <> 'a_verifier' or pg_temp.ok_de(r, 'c_lien_refuse') is not false
     or jsonb_array_length(r->'refused') <> 1 or (r->>'linked')::int <> 0
     or (select count(*) from jsonb_array_elements(r->'checks') e where (e->>'ok')::boolean is not true) <> 1 then
    raise exception 'KO : lien refusé (%)', r;
  end if;
  -- k) Upsert : une seule ligne pour le jour, celle du dernier appel.
  if (select count(*) from ingest_day_checks where day = '2000-01-03') <> 1
     or (select status from ingest_day_checks where day = '2000-01-03') <> 'a_verifier'
     or not exists (select 1 from ingest_day_checks k, jsonb_array_elements(k.checks) e
                     where k.day = '2000-01-03' and e->>'code' = 'c_lien_refuse') then
    raise exception 'KO : ligne de contrôle non upsertée';
  end if;
end $$;

-- 9. reliability_days : le dernier jour de creator_daily en tête, avec son statut.
do $$
declare j json; d date;
begin
  select max(date) into d from creator_daily;
  insert into ingest_day_checks (day, status) values (d, 'a_verifier') on conflict (day) do update set status = 'a_verifier';
  j := reliability_days(3);
  if json_array_length(j) <> 3 or (j->0->>'day')::date <> d or j->0->>'status' <> 'a_verifier' then
    raise exception 'KO : reliability_days (%)', j;
  end if;
  -- N borné : 1 au moins, 366 au plus, 14 si null.
  if json_array_length(reliability_days(0)) <> 1 or json_array_length(reliability_days(100000)) <> 366
     or json_array_length(reliability_days(null)) <> 14 then
    raise exception 'KO : bornes de reliability_days';
  end if;
end $$;

-- 10. unranked_chatters_ca : une fiche avec CA sans membre « chatteur » apparaît.
do $$
declare j json;
begin
  j := unranked_chatters_ca('2000-01-01', '2000-01-03');
  if not exists (select 1 from json_array_elements(j) e
                 where e->>'chatter_id' = '00000000-0000-4000-8000-0000000000a1' and (e->>'ca')::numeric = 22) then
    raise exception 'KO : CA sans membre (%)', j;
  end if;
end $$;

-- 11. Droits : les sept fonctions en SECURITY INVOKER ; les quatre d'écriture réservées à
--     service_role (fermées à anon et authenticated), les trois lectures ouvertes à authenticated,
--     fermées à anon.
do $$
declare f text;
begin
  foreach f in array array['public.apply_chatter_identity(jsonb, jsonb)',
                           'public.finish_chatter_day(date, jsonb, jsonb, jsonb, jsonb)',
                           'public.merge_chatters(uuid, uuid, text)',
                           'public.delete_empty_chatter(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'KO : droits d''exécution de %', f;
    end if;
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'KO : % devrait être SECURITY INVOKER', f;
    end if;
  end loop;
  foreach f in array array['public.unattributed_sales(date, date)',
                           'public.unranked_chatters_ca(date, date)',
                           'public.reliability_days(integer)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'KO : droits d''exécution de %', f;
    end if;
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'KO : % devrait être SECURITY INVOKER', f;
    end if;
  end loop;
end $$;

-- 12. En service_role, le seul rôle autorisé : en SECURITY INVOKER, les fonctions d'écriture ne
--     demandent aucun droit qu'il n'a pas (catalogue, tables, trigger Spenders). Si le rôle de
--     connexion ne peut pas endosser service_role, le script ÉCHOUE sur « NON JOUÉ » : jamais de
--     ligne « OK » sur un test incomplet. (`SET` : sémantique PG 16+.)
select pg_has_role(current_user, 'service_role', 'SET') as peut_service_role \gset
\if :peut_service_role
set local role service_role;
insert into chatters (id, display_name) values
  ('00000000-0000-4000-8000-0000000000b1', 'Test SR gardée'),
  ('00000000-0000-4000-8000-0000000000b2', 'Test SR vidée'),
  ('00000000-0000-4000-8000-0000000000b3', 'Test SR corrompue');
insert into chatter_daily (chatter_id, date, ca, ca_ppv, ca_tips)
values ('00000000-0000-4000-8000-0000000000b2', '2000-02-01', 4, 4, 0);
insert into spender_conversations (creator_id, fan_id, username, captured_at, assigned_chatter_id)
values ((select id from creators order by id limit 1), -434343, 'test-0183-sr', now(), '00000000-0000-4000-8000-0000000000b2');
do $$
declare r jsonb;
begin
  r := merge_chatters('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
  if (r->>'chatter_daily')::int <> 1 or (r->>'conversations')::int <> 1 then
    raise exception 'KO : fusion en service_role (%)', r;
  end if;
  perform delete_empty_chatter('00000000-0000-4000-8000-0000000000b3');
  if exists (select 1 from chatters where id = '00000000-0000-4000-8000-0000000000b3') then
    raise exception 'KO : suppression en service_role';
  end if;
  r := finish_chatter_day('2000-02-01',
    '[{"chatter_id":"00000000-0000-4000-8000-0000000000b1","mypuls_user_id":"990009"}]'::jsonb, '[]'::jsonb,
    '{"summary_cents":400,"sales_cents":0}'::jsonb,
    '[{"code":"a_resume_ventes","ok":true,"detail":"t"},{"code":"b_total_page","ok":true,"detail":"t"},
      {"code":"c_fiche_compte","ok":true,"detail":"t"}]'::jsonb);
  if r->>'status' <> 'ok' or (r->>'linked')::int <> 1 then
    raise exception 'KO : fin de journée en service_role (%)', r;
  end if;
end $$;
reset role;
\else
do $$ begin
  raise exception 'NON JOUÉ — test 12 : le rôle de connexion ne peut pas endosser service_role ; verdict incomplet, rien n''est validé (tout est annulé)';
end $$;
\endif

\echo 'OK — tests 0183 passés (tout est annulé)'
rollback;
