-- Fiche d'activité : répondre par les DEUX clés d'identité, pas par une seule.
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
--
-- 0144 a basculé `mypuls_shift_chatter` sur `chatter_id` seul. C'était un demi-tour de trop :
-- la fiche est routée par `profileId` (`/chatter/presence/[profileId]`, on y arrive par un lien
-- nominatif), et **150 des 260 profils chatteur actifs de production n'ont pas de `chatter_id`**
-- (relevé le 2026-09-04). Leur fiche serait devenue vide, alors qu'elle fonctionnait.
--
-- Les deux clés sont donc lues en OU. Ce n'est pas une précaution : les deux populations
-- existent réellement et ne se recouvrent qu'en partie —
--   • rattaché SANS compte   → seul `chatter_id` répond (29 % des lignes) ;
--   • compte SANS rattachement → seul `profile_id` répond (150 profils) ;
--   • les deux                → les deux répondent, et l'ancien historique écrit avant 0144 ne
--                               porte parfois QUE `profile_id`.
--
-- `p_chatter` en dernier, avec un défaut : la signature `(uuid, date, date)` reste appelable
-- telle quelle. `drop` avant `create` — Postgres refuse de changer le nom d'un paramètre.

drop function if exists public.mypuls_shift_chatter(uuid, date, date);

create function public.mypuls_shift_chatter(
  p_profile uuid,
  p_from    date,
  p_to      date,
  p_chatter uuid default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with cov as (
    select c.*
    from mypuls_shift_coverage c
    where c.day between p_from and p_to
      and (c.profile_id = p_profile or (p_chatter is not null and c.chatter_id = p_chatter))
  ),
  seg as (
    select s.*
    from mypuls_shift_segments s
    where s.day between p_from and p_to
      and (s.profile_id = p_profile or (p_chatter is not null and s.chatter_id = p_chatter))
  )
  select jsonb_build_object(
    'coverage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', c.day,
               'slot', c.slot,
               'coveragePct', c.coverage_pct,
               'activeMinutes', c.active_minutes,
               'messages', c.messages,
               'firstAt', c.first_at,
               'lastAt', c.last_at
             ) order by c.day, c.slot)
      from cov c
    ), '[]'::jsonb),
    -- Jours TRAVAILLÉS = jours portant au moins un segment. Grandeur simple et vraie, qui
    -- répare au passage le défaut de `launched` (calculé sur tout le flux lu, jamais sur la
    -- fenêtre — cf. packages/core/src/tracking/segments.ts:192).
    'daysWorked', (select count(distinct s.day) from seg s),
    'activeMinutes', coalesce((select sum(s.active_minutes) from seg s), 0),
    'messages', coalesce((select sum(s.messages) from seg s), 0),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('label', m.label, 'messages', m.messages)
                       order by m.messages desc)
      from (
        select mm.value ->> 'label' as label,
               sum((mm.value ->> 'messages')::int) as messages
        from seg s cross join lateral jsonb_array_elements(s.models) mm
        group by 1
      ) m
    ), '[]'::jsonb),
    -- L'identifiant MyPuls, dont la fiche a besoin pour aller chercher le détail minute par
    -- minute À LA DEMANDE. Null = personne non rattachée : la fiche le dit au lieu d'appeler.
    'mypulsUserId', (
      select s.mypuls_user_id from seg s order by s.started_at desc limit 1
    )
  );
$$;

comment on function public.mypuls_shift_chatter(uuid, date, date, uuid) is
$cmt$Fiche d'activité : couverture, jours travaillés, modèles et id MyPuls — répond par profile_id OU chatter_id, les deux populations existant séparément$cmt$;

grant execute on function public.mypuls_shift_chatter(uuid, date, date, uuid) to authenticated;
