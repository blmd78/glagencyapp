-- 0088 — Hygiène : anon perd EXECUTE sur toutes les fonctions de `public`.
--
-- Découverte de l'audit cascade (2026-07-28, en durcissant managed_subtree/0087) : les
-- DEFAULT PRIVILEGES d'un projet Supabase donnent EXECUTE à anon/authenticated/service_role
-- à la CRÉATION de chaque fonction. Le pattern historique du repo — `revoke all … from
-- public; grant execute … to authenticated;` — ne retire donc RIEN à anon : son grant est
-- EXPLICITE, pas hérité de PUBLIC. Vérifié empiriquement : 24 fonctions de `public`
-- (is_admin, manages, les RPC *_report, les triggers…) étaient exécutables par anon.
--
-- Risque réel faible — auth.uid() null → false/vide, et AUCUNE policy ne vise anon (vérifié
-- pg_policies : 0) donc aucun chemin RLS anonyme à casser — mais une fonction RLS exposée en
-- rpc anonyme reste une surface inutile (ex. chatter_first_seen(uuid) répondrait à un anonyme).
--
-- Deux coups : purger l'existant, et corriger le DÉFAUT pour que les prochaines migrations
-- n'aient plus à y penser (les futures fonctions créées par le rôle des migrations ne
-- donneront plus EXECUTE à anon).
--
-- `authenticated` et `service_role` ne bougent pas : les fonctions appelées par les policies
-- s'exécutent sous le rôle du requérant — authenticated DOIT garder EXECUTE.

revoke execute on all functions in schema public from anon;

alter default privileges in schema public revoke execute on functions from anon;

-- Deuxième chemin découvert à l'application : 12 fonctions (les RPC *_report, les triggers,
-- chatter_first_seen…) portaient AUSSI un grant à PUBLIC (`=X/postgres`) — anon en héritait
-- même après le revoke ci-dessus. Leurs ACL montrent toutes des grants EXPLICITES
-- authenticated + service_role : révoquer PUBLIC ne retire donc l'accès qu'à anon.
revoke execute on all functions in schema public from public;

alter default privileges in schema public revoke execute on functions from public;
