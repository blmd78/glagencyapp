-- 0156 — L'analytics IA passe sur une PÉRIODE, et se décline par exercice.
--
-- Demande Benoit 2026-09-12 : le sélecteur de dates du header doit piloter la page, comme sur
-- la face chatteurs. Les RPC de 0154/0155 ne prenaient qu'un `p_since` — elles ne savaient pas
-- borner la fin. Elles sont recréées avec `p_until` ; la signature change, d'où le `drop`
-- préalable (Postgres surchargerait sinon, et l'app appellerait l'une ou l'autre au hasard).
--
-- `training_ai_by_case` est nouvelle : QUEL EXERCICE consomme. C'est le grain qui manquait —
-- 0154 dit combien par jour, 0155 qui dépense, et celle-ci sur quoi. Le fan d'un cas
-- (`training_cases.fan_name`) est le personnage que le chatteur affronte : deux exercices
-- peuvent coûter du simple au double selon la longueur de sa fiche et le nombre de tours.
--
-- Les trois bornent `[p_since, p_until)` — borne haute EXCLUE, pour qu'un appel de 23h59 le
-- dernier jour compte et qu'aucun ne soit compté deux fois sur deux périodes adjacentes.

drop function if exists public.training_ai_daily(timestamptz);
drop function if exists public.training_ai_by_chatter(timestamptz);

create or replace function public.training_ai_daily(p_since timestamptz, p_until timestamptz)
returns table (
  day date, chatters integer, sessions integer, fan_calls integer, score_calls integer,
  fan_input bigint, fan_output bigint, fan_cache_read bigint,
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
  fan_input bigint, fan_output bigint, fan_cache_read bigint,
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

-- ── NOUVEAU : par EXERCICE, avec le fan qu'on y affronte ────────────────────────────────────
create or replace function public.training_ai_by_case(p_since timestamptz, p_until timestamptz)
returns table (
  case_id uuid, fan_name text, case_title text, module_title text, kind text,
  sessions integer, chatters integer, fan_calls integer,
  fan_input bigint, fan_output bigint, fan_cache_read bigint,
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
  order by 9 desc;
$$;

revoke all on function public.training_ai_daily(timestamptz, timestamptz) from public;
revoke all on function public.training_ai_by_chatter(timestamptz, timestamptz) from public;
revoke all on function public.training_ai_by_case(timestamptz, timestamptz) from public;
grant execute on function public.training_ai_daily(timestamptz, timestamptz) to authenticated;
grant execute on function public.training_ai_by_chatter(timestamptz, timestamptz) to authenticated;
grant execute on function public.training_ai_by_case(timestamptz, timestamptz) to authenticated;

comment on function public.training_ai_by_case(timestamptz, timestamptz) is
  'Usage de l''IA par EXERCICE sur une periode : le fan affronte, les sessions, les chatteurs '
  'distincts et les tokens. Dit QUEL exercice coute, la ou training_ai_daily dit quand et '
  'training_ai_by_chatter dit qui. Borne haute EXCLUE.';
