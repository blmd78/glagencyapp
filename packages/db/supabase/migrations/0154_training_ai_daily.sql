-- 0154 — L'usage de l'IA d'entraînement, jour par jour.
--
-- Demande Benoit 2026-09-12 : « avoir des analytics sur l'IA, les coûts journaliers, savoir
-- combien de chatteurs l'utilisent par jour […] pour savoir pourquoi ça coûte cher ».
--
-- POURQUOI UNE RPC : `training_ai_calls` prend ~140 000 lignes par mois. Les charger pour
-- compter côté app serait une lecture de 4 Mo à chaque rendu ; et le nombre de chatteurs
-- distincts par jour exige une jointure sur `training_sessions` que PostgREST ne fait pas en
-- agrégat. `training_ai_cost` (0119) existe déjà mais ne rend ni les chatteurs ni la latence,
-- et ne joint pas les sessions — elle reste en place, elle sert le détail par modèle.
--
-- `security invoker` (pas definer) : la page est admin-only et la RLS de `training_ai_calls`
-- suffit. Rien ici n'a besoin de contourner quoi que ce soit — contrairement au Récap de la
-- To-Do, qui doit compter des débriefs sans les lire.

create or replace function public.training_ai_daily(p_since timestamptz)
returns table (
  day date,
  chatters integer,
  sessions integer,
  fan_calls integer,
  score_calls integer,
  fan_input bigint,
  fan_output bigint,
  fan_cache_read bigint,
  score_input bigint,
  score_output bigint,
  score_cache_read bigint,
  score_cache_write bigint,
  failed integer,
  p95_latency_ms integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (c.created_at at time zone 'Europe/Paris')::date                            as day,
    count(distinct s.profile_id)::integer                                        as chatters,
    count(distinct c.session_id)::integer                                        as sessions,
    count(*) filter (where c.kind = 'fan')::integer                              as fan_calls,
    count(*) filter (where c.kind = 'score')::integer                            as score_calls,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'fan'), 0)         as fan_input,
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'fan'), 0)         as fan_output,
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'fan'), 0)         as fan_cache_read,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'score'), 0)       as score_input,
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'score'), 0)       as score_output,
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'score'), 0)       as score_cache_read,
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'score'), 0)       as score_cache_write,
    count(*) filter (where not c.ok)::integer                                    as failed,
    -- La latence que VIT un chatteur : le 95e centile, pas la moyenne — une poignée d'appels
    -- très lents est exactement ce qui fait dire « l'IA rame », et la moyenne les noie.
    coalesce(percentile_disc(0.95) within group (order by c.latency_ms), 0)::integer as p95_latency_ms
  from training_ai_calls c
  join training_sessions s on s.id = c.session_id
  where c.created_at >= p_since
  group by 1
  order by 1 desc;
$$;

revoke all on function public.training_ai_daily(timestamptz) from public;
grant execute on function public.training_ai_daily(timestamptz) to authenticated;

comment on function public.training_ai_daily(timestamptz) is
  'Usage quotidien de l''IA d''entrainement : chatteurs distincts, sessions, appels et tokens '
  'par sorte (fan / notation), echecs et latence p95. security INVOKER : la RLS de '
  'training_ai_calls suffit, la page est admin-only.';
