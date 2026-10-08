-- Test de la migration 0188 (plusieurs espaces Notion). À jouer sur l'UAT avec
-- psql : TOUT est annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0188_notion_espaces.test.sql
\set ON_ERROR_STOP on
begin;

-- 1. Deux espaces Notion côte à côte, une ligne chacun (id = id de l'espace).
insert into notion_connection (id, access_token_encrypted, workspace_id, workspace_name, bot_id)
values ('w-0188-a', 'v1:x:y:z', 'w-0188-a', 'Espace A', 'b-a'),
       ('w-0188-b', 'v1:x:y:z', 'w-0188-b', 'Espace B', 'b-b');

-- 2. Reconnecter un espace = remplacer SA ligne (upsert sur l'id), pas en ajouter une.
insert into notion_connection (id, access_token_encrypted, workspace_id, workspace_name, bot_id)
values ('w-0188-a', 'v1:new', 'w-0188-a', 'Espace A renommé', 'b-a')
on conflict (id) do update set access_token_encrypted = excluded.access_token_encrypted, workspace_name = excluded.workspace_name;
do $$
begin
  if (select count(*) from notion_connection where workspace_id = 'w-0188-a') <> 1 then
    raise exception 'KO : un espace reconnecté a créé une deuxième ligne';
  end if;
end $$;

-- 3. L'id est l'id de l'espace : une ligne au nom d'un autre espace est refusée.
do $$
begin
  insert into notion_connection (id, access_token_encrypted, workspace_id, workspace_name, bot_id)
  values ('agence', 'v1:x:y:z', 'w-0188-c', 'Espace C', 'b-c');
  raise exception 'KO : id différent de l''espace accepté';
exception when check_violation then null;
end $$;

-- 4. Toujours service role seul : un utilisateur connecté ne voit aucune connexion.
set local role authenticated;
do $$
begin
  if (select count(*) from notion_connection) <> 0 then
    raise exception 'KO : notion_connection lisible par un utilisateur connecté';
  end if;
end $$;

select 'OK : 0188 — une ligne par espace Notion, reconnexion = remplacement, service role seul' as resultat;
rollback;
