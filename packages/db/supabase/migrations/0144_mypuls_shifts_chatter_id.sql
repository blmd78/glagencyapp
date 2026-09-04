-- Relevé MyPuls : la clé d'identité passe sur `chatters`, comme le reste du CRM.
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md (corrige D6)
--
-- CE QUI ÉTAIT FAUX. 0138 ne résolvait que `profile_id`, si bien qu'une personne mesurée par
-- MyPuls n'avait de ligne nommée QUE si elle possédait un compte membre. Relevé en production
-- le 2026-09-04 : 260 profils chatteur actifs pour 486 lignes `chatters`, et seulement 110
-- profils portent un `chatter_id`. Sur l'UAT rempli des 59 jours de rattrapage, ça donnait
-- 8 071 lignes de couverture nommées sur 14 802 — et **4 248 lignes (29 %) dont le `chatters`
-- était pourtant parfaitement connu**, simplement dépourvu de compte membre.
--
-- POURQUOI `chatters` EST LA BONNE CLÉ. C'est la colonne vertébrale du modèle : `chatter_daily`,
-- `chatter_creator_daily`, `chatter_creators`, `chatter_alias`, `insights`, `relances` et les
-- deux tables `spender_*` pointent toutes sur `chatters(id)`. `profiles` est le SEUL à la
-- référencer dans l'autre sens (`profiles.chatter_id`, 1:1). Le relevé était l'exception, et
-- c'est l'exception qui produisait les trous. Le lien intra-app fait le reste.
--
-- `profile_id` RESTE, et n'est pas redondant : c'est lui qui porte le créneau attendu
-- (`profiles.shift`), la fiche d'activité, et l'identité qu'exige une sanction
-- (`police_entries.chatter_id` pointe sur `profiles` depuis 0078). Un chatteur sans compte a
-- désormais sa ligne et son nom, mais ni fiche ni signalement — et c'est exact, pas un défaut.

-- ---------------------------------------------------------------------------
-- 1. La colonne, sur les deux tables de faits
-- ---------------------------------------------------------------------------

alter table public.mypuls_shift_segments
  add column if not exists chatter_id uuid references public.chatters(id) on delete set null;

alter table public.mypuls_shift_coverage
  add column if not exists chatter_id uuid references public.chatters(id) on delete set null;

comment on column public.mypuls_shift_segments.chatter_id is
$cmt$chatters(id) résolu via chatters.mypuls_user_id — la clé d'identité du CRM. Se remplit sans compte membre, contrairement à profile_id$cmt$;
comment on column public.mypuls_shift_coverage.chatter_id is
$cmt$chatters(id) résolu via chatters.mypuls_user_id. C'est LUI qui porte le nom et le périmètre modèles (chatter_creators) quand la personne n'a pas de compte$cmt$;

-- Le périmètre modèles se lit désormais par `chatter_creators` : l'index porte donc sur
-- (chatter_id, day), l'ordre dans lequel les écrans interrogent.
create index if not exists mypuls_shift_segments_chatter_day_idx
  on public.mypuls_shift_segments (chatter_id, day) where chatter_id is not null;
create index if not exists mypuls_shift_coverage_chatter_day_idx
  on public.mypuls_shift_coverage (chatter_id, day) where chatter_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Rattrapage de l'existant
-- ---------------------------------------------------------------------------
-- Par `mypuls_user_id`, le pont que les runs construisent au fil de l'eau (0138 §4.6). Aucun
-- rapprochement par NOM ici : le nom se rapproche dans l'ingestion, où vit `normLabel` — la
-- source unique partagée avec money-team et spenders. Le refaire en SQL, avec une autre
-- normalisation, c'est se garantir deux résultats différents pour la même personne.

update public.mypuls_shift_segments t
   set chatter_id = ch.id
  from public.chatters ch
 where ch.mypuls_user_id = t.mypuls_user_id
   and t.chatter_id is null;

update public.mypuls_shift_coverage t
   set chatter_id = ch.id
  from public.chatters ch
 where ch.mypuls_user_id = t.mypuls_user_id
   and t.chatter_id is null;

-- ---------------------------------------------------------------------------
-- 3. RLS — un membre lit toujours SES lignes, désormais aussi par son chatteur
-- ---------------------------------------------------------------------------
-- La clause `profile_id = auth.uid()` de 0138 laissait un membre lire ses propres lignes. Elle
-- restait muette pour un membre dont le `chatter_id` est rattaché mais dont les lignes
-- anciennes n'avaient pas de `profile_id`. On ajoute le chemin par `chatters`, en gardant
-- l'ancien : les deux disent la même chose, et perdre l'un rendrait des lignes invisibles.

