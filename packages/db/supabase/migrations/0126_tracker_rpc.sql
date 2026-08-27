-- Lectures du tracker de présence — incrément 3 (le front).
--
-- Une seule RPC sert les trois écrans de présence (board, fiche chatteur, managers) : ils
-- consomment tous LA MÊME matière — des événements bruts que `@glagency/core/tracking` rejoue.
-- Ce n'est donc pas trois lectures différentes, c'est une fenêtre temporelle diversement bornée.
--
-- POURQUOI DU `jsonb` ET PAS UN `returns table` : un `select` PostgREST est tronqué à 1000 lignes
-- (piège documenté du dépôt). Une fenêtre de shift, c'est ~150 événements d'état mais plusieurs
-- milliers de lignes de focus : la troncature mordrait en silence et fausserait les minutes. Une
-- fonction qui rend UNE ligne de `jsonb` n'a pas de limite de lignes à franchir.
--
-- `security invoker` : la RLS de 0125 s'applique telle quelle (admin, porteur de la page
-- `presence`, ou son propre profil). Aucun privilège n'est emprunté ici.

create or replace function public.tracker_window(
  p_from    timestamptz,
  p_to      timestamptz,
  p_profile uuid default null,
  p_role    text default null
)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with people as (
    -- `min(role)` : un profil peut porter deux postes (chatteur puis encadrant). Le cas est
    -- marginal et l'ordre alphabétique ('chatter' < 'manager') est stable — mieux qu'un doublon.
    select d.profile_id,
           min(d.role) as role
    from tracker_devices d
    where (p_profile is null or d.profile_id = p_profile)
    group by d.profile_id
  ),
  scoped as (
    select pe.profile_id, pe.role
    from people pe
    where (p_role is null or pe.role = p_role)
  )
  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', s.profile_id,
        'name', coalesce(pr.display_name, pr.email, 'sans nom'),
        'role', s.role,
        'quotaMinutes', coalesce(st.daily_quota_minutes, 480),
        'workdays', coalesce(st.workdays, '1,2,3,4,5')
      ) order by coalesce(pr.display_name, pr.email))
      from scoped s
      join profiles pr on pr.id = s.profile_id
      left join tracker_settings st on st.profile_id = s.profile_id
    ), '[]'::jsonb),

    -- ÉVÉNEMENTS D'ÉTAT : lus 12 h AVANT la fenêtre, volontairement. Un shift de nuit ouvert à
    -- 21 h déborde sur le lendemain ; sans ce recul, son `shift_start` manquerait et le chatteur
    -- apparaîtrait comme n'ayant jamais commencé. `summarize()` reclippe ensuite sur la fenêtre :
    -- rien n'est compté hors de ses bornes.
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', e.profile_id,
        'type', e.type,
        'at', e.at,
        'receivedAt', e.received_at,
        'sessionId', e.session_id,
        'meta', e.meta
      ) order by e.at)
      from tracker_events e
      join scoped s on s.profile_id = e.profile_id
      where e.at >= p_from - interval '12 hours' and e.at < p_to
    ), '[]'::jsonb),

    -- FOCUS : 15 min de recul seulement. Un focus vaut jusqu'au suivant ; sans ce petit recul, la
    -- fenêtre s'ouvrirait sur un trou d'attribution. Douze heures seraient inutiles ici et
    -- multiplieraient les lignes — c'est le volume dominant.
    'focus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', f.profile_id,
        'at', f.at,
        'kind', f.kind,
        'label', f.label
      ) order by f.at)
      from tracker_focus_raw f
      join scoped s on s.profile_id = f.profile_id
      where f.at >= p_from - interval '15 minutes' and f.at < p_to
    ), '[]'::jsonb),

    -- LIVE : l'état courant, et surtout `lastHeartbeatAt`. Les battements ne sont pas stockés
    -- (le `check` de `tracker_events` les exclut) : c'est cette valeur que la couche service
    -- rejoue en battement de synthèse, sans quoi le domaine voit tout shift en cours comme planté.
    'live', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profileId', l.profile_id,
        'deviceId', l.device_id,
        'state', l.state,
        'since', l.since,
        'lastHeartbeatAt', l.last_heartbeat_at,
        'machineId', l.machine_id,
        'currentModel', l.current_model
      ))
      from tracker_live l
      join scoped s on s.profile_id = l.profile_id
    ), '[]'::jsonb),

    'rules', (
      select to_jsonb(r) from tracker_rules r where r.id = 1
    )
  )
$$;

comment on function public.tracker_window(timestamptz, timestamptz, uuid, text) is
  $cmt$Fenêtre de présence pour le front : personnes, événements d'état (12 h de recul), focus
(15 min de recul), état live et règles — en une ligne de jsonb, hors de portée de la troncature
à 1000 lignes de PostgREST.$cmt$;

grant execute on function public.tracker_window(timestamptz, timestamptz, uuid, text) to authenticated;
