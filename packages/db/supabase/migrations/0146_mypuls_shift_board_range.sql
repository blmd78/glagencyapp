-- Relevé d'équipe : lecture sur une PÉRIODE, pilotée par le sélecteur de dates du header.
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
--
-- POURQUOI UNE NOUVELLE FONCTION. `mypuls_shift_board` répond pour UN jour et rend les segments
-- bruts du créneau (pour la timeline dépliée). Sur une période d'un mois, ce contrat devient
-- intenable : 7 606 lignes de couverture et 85 261 segments sur l'UAT, soit ~2 Mo de JSON pour
-- la seule couverture. On agrège donc en SQL, et on ne transporte plus un seul segment — le
-- détail jour par jour d'une personne vit sur sa fiche, qui est faite pour ça.
--
-- LE GRAIN DE SORTIE EST (personne × créneau), pas (personne). C'est ce qui permet au service
-- de distinguer le créneau ATTENDU des autres sans que le SQL ait à connaître `profiles.shift` :
-- il rend les trois agrégats, le service garde celui qui compte. Ce détour n'est pas de la
-- coquetterie — la policy de `profiles` exige `is_admin() or is_manager()`, donc une jointure
-- ici rendrait `shift` NULL pour un porteur de « presence » de rôle police, et TOUTES ses lignes
-- passeraient pour « hors créneau attendu ». Le même piège a déjà mordu deux fois sur ce lot.
--
-- 208 personnes × 3 créneaux = ~600 lignes en sortie, quelle que soit la longueur de la période.

create or replace function public.mypuls_shift_board_range(
  p_from      date,
  p_to        date,
  p_slot      text default null,
  p_threshold numeric default 80
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with lignes as (
    select c.*
    from mypuls_shift_coverage c
    where c.day between p_from and least(p_to, p_from + 92)
      and (p_slot is null or c.slot = p_slot)
  )
  select jsonb_build_object(
    -- Les jours de la période qu'aucun run réussi ne couvre. L'écran les NOMME : sur une
    -- période, « il manque trois nuits » ne se devine pas, alors que sur un jour unique
    -- l'absence de run était évidente (l'écran entier disait « indisponible »).
    'missingDays', coalesce((
      select jsonb_agg(d::text order by d)
      from generate_series(p_from, least(p_to, p_from + 92), interval '1 day') g(d)
      where not exists (
        select 1 from mypuls_shift_runs r
        where r.status = 'ok' and g.d::date between r.day_from and r.day_to
      )
    ), '[]'::jsonb),

    -- Le dernier run réussi qui couvre la période : porte les réglages EN VIGUEUR, que l'écran
    -- affiche pour que le seuil lu soit celui qui a servi.
    'run', (
      select jsonb_build_object(
               'ranAt', r.ran_at,
               'idleMinutes', r.idle_minutes,
               'coverageThreshold', r.coverage_threshold,
               'unmatched', jsonb_array_length(r.unmatched)
             )
      from mypuls_shift_runs r
      where r.status = 'ok' and r.day_to >= p_from and r.day_from <= p_to
      order by r.ran_at desc
      limit 1
    ),

    -- UN AGRÉGAT PAR (personne × créneau). `held` compte les jours au-dessus du seuil ; c'est
    -- un COMPTE, jamais une moyenne de pourcentages : moyenner des verdicts MyPuls fabriquerait
    -- un chiffre que personne ne peut vérifier, à côté d'un seuil qui coûte de l'argent.
    'rows', coalesce((
      select jsonb_agg(x order by x."chatterLabel", x.slot)
      from (
        select l.mypuls_user_id  as "mypulsUserId",
               l.chatter_id      as "chatterId",
               l.profile_id      as "profileId",
               max(l.chatter_label) as "chatterLabel",
               l.slot,
               count(*)                                             as "days",
               count(*) filter (where l.coverage_pct >= p_threshold) as "held",
               sum(l.active_minutes)::int                            as "activeMinutes",
               sum(l.messages)::int                                  as messages,
               min(l.day)::text                                      as "firstDay",
               max(l.day)::text                                      as "lastDay",
               -- Retard MOYEN sur la prise de poste, en minutes. Négatif ramené à 0 : être en
               -- avance n'est pas un retard. Null si aucune première activité connue.
               round(avg(
                 greatest(0, extract(epoch from (l.first_at - l.slot_start_at)) / 60)
               ))::int                                               as "latenessAvg"
        from lignes l
        group by l.mypuls_user_id, l.chatter_id, l.profile_id, l.slot
      ) x
    ), '[]'::jsonb),

    -- Modèles OBSERVÉS par personne sur la période, du plus bavard au moins bavard. Séparé des
    -- lignes : un modèle se lit par personne, pas par créneau, et le répéter trois fois
    -- triplerait la charge utile pour rien.
    'models', coalesce((
      select jsonb_object_agg(m."mypulsUserId", m.labels)
      from (
        select s.mypuls_user_id as "mypulsUserId",
               jsonb_agg(s.label order by s.messages desc) as labels
        from (
          select s.mypuls_user_id,
                 mm.value ->> 'label' as label,
                 sum((mm.value ->> 'messages')::int) as messages
          from mypuls_shift_segments s
               cross join lateral jsonb_array_elements(s.models) mm
          where s.day between p_from and least(p_to, p_from + 92)
          group by 1, 2
        ) s
        group by s.mypuls_user_id
      ) m
    ), '{}'::jsonb),

    -- Totaux de la période, tous créneaux confondus — le dénominateur des tuiles.
    'totals', (
      select jsonb_build_object(
               'days', (select count(distinct day) from lignes),
               'activeMinutes', coalesce(sum(l.active_minutes), 0)::int,
               'messages', coalesce(sum(l.messages), 0)::int
             )
      from lignes l
    )
  );
$$;

comment on function public.mypuls_shift_board_range(date, date, text, numeric) is
$cmt$Relevé d'équipe sur une période : agrégats par (personne × créneau), modèles observés, jours sans run. Le créneau ATTENDU est tranché côté service — profiles.shift n'est pas lisible ici$cmt$;

grant execute on function public.mypuls_shift_board_range(date, date, text, numeric) to authenticated;