drop policy if exists mypuls_shift_segments_read on public.mypuls_shift_segments;
create policy mypuls_shift_segments_read on public.mypuls_shift_segments for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_page('presence'))
    or profile_id = (select auth.uid())
    or chatter_id = (select p.chatter_id from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists mypuls_shift_coverage_read on public.mypuls_shift_coverage;
create policy mypuls_shift_coverage_read on public.mypuls_shift_coverage for select to authenticated
  using (
    (select public.is_admin())
    or (select public.has_page('presence'))
    or profile_id = (select auth.uid())
    or chatter_id = (select p.chatter_id from public.profiles p where p.id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 4. Les lectures — `chatterId` partout, et le nom qui ne dépend plus d'un compte
-- ---------------------------------------------------------------------------
-- Les fonctions rendent l'ID du chatteur, pas son nom : `chatters` est en lecture BORNÉE
-- (`chatters_scoped_read` exige d'être admin ou d'avoir au moins un modèle assigné), donc en
-- `security invoker` un porteur de `presence` sans assignation lirait `null` en silence. Les
-- noms sont résolus en service-role côté service, exactement comme ceux de `profiles`
-- (`displayNames`) — même contrainte, même parade.

create or replace function public.mypuls_shift_board(
  p_day  date,
  p_slot text default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with bounds as (
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
               c.chatter_id          as "chatterId",
               c.profile_id          as "profileId",
               p.display_name        as "memberName",
               p.shift               as "memberShift",
               -- Le créneau attendu vient du COMPTE MEMBRE et de lui seul : sans compte, pas
               -- de créneau attendu, donc jamais d'écart. Un chatteur sans compte n'est ni
               -- « à l'heure » ni « en renfort » — il est simplement mesuré.
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
    -- Les ATTENDUS sans activité. Toujours sur `profiles` : c'est le compte membre qui porte
    -- le créneau attendu, donc lui seul permet de dire « il devait être là ». Le test d'absence
    -- passe désormais par les DEUX clés — une ligne rattachée au chatteur mais pas au profil
    -- faisait apparaître, à tort, quelqu'un qui avait travaillé dans la liste des silencieux.
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
          where c.day = p_day and c.slot = p.shift
            and (c.profile_id = p.id or (p.chatter_id is not null and c.chatter_id = p.chatter_id))
        )
    ), '[]'::jsonb)
  );
$$;

comment on function public.mypuls_shift_board(date, text) is
$cmt$Relevé d'équipe : run, KPI du jour, couverture (chatterId + profileId), segments du créneau, et les attendus sans activité$cmt$;

grant execute on function public.mypuls_shift_board(date, text) to authenticated;

-- Les segments d'une plage. `p_profile` devient `p_chatter` : filtrer par compte membre
-- excluait justement les gens que ce lot rend visibles.
--
-- `drop` AVANT `create`, et non `create or replace` : Postgres refuse de renommer un paramètre
-- d'entrée (« cannot change name of input parameter »). La signature se reconnaissant aux
-- TYPES, qui ne changent pas, le drop cible bien l'ancienne fonction.
drop function if exists public.mypuls_shift_segments_range(date, date, uuid);

create function public.mypuls_shift_segments_range(
  p_from    date,
  p_to      date,
  p_chatter uuid default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x."startedAt"), '[]'::jsonb)
  from (
    select s.mypuls_user_id  as "mypulsUserId",
           s.chatter_id      as "chatterId",
           s.profile_id      as "profileId",
           s.day,
           s.started_at      as "startedAt",
           s.ended_at        as "endedAt",
           s.active_minutes  as "activeMinutes",
           s.messages,
           s.models
    from mypuls_shift_segments s
    where s.day between p_from and least(p_to, p_from + 61)
      and (p_chatter is null or s.chatter_id = p_chatter)
  ) x;
$$;

comment on function public.mypuls_shift_segments_range(date, date, uuid) is
$cmt$Segments bruts sur une plage (62 j max), filtrables par chatters(id) — le regroupement en vacations vit dans @glagency/core$cmt$;

grant execute on function public.mypuls_shift_segments_range(date, date, uuid) to authenticated;

-- La fiche d'activité : `p_chatter` plutôt que `p_profile`, pour la même raison. La page part
-- toujours d'un profil (on y arrive par un lien nominatif), mais elle lui joint son chatteur —
-- sinon la fiche d'un membre rattaché ne montre que les journées où `profile_id` avait été
-- résolu, en oubliant les autres.
-- Même contrainte de renommage de paramètre que ci-dessus : drop puis create.
drop function if exists public.mypuls_shift_chatter(uuid, date, date);

create function public.mypuls_shift_chatter(
  p_chatter uuid,
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
      where c.chatter_id = p_chatter and c.day between p_from and p_to
    ), '[]'::jsonb),
    'daysWorked', (
      select count(distinct s.day)
      from mypuls_shift_segments s
      where s.chatter_id = p_chatter and s.day between p_from and p_to
    ),
    'activeMinutes', coalesce((
      select sum(s.active_minutes) from mypuls_shift_segments s
      where s.chatter_id = p_chatter and s.day between p_from and p_to
    ), 0),
    'messages', coalesce((
      select sum(s.messages) from mypuls_shift_segments s
      where s.chatter_id = p_chatter and s.day between p_from and p_to
    ), 0),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('label', m.label, 'messages', m.messages)
                       order by m.messages desc)
      from (
        select mm.value ->> 'label' as label,
               sum((mm.value ->> 'messages')::int) as messages
        from mypuls_shift_segments s
             cross join lateral jsonb_array_elements(s.models) mm
        where s.chatter_id = p_chatter and s.day between p_from and p_to
        group by 1
      ) m
    ), '[]'::jsonb),
    'mypulsUserId', (
      select s.mypuls_user_id from mypuls_shift_segments s
      where s.chatter_id = p_chatter order by s.started_at desc limit 1
    )
  );
