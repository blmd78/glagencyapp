-- « Quelle est la dernière capture ? » ne devrait pas trier 185 000 lignes.
--
-- `get-spenders.ts:58` lit UNE date — la fraîcheur affichée en tête des écrans Spenders :
--   select captured_at from spender_conversations order by captured_at desc limit 1
-- La table porte des index sur `last_message_at`, sur le chatteur assigné et sa clé primaire,
-- mais AUCUN sur `captured_at` : Postgres trie donc les 185 342 lignes (44 Mo) à chaque appel.
--
-- Relevé dans `pg_stat_statements` le 2026-09-07, en cherchant ce qui pesait pendant l'incident
-- de latence : 48 498 appels, 293 ms de moyenne, une seule ligne rendue à chaque fois — 14 202
-- secondes cumulées, soit près de QUATRE HEURES de CPU pour lire une date. Ce n'était pas la
-- cause de l'incident (254 appels/heure, ~2 % du CPU), c'est simplement du gaspillage constant.
--
-- Avec l'index, la requête devient une lecture de la première entrée : sous la milliseconde.
--
-- `desc` explicite pour coller à l'ordre demandé. B-tree se parcourt dans les deux sens, donc
-- un index ascendant conviendrait aussi ; on écrit l'ordre de la requête pour que le lien entre
-- les deux se lise sans réfléchir.
--
-- PAS DE `concurrently` : `supabase db push` enveloppe chaque migration dans une transaction, et
-- `create index concurrently` y est interdit. Sur 185 k lignes la création prend quelques
-- secondes, pendant lesquelles les écritures de cette table attendent — le seul écrivain est le
-- cron spenders de minuit.

create index if not exists spender_conversations_captured_at_idx
  on public.spender_conversations (captured_at desc);
