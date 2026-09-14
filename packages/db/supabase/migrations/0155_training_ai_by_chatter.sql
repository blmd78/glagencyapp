-- 0155 — L'usage de l'IA d'entraînement, chatteur par chatteur.
--
-- Complète `training_ai_daily` (0154) : celle-ci dit COMBIEN on dépense par jour, celle-là QUI
-- dépense. Demande Benoit 2026-09-12, après la découverte que la dépense monte (38 $/jour en
-- septembre contre 15 $ en août) : avant de toucher au prompt, savoir si la hausse vient de
-- quelques gros consommateurs ou de tout le monde.
--
-- Relevé au moment de l'écrire : 118 chatteurs, 4,52 $ chacun en moyenne, le top 10 pèse 33 %
-- du coût et le premier cinquième 61 %. Concentration réelle mais pas extrême — le levier est
-- le prompt, pas les individus. La page le montre plutôt que de le faire croire.
--
-- Le NOM suit la règle de 0153 : pseudo Discord d'abord, `display_name` en repli.
--
-- `security invoker` : la page est admin-only, la RLS de `training_ai_calls` suffit.

create or replace function public.training_ai_by_chatter(p_since timestamptz)
returns table (
  profile_id uuid,
  name text,
  active_days integer,
  sessions integer,
  fan_calls integer,
  score_calls integer,
  fan_input bigint,
  fan_output bigint,
  fan_cache_read bigint,
  score_input bigint,
  score_output bigint,
  score_cache_read bigint,
  score_cache_write bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    s.profile_id,
    coalesce(p.discord, p.display_name, '—')                                     as name,
    count(distinct (c.created_at at time zone 'Europe/Paris')::date)::integer     as active_days,
    count(distinct c.session_id)::integer                                         as sessions,
    count(*) filter (where c.kind = 'fan')::integer                               as fan_calls,
    count(*) filter (where c.kind = 'score')::integer                             as score_calls,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'fan'), 0)          as fan_input,
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'fan'), 0)          as fan_output,
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'fan'), 0)          as fan_cache_read,
    coalesce(sum(c.input_tokens)       filter (where c.kind = 'score'), 0)        as score_input,
    coalesce(sum(c.output_tokens)      filter (where c.kind = 'score'), 0)        as score_output,
    coalesce(sum(c.cache_read_tokens)  filter (where c.kind = 'score'), 0)        as score_cache_read,
    coalesce(sum(c.cache_write_tokens) filter (where c.kind = 'score'), 0)        as score_cache_write
  from training_ai_calls c
  join training_sessions s on s.id = c.session_id
  join profiles p on p.id = s.profile_id
  where c.created_at >= p_since
  group by s.profile_id, coalesce(p.discord, p.display_name, '—')
  order by 6 desc;
$$;

revoke all on function public.training_ai_by_chatter(timestamptz) from public;
grant execute on function public.training_ai_by_chatter(timestamptz) to authenticated;

comment on function public.training_ai_by_chatter(timestamptz) is
  'Usage de l''IA d''entrainement PAR CHATTEUR sur une fenetre : jours actifs, sessions, appels '
  'et tokens par sorte. Le cout se calcule cote app (lib/ai-pricing). Nom = pseudo Discord '
  'd''abord (0153). security INVOKER : page admin-only, la RLS de training_ai_calls suffit.';
