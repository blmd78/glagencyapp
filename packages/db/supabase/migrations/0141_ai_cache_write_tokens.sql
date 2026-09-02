-- 0141 — Compter les tokens ÉCRITS en cache dans le coût IA.
--
-- La notation (Sonnet 5, 47 % de la facture IA) passe en prompt caching : son prompt système est
-- identique pour un même cas, et 80 % des notations d'un même cas s'enchaînent en moins d'une heure
-- (mesuré sur 2 822 notations, 3 jours). Mesuré en conditions réelles : 3 881 tokens sur ~5 075
-- entrent dans le cache, soit 76 % de l'entrée.
--
-- Sans cette colonne, l'écran de coût de l'Overview aurait CÉLÉBRÉ une économie en partie fictive :
-- `usage.input_tokens` EXCLUT les tokens écrits en cache, et une écriture TTL 1 h est facturée 2× le
-- prix d'entrée. Les lectures (0,1×) étaient déjà comptées, les écritures ne l'étaient nulle part —
-- on aurait vu l'entrée s'effondrer sans voir ce qui la remplace. On veut mesurer, pas se rassurer.
--
-- Le fan (Haiku 4.5) reste hors cache : son préfixe fait ~2 400 tokens, sous le minimum de 4 096 du
-- modèle. Vérifié à l'appel (`cache_creation` et `cache_read` à 0) — la colonne restera à 0 pour lui.
alter table training_ai_calls add column if not exists cache_write_tokens integer not null default 0;

-- Le type de retour change : `create or replace` ne suffit pas, il faut retirer puis recréer.
drop function if exists training_ai_cost(timestamptz);

create function training_ai_cost(p_since timestamptz)
returns table(day date, model text, kind text, calls integer, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select (created_at at time zone 'Europe/Paris')::date, model, kind, count(*)::integer,
         sum(input_tokens), sum(output_tokens), sum(cache_read_tokens), sum(cache_write_tokens)
  from training_ai_calls
  where created_at >= p_since
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

-- Droits rendus à l'identique de l'existant (relevé en prod avant la reprise : postgres,
-- authenticated, service_role — un `drop` les emporte, il faut les reposer).
revoke all on function training_ai_cost(timestamptz) from public;
grant execute on function training_ai_cost(timestamptz) to authenticated, service_role;
