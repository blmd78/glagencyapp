-- Lectures du relevé « Contrôle des shifts » MyPuls — le front (0138 pose les tables).
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
--
-- POURQUOI DU `jsonb` ET PAS UN `returns table` : PostgREST tronque à 1000 lignes EN SILENCE,
-- et le piège mord AUSSI les fonctions set-returning (mesuré à l'audit du 2026-07-29). Or un
-- seul jour de `mypuls_shift_segments` fait ~2 600 lignes. Une fonction qui rend UNE ligne de
-- `jsonb` n'a aucune limite de lignes à franchir. Précédent : `tracker_window` (0126).
--
-- `security invoker` PARTOUT : la RLS de 0138 s'applique à l'appelant, exactement comme un
-- select direct. Aucun privilège emprunté — contrairement à `tracker_todo_week_recap` (0137),
-- qui devait compter sans laisser lire ; ici il n'y a rien à cacher qui ne soit déjà lisible.
--
-- Les bornes de jour arrivent en PARAMÈTRE, calculées côté TypeScript avec `todayParis()` :
-- `current_date` dans le corps d'une fonction est un piège de fuseau (serveur en UTC, agence à
-- Paris) — la journée bascule deux heures trop tôt.

-- ---------------------------------------------------------------------------
-- 1. Le relevé d'équipe — un jour, un créneau
-- ---------------------------------------------------------------------------

-- Rend TOUT ce dont l'écran a besoin en un aller-retour : l'état du run (sans lui, « aucune
-- donnée » et « le scrape a échoué » seraient indiscernables), les 6 tuiles du jour, et la
-- couverture enrichie du membre CRM.
--
-- Le filtre par créneau est fait ICI et pas en TypeScript : la couverture d'un jour, c'est
-- ~206 lignes, mais la page n'en montre qu'un tiers. Autant ne pas les transporter.
create or replace function public.mypuls_shift_board(
  p_day  date,
  p_slot text default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    -- `run` null = aucun run réussi ne couvre ce jour → l'écran affiche « relevé indisponible »
    -- et NON des zéros. C'est le garde-fou du chantier : un zéro se lit « personne n'a
    -- travaillé », et cette lecture-là produit des sanctions injustes.
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
               -- Le créneau ATTENDU de la personne (0110 : `profiles.shift`). C'est lui qui
               -- décide quelle ligne compte : sans ça, le zèle d'un chatteur qui dépanne un
               -- autre créneau se lirait comme une faute.
               (p.shift is not null and p.shift = c.slot) as "isExpected",
               c.coverage_pct        as "coveragePct",
               c.active_minutes      as "activeMinutes",
               c.messages,
               c.first_at            as "firstAt",
               c.last_at             as "lastAt",
               c.slot_start_at       as "slotStartAt",
               c.slot_end_at         as "slotEndAt",
               -- Modèles OBSERVÉS sur le créneau, du plus bavard au moins bavard. Observés et
               -- non déclarés : ce sont les messages envoyés qui le prouvent.
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
    -- Les chatteurs ATTENDUS sur ce créneau qui n'ont aucune ligne de couverture. Affichés
    -- « aucune activité », en neutre — JAMAIS « absent » : sans source de jours travaillés,
    -- chaque jour de repos deviendrait un signalement.
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
$cmt$Relevé d'équipe : état du run, 6 KPI du jour, couverture enrichie du membre, et les attendus sans activité$cmt$;

grant execute on function public.mypuls_shift_board(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Les vacations — une personne ou tout le monde, sur une plage
-- ---------------------------------------------------------------------------

-- Rend les SEGMENTS bruts : le regroupement en vacations se fait dans le domaine testé
-- (`packages/core/src/mypuls-shifts/groupIntoVacations`), pas ici. Deux raisons : le seuil de
-- regroupement est un réglage qui peut changer, et une règle de calcul qui vit en SQL n'a pas
-- de test Vitest.
--
-- La plage est bornée à 62 jours pour que la réponse reste transportable : ~2 600 segments par
-- jour pour toute l'agence. Au-delà, c'est un export, pas un écran.
create or replace function public.mypuls_shift_segments_range(
  p_from    date,
  p_to      date,
  p_profile uuid default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x."startedAt"), '[]'::jsonb)
  from (
    select s.mypuls_user_id  as "mypulsUserId",
           s.profile_id      as "profileId",
           p.display_name    as "memberName",
           s.day,
           s.started_at      as "startedAt",
           s.ended_at        as "endedAt",
           s.active_minutes  as "activeMinutes",
           s.messages,
           s.models
    from mypuls_shift_segments s
         left join profiles p on p.id = s.profile_id
    where s.day between p_from and least(p_to, p_from + 61)
      and (p_profile is null or s.profile_id = p_profile)
  ) x;
$$;

comment on function public.mypuls_shift_segments_range(date, date, uuid) is
$cmt$Segments bruts sur une plage (62 j max) — le regroupement en vacations vit dans @glagency/core$cmt$;

grant execute on function public.mypuls_shift_segments_range(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. La couverture d'une personne — pour sa fiche
-- ---------------------------------------------------------------------------

create or replace function public.mypuls_shift_chatter(
  p_profile uuid,
  p_from    date,
  p_to      date
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
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
      from mypuls_shift_coverage c
      where c.profile_id = p_profile and c.day between p_from and p_to
    ), '[]'::jsonb),
    -- Jours TRAVAILLÉS = jours portant au moins un segment. Grandeur simple et vraie, qui
    -- répare au passage le défaut de `launched` (calculé sur tout le flux lu, jamais sur la
    -- fenêtre — cf. packages/core/src/tracking/segments.ts:192).
    'daysWorked', (
      select count(distinct s.day)
      from mypuls_shift_segments s
      where s.profile_id = p_profile and s.day between p_from and p_to
    ),
    'activeMinutes', coalesce((
      select sum(s.active_minutes) from mypuls_shift_segments s
      where s.profile_id = p_profile and s.day between p_from and p_to
    ), 0),
    'messages', coalesce((
      select sum(s.messages) from mypuls_shift_segments s
      where s.profile_id = p_profile and s.day between p_from and p_to
    ), 0),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('label', m.label, 'messages', m.messages)
                       order by m.messages desc)
      from (
        select mm.value ->> 'label' as label,
               sum((mm.value ->> 'messages')::int) as messages
        from mypuls_shift_segments s
             cross join lateral jsonb_array_elements(s.models) mm
        where s.profile_id = p_profile and s.day between p_from and p_to
        group by 1
      ) m
    ), '[]'::jsonb),
    -- L'identifiant MyPuls, dont la fiche a besoin pour aller chercher le détail minute par
    -- minute À LA DEMANDE. Null = personne non rattachée : la fiche le dit au lieu d'appeler.
    'mypulsUserId', (
      select s.mypuls_user_id from mypuls_shift_segments s
      where s.profile_id = p_profile order by s.started_at desc limit 1
    )
  );
$$;

comment on function public.mypuls_shift_chatter(uuid, date, date) is
$cmt$Fiche d'activité : couverture jour par jour, jours travaillés, modèles, et l'id MyPuls pour le détail à la demande$cmt$;

grant execute on function public.mypuls_shift_chatter(uuid, date, date) to authenticated;
