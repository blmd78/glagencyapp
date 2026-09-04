-- Relevé d'équipe : le DÉTAIL d'une ligne, pour reprendre la mise en page de l'ancien board.
--
-- L'ancien tracker GLA dépliait chaque chatteur sur « Sites & apps » + « Timeline » (cf.
-- .tracker-ref/board.html, `details.item > div.detail`). Les sites venaient de l'agent posé sur
-- le poste : sans équivalent chez MyPuls. La TIMELINE, elle, se reproduit — ce sont les segments
-- d'activité, et c'est même la matière la plus proche de ce que l'écran d'origine montrait.
--
-- On ajoute donc les segments du créneau à `mypuls_shift_board`. Ils ne traversent PAS vers le
-- navigateur : le Relevé est un Server Component, seules les vacations rendues arrivent au
-- client. Mesuré sur le créneau du soir du 29/08 : 965 segments, ~287 ko bruts, ramenés ici à
-- cinq colonnes.
--
-- Le REGROUPEMENT en vacations n'est volontairement pas fait ici : il vit dans
-- `packages/core/src/mypuls-shifts/groupIntoVacations`, avec ses tests — le seuil est un réglage
-- qui peut changer, et une règle de calcul écrite en SQL n'a pas de test Vitest.
--
-- `create or replace` sur la fonction de 0140, qui reste inchangée par ailleurs.

create or replace function public.mypuls_shift_board(
  p_day  date,
  p_slot text default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with bounds as (
    -- Les bornes RÉELLES du créneau, telles qu'elles ont été enregistrées le jour même. On ne
    -- les recalcule pas : les fenêtres MyPuls sont modifiables et rien n'en garde de version.
    select min(slot_start_at) as start_at, max(slot_end_at) as end_at
    from mypuls_shift_coverage
    where day = p_day and (p_slot is null or slot = p_slot)
  )
  select jsonb_build_object(
    'run', (
      select jsonb_build_object(
               'ranAt', r.ran_at,
               'idleMinutes', r.idle_minutes,
               'coverageThreshold', r.coverage_threshold,
               'unmatched', jsonb_array_length(r.unmatched)
             )
      from mypuls_shift_runs r
      where r.status = 'ok' and p_day between r.day_from and r.day_to
      order by r.ran_at desc
      limit 1
    ),
    'kpi', (
      select to_jsonb(k) - 'imported_at' from mypuls_day_kpi k where k.day = p_day
    ),
    'rows', coalesce((
      select jsonb_agg(x order by x."coveragePct" desc, x."chatterLabel")
      from (
        select c.slot,
               c.mypuls_user_id      as "mypulsUserId",
               c.chatter_label       as "chatterLabel",
               c.profile_id          as "profileId",
               p.display_name        as "memberName",
               p.shift               as "memberShift",
               (p.shift is not null and p.shift = c.slot) as "isExpected",
               c.coverage_pct        as "coveragePct",
               c.active_minutes      as "activeMinutes",
               c.messages,
               c.first_at            as "firstAt",
               c.last_at             as "lastAt",
               c.slot_start_at       as "slotStartAt",
               c.slot_end_at         as "slotEndAt",
               coalesce((
                 select jsonb_agg(m.label order by m.messages desc)
                 from (
                   select mm.value ->> 'label' as label,
                          sum((mm.value ->> 'messages')::int) as messages
                   from mypuls_shift_segments s
                        cross join lateral jsonb_array_elements(s.models) mm
                   where s.mypuls_user_id = c.mypuls_user_id
                     and s.started_at < c.slot_end_at
                     and s.ended_at   > c.slot_start_at
                   group by 1
                 ) m
               ), '[]'::jsonb) as models
        from mypuls_shift_coverage c
             left join profiles p on p.id = c.profile_id
        where c.day = p_day
          and (p_slot is null or c.slot = p_slot)
      ) x
    ), '[]'::jsonb),
    -- Les segments qui recoupent le créneau, à plat. Le service les regroupe par chatteur puis
    -- en vacations. Cinq colonnes seulement : le reste ne sert pas à l'affichage.
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'mypulsUserId', s.mypuls_user_id,
               'day', s.day,
               'startedAt', s.started_at,
               'endedAt', s.ended_at,
               'activeMinutes', s.active_minutes,
               'messages', s.messages,
               'models', s.models
             ) order by s.started_at)
      from mypuls_shift_segments s, bounds b
      where b.start_at is not null
        and s.started_at < b.end_at
        and s.ended_at   > b.start_at
    ), '[]'::jsonb),
    'silent', coalesce((
      select jsonb_agg(jsonb_build_object('profileId', p.id, 'memberName', p.display_name)
                       order by p.display_name)
      from profiles p
      where p.role = 'chatteur'
        and p.left_at is null
        and p.shift is not null
        and (p_slot is null or p.shift = p_slot)
        and not exists (
          select 1 from mypuls_shift_coverage c
          where c.day = p_day and c.slot = p.shift and c.profile_id = p.id
        )
    ), '[]'::jsonb)
  );
$$;

comment on function public.mypuls_shift_board(date, text) is
$cmt$Relevé d'équipe : run, KPI du jour, couverture enrichie, segments du créneau (pour la timeline dépliée), et les attendus sans activité$cmt$;
