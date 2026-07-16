-- 0058 — Sort `citext` du schéma `public` (advisor Supabase `extension_in_public`).
-- `public` doit contenir les objets applicatifs, pas les extensions (hygiène de namespace,
-- réduction de surface). citext -> schema `extensions` (où vivent déjà pgcrypto, uuid-ossp,
-- pg_stat_statements).
--
-- Filet de sécurité : on garantit `extensions` dans le search_path par défaut de la base.
-- Les colonnes citext (chatters.email, profiles.email) restent fonctionnelles (type lié par
-- OID), mais la résolution des OPÉRATEURS citext (=, LIKE… insensibles à la casse) suit le
-- search_path : sans `extensions` dedans, une comparaison email retomberait EN SILENCE sur
-- l'opérateur `text` (sensible à la casse). Aucune requête ne compare email aujourd'hui
-- (vérifié : ni RLS, ni web, ni ingestion), mais on verrouille pour l'avenir. PostgREST
-- (contexte authenticated) pose son propre search_path par requête ; ceci couvre les
-- connexions directes / service-role / triggers.
do $$
begin
  execute 'alter database ' || quote_ident(current_database())
       || ' set search_path to "$user", public, extensions';
end $$;

alter extension citext set schema extensions;
