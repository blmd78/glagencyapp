-- 0158 — L'écriture de cache du FAN entre enfin dans les compteurs.
--
-- `training_ai_daily`, `training_ai_by_chatter` et `training_ai_by_case` rendaient toutes trois
-- `score_cache_write` mais PAS son équivalent côté fan. Le service passait donc
-- `cacheWriteTokens: 0` pour le fan, et les TROIS blocs qu'elles alimentent — le graphe
-- journalier, le classement par chatteur, le classement par exercice — sous-estimaient son coût.
-- Le quatrième, le tableau par modèle, vient de `training_ai_cost` qui a toujours remonté la
-- colonne : d'où deux totaux différents sur le même écran.
--
-- POURQUOI MAINTENANT, alors que l'écart vaut 1,19 $ sur TOUT l'historique : il est petit
-- uniquement parce que le cache du fan ne fonctionne pas. Le fan envoie ~1 881 tokens quand
-- Haiku 4.5 en exige 4 096 pour cacher quoi que ce soit — c'est le diagnostic que la page sert
-- à poser. Le jour où les prompts passeront ce seuil, ces écritures grimperont vers l'ordre de
-- grandeur de la notation (17,2 millions de tokens, 68,94 $), et l'écart deviendrait criant
-- au moment précis où l'on voudrait mesurer si l'optimisation a marché. On répare le compteur
-- AVANT de toucher à ce qu'il mesure.
--
-- NON CASSANTE, contrairement à 0157 : la signature ne bouge pas, on AJOUTE une colonne au
-- résultat. Un appelant qui l'ignore — le code en production tant que la release n'est pas
-- déployée — continue de lire les siennes. L'ordre migration/déploiement est donc libre ici.
-- Le `drop` reste obligatoire : Postgres refuse de changer le type de retour d'une fonction
-- (`cannot change return type of existing function`), même pour y ajouter une colonne.
--
-- Corps REPRIS À L'IDENTIQUE de `pg_get_functiondef` en production (même précédent que 0153) :
-- seule la ligne `fan_cache_write` s'ajoute, à sa place logique — juste après `fan_cache_read`,
-- pour que l'ordre des colonnes fan reste le miroir de celui des colonnes score.

drop function if exists public.training_ai_daily(timestamptz, timestamptz);
drop function if exists public.training_ai_by_chatter(timestamptz, timestamptz);
drop function if exists public.training_ai_by_case(timestamptz, timestamptz);

create or replace function public.training_ai_daily(p_since timestamptz, p_until timestamptz)
returns table (
  day date, chatters integer, sessions integer, fan_calls integer, score_calls integer,
  fan_input bigint, fan_output bigint, fan_cache_read bigint, fan_cache_write bigint,
  score_input bigint, score_output bigint, score_cache_read bigint, score_cache_write bigint,
  failed integer, p95_latency_ms integer
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select
    (c.created_at at time zone 'Europe/Paris')::date,
    count(distinct s.profile_id)::integer,
    count(distinct c.session_id)::integer,
    count(*) filter (where c.kind = 'fan')::integer,
    count(*) filter (where c.kind = 'score')::integer,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'score'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'score'), 0),
    count(*) filter (where not c.ok)::integer,
    -- Le 95e centile, pas la moyenne : une poignée d'appels très lents est exactement ce qui
    -- fait dire « l'IA rame », et la moyenne les noie.
    coalesce(percentile_disc(0.95) within group (order by c.latency_ms), 0)::integer
  from training_ai_calls c
  join training_sessions s on s.id = c.session_id
  where c.created_at >= p_since and c.created_at < p_until
  group by 1
  order by 1 desc;
$$;

create or replace function public.training_ai_by_chatter(p_since timestamptz, p_until timestamptz)
returns table (
  profile_id uuid, name text, active_days integer, sessions integer,
  fan_calls integer, score_calls integer,
  fan_input bigint, fan_output bigint, fan_cache_read bigint, fan_cache_write bigint,
  score_input bigint, score_output bigint, score_cache_read bigint, score_cache_write bigint
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select
    s.profile_id,
    coalesce(p.discord, p.display_name, '—'),
    count(distinct (c.created_at at time zone 'Europe/Paris')::date)::integer,
    count(distinct c.session_id)::integer,
    count(*) filter (where c.kind = 'fan')::integer,
    count(*) filter (where c.kind = 'score')::integer,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'score'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'score'), 0)
  from training_ai_calls c
  join training_sessions s on s.id = c.session_id
  join profiles p on p.id = s.profile_id
  where c.created_at >= p_since and c.created_at < p_until
  group by s.profile_id, coalesce(p.discord, p.display_name, '—')
  order by 5 desc;
$$;

create or replace function public.training_ai_by_case(p_since timestamptz, p_until timestamptz)
returns table (
  case_id uuid, fan_name text, case_title text, module_title text, kind text,
  sessions integer, chatters integer, fan_calls integer,
  fan_input bigint, fan_output bigint, fan_cache_read bigint, fan_cache_write bigint,
  score_input bigint, score_output bigint, score_cache_read bigint, score_cache_write bigint
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select
    tc.id,
    -- `fan_name` peut être vide sur un cas ancien : le titre reste l'identité de secours.
    coalesce(nullif(btrim(tc.fan_name), ''), '—'),
    tc.title,
    coalesce(tm.title, '—'),
    tc.kind,
    count(distinct c.session_id)::integer,
    count(distinct s.profile_id)::integer,
    count(*) filter (where c.kind = 'fan')::integer,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'fan'), 0),
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'score'), 0),
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'score'), 0),
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'score'), 0)
  from training_ai_calls c
  join training_sessions s on s.id = c.session_id
  join training_cases tc on tc.id = s.case_id
  left join training_modules tm on tm.id = tc.module_id
  where c.created_at >= p_since and c.created_at < p_until
  group by tc.id, tc.fan_name, tc.title, tm.title, tc.kind
  -- Colonne 9 = `fan_input` : l'ordre reste celui des tokens d'entrée du fan, comme en 0156.
  order by 9 desc;
$$;

revoke all on function public.training_ai_daily(timestamptz, timestamptz) from public, anon;
revoke all on function public.training_ai_by_case(timestamptz, timestamptz) from public, anon;
revoke all on function public.training_ai_by_chatter(timestamptz, timestamptz) from public, anon;
grant execute on function public.training_ai_daily(timestamptz, timestamptz) to authenticated;
grant execute on function public.training_ai_by_chatter(timestamptz, timestamptz) to authenticated;
grant execute on function public.training_ai_by_case(timestamptz, timestamptz) to authenticated;

comment on function public.training_ai_daily(timestamptz, timestamptz) is
  'Usage IA par jour sur [p_since, p_until). Rend fan_cache_write depuis 0158.';
comment on function public.training_ai_by_chatter(timestamptz, timestamptz) is
  'Usage IA par chatteur sur [p_since, p_until). Rend fan_cache_write depuis 0158.';
comment on function public.training_ai_by_case(timestamptz, timestamptz) is
  'Usage IA par exercice sur [p_since, p_until). Rend fan_cache_write depuis 0158.';
