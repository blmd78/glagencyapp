-- Écran « Créneaux & réglages » du relevé MyPuls (spec §5.4) — la lecture.
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
--
-- Quatre blocs en un aller-retour, parce qu'ils se lisent ensemble : on vient ici quand un
-- chiffre du relevé surprend, et la réponse est presque toujours « le réglage a bougé » ou
-- « la nuit manque ».
--
-- `security invoker`, comme 0140 : la RLS de 0138 s'applique à l'appelant. Deux des quatre
-- blocs — les réglages et le journal — sont ouverts à tout porteur de `presence` ; l'écriture
-- des réglages reste admin (policy `mypuls_shift_settings_admin_write`, 0138:192).
--
-- Ce qui n'est PAS ici : les chatteurs actifs sans `profiles.shift`. Ils viennent de
-- `profiles`, dont la policy exige `is_admin() or is_manager()` — un porteur de `presence` de
-- rôle police recevrait une liste vide sans le savoir. C'est exactement le défaut que le
-- relevé a dû contourner (`displayNames`, get-shift-report.ts) ; on ne le reproduit pas, cette
-- population est lue en service-role côté service.

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

    -- LES FENÊTRES DE CRÉNEAU, telles qu'elles ont RÉELLEMENT servi.
    --
    -- On ne les relit pas chez MyPuls : elles y sont saisies dans un formulaire, modifiables à
    -- tout moment et sans versionnement — la valeur d'aujourd'hui ne dit rien de celle qui a
    -- mesuré le 12 juillet. Les bornes figées ligne à ligne sur la couverture (0138 §3.2) sont
    -- la seule trace de ce qui a compté. Un regroupement par heure murale fait donc apparaître
    -- un changement de fenêtre comme ce qu'il est : deux périodes, deux bornes.
    --
    -- Heure MURALE Paris et non UTC : sans ça, la bascule d'heure d'été couperait chaque
    -- créneau en deux lignes alors que rien n'a bougé côté MyPuls.
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

    -- LE JOURNAL. C'est ici qu'on voit qu'une nuit manque — et les valeurs de réglage qui ont
    -- servi à chaque run, sans quoi un changement d'`idle` serait un décrochage inexplicable
    -- dans les courbes.
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

    -- LE BAC D'ORPHELINS, côté MyPuls : les gens que MyPuls mesure et que le CRM ne sait pas
    -- nommer. Pris sur la COUVERTURE et non sur le `unmatched` du dernier run : le run rend
    -- l'instantané d'une nuit, la couverture dit combien de jours et combien de messages —
    -- c'est-à-dire lesquels valent la peine d'être rattachés.
    --
    -- Chacun de ces libellés est une ligne que le relevé affiche sans nom, et qu'un encadrant
    -- borné à ses modèles ne voit pas du tout (get-shift-report.ts : une ligne sans profil
    -- n'est montrée qu'aux non-bornés). Le travail qu'ils font n'est donc compté nulle part.
    'orphans', coalesce((
      select jsonb_agg(o order by o.messages desc)
      from (
        select c.mypuls_user_id as "mypulsUserId",
               max(c.chatter_label) as "chatterLabel",
               count(distinct c.day) as days,
               max(c.day)::text as "lastDay",
               sum(c.active_minutes)::int as "activeMinutes",
               sum(c.messages)::int as messages
               -- « Ce libellé a-t-il déjà une ligne `chatters` ? » manque ici À DESSEIN : la
               -- policy `chatters_scoped_read` exige d'être admin OU d'avoir au moins un modèle
               -- assigné. Un porteur de `presence` sans assignation aurait lu « non » partout,
               -- en silence, et conclu que 300 personnes sont inconnues du CRM. Ce test se fait
               -- en service-role dans le service, comme `displayNames`.
        from mypuls_shift_coverage c
        where c.profile_id is null and c.day between p_from and p_to
        group by c.mypuls_user_id
      ) o
    ), '[]'::jsonb)
  );
$$;

comment on function public.mypuls_shift_settings_page(date, date) is
$cmt$Créneaux & réglages : réglages, fenêtres réellement appliquées, journal des runs, bac d'orphelins$cmt$;

grant execute on function public.mypuls_shift_settings_page(date, date) to authenticated;
