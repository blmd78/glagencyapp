-- Test de la migration 0187 (verrou d'envoi des scripts). À jouer sur l'UAT avec psql : TOUT est
-- annulé à la fin (rollback). Chaque échec lève « KO : … » et arrête le script.
-- Usage : psql "$UAT_DB" -v ON_ERROR_STOP=1 -f packages/db/supabase/tests/0187_script_send_lock.test.sql
\set ON_ERROR_STOP on
begin;

-- 1. Verrou libre → pris ; déjà pris par un autre → refusé ; repris par son détenteur → refusé aussi.
do $$
begin
  update script_send_lock set holder = null, acquired_at = null where id = 'scripts';
  if not acquire_script_send_lock('00000000-0000-4000-8000-0000000187a1') then
    raise exception 'KO : verrou libre non acquis';
  end if;
  if acquire_script_send_lock('00000000-0000-4000-8000-0000000187a2') then
    raise exception 'KO : deux envois simultanés (verrou pris deux fois)';
  end if;
end $$;

-- 2. Rendu par un AUTRE que le détenteur : sans effet ; par le détenteur : libéré.
do $$
begin
  perform release_script_send_lock('00000000-0000-4000-8000-0000000187a2');
  if acquire_script_send_lock('00000000-0000-4000-8000-0000000187a2') then
    raise exception 'KO : un autre envoi a libéré le verrou qu''il ne détenait pas';
  end if;
  perform release_script_send_lock('00000000-0000-4000-8000-0000000187a1');
  if not acquire_script_send_lock('00000000-0000-4000-8000-0000000187a2') then
    raise exception 'KO : verrou non libéré par son détenteur';
  end if;
end $$;

-- 3. Verrou abandonné (envoi coupé) : repris au-delà de 15 min, pas avant.
do $$
begin
  update script_send_lock set acquired_at = now() - interval '14 minutes' where id = 'scripts';
  if acquire_script_send_lock('00000000-0000-4000-8000-0000000187a3') then
    raise exception 'KO : verrou volé avant expiration';
  end if;
  update script_send_lock set acquired_at = now() - interval '16 minutes' where id = 'scripts';
  if not acquire_script_send_lock('00000000-0000-4000-8000-0000000187a3') then
    raise exception 'KO : verrou abandonné jamais repris';
  end if;
end $$;

-- 4. Réservé au service role : un utilisateur connecté ne peut ni appeler les fonctions ni lire la table.
set local role authenticated;
do $$
begin
  perform acquire_script_send_lock('00000000-0000-4000-8000-0000000187a4');
  raise exception 'KO : acquire_script_send_lock appelable par un utilisateur connecté';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  if (select count(*) from script_send_lock) <> 0 then
    raise exception 'KO : script_send_lock lisible par un utilisateur connecté';
  end if;
exception when insufficient_privilege then null;
end $$;

select 'OK : 0187 — verrou d''envoi exclusif, rendu par son seul détenteur, repris après 15 min, service role seul' as resultat;
rollback;