$$;

comment on function public.mypuls_shift_chatter(uuid, date, date) is
$cmt$Fiche d'activité d'un chatters(id) : couverture jour par jour, jours travaillés, modèles, et l'id MyPuls pour le détail à la demande$cmt$;

grant execute on function public.mypuls_shift_chatter(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le bac d'orphelins se resserre sur ce qui reste vraiment orphelin
-- ---------------------------------------------------------------------------
-- Avant ce lot, il listait 199 libellés sur l'UAT. Or 87 d'entre eux avaient un `chatters`
-- parfaitement identifié : ils n'étaient pas orphelins, ils étaient sans compte membre. Le bac
-- distingue maintenant les deux, parce que le geste de réparation n'est pas le même — créer
-- quelqu'un dans le CRM, ou lui ouvrir un compte.

create or replace function public.mypuls_shift_settings_page(
  p_from date,
  p_to   date
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'settings', (
      select jsonb_build_object(
               'idleMinutes', s.idle_minutes,
               'breakMinutes', s.break_minutes,
               'coverageThreshold', s.coverage_threshold,
               'updatedAt', s.updated_at,
               'updatedBy', s.updated_by
             )
      from mypuls_shift_settings s where s.id = 1
    ),

    'windows', coalesce((
      select jsonb_agg(w order by w.slot, w."firstDay")
      from (
        select c.slot,
               to_char(c.slot_start_at at time zone 'Europe/Paris', 'HH24:MI') as "startsAt",
               to_char(c.slot_end_at   at time zone 'Europe/Paris', 'HH24:MI') as "endsAt",
               min(c.day)::text as "firstDay",
               max(c.day)::text as "lastDay",
               count(distinct c.day) as days
        from mypuls_shift_coverage c
        where c.day between p_from and p_to
        group by 1, 2, 3
      ) w
    ), '[]'::jsonb),

    'runs', coalesce((
      select jsonb_agg(r order by r."ranAt" desc)
      from (
        select x.id,
               x.ran_at    as "ranAt",
               x.day_from::text as "dayFrom",
               x.day_to::text   as "dayTo",
               x.status,
               x.segments,
               x.coverage_rows as "coverageRows",
               jsonb_array_length(x.unmatched) as "unmatchedCount",
               x.error,
               x.idle_minutes as "idleMinutes",
               x.coverage_threshold as "coverageThreshold"
        from mypuls_shift_runs x
        order by x.ran_at desc
        limit 40
      ) r
    ), '[]'::jsonb),

    -- INCONNUS DU CRM : ni `chatters`, ni compte. Personne ne sait qui c'est, et leur travail
    -- n'est rattaché à rien. Le geste est de les créer.
    'orphans', coalesce((
      select jsonb_agg(o order by o.messages desc)
      from (
        select c.mypuls_user_id as "mypulsUserId",
               max(c.chatter_label) as "chatterLabel",
               count(distinct c.day) as days,
               max(c.day)::text as "lastDay",
               sum(c.active_minutes)::int as "activeMinutes",
               sum(c.messages)::int as messages
        from mypuls_shift_coverage c
        where c.chatter_id is null and c.day between p_from and p_to
        group by c.mypuls_user_id
      ) o
    ), '[]'::jsonb),

    -- CONNUS mais SANS COMPTE : ils ont désormais leur ligne et leur nom sur le relevé. Ce
    -- qu'il leur manque est une fiche d'activité et la possibilité d'être signalés — les deux
    -- exigent un `profiles` (`police_entries.chatter_id` pointe sur `profiles` depuis 0078).
    -- Le geste est de leur ouvrir un compte, pas de les créer.
    'noAccount', coalesce((
      select jsonb_agg(o order by o.messages desc)
      from (
        select c.chatter_id as "chatterId",
               c.mypuls_user_id as "mypulsUserId",
               max(c.chatter_label) as "chatterLabel",
               count(distinct c.day) as days,
               max(c.day)::text as "lastDay",
               sum(c.active_minutes)::int as "activeMinutes",
               sum(c.messages)::int as messages
        from mypuls_shift_coverage c
        where c.chatter_id is not null and c.profile_id is null
          and c.day between p_from and p_to
        group by c.chatter_id, c.mypuls_user_id
      ) o
    ), '[]'::jsonb)
  );
$$;

comment on function public.mypuls_shift_settings_page(date, date) is
$cmt$Créneaux & réglages : réglages, fenêtres appliquées, journal des runs, et le bac en deux moitiés (inconnus du CRM / connus sans compte)$cmt$;

grant execute on function public.mypuls_shift_settings_page(date, date) to authenticated;
