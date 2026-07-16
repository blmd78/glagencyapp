-- 0039 — Correction admin du compteur R. R est dérivé (nb de relances depuis reset), donc
-- pour « forcer R à N » sans fabriquer de fausses relances : une base ajustable. R affiché =
-- compteur_base + relances depuis compteur_reset_at. Forcer R=N → base=N + reset=now()
-- (repart de N ; les « + » suivants font N+1, N+2…).
alter table spender_crm add column compteur_base int not null default 0;

create or replace function crm_spenders_tracker(p_seuil numeric default 40)
returns table (
  creator_id uuid, fan_id bigint, username text, model text, ca_total numeric,
  status text, last_message_at timestamptz, last_message_is_mine boolean, has_unread boolean,
  assigned_chatter_id uuid, chatter_name text, chatter_team text, assigned_label text,
  compteur_r int, derniere_relance_at timestamptz, relance_today boolean,
  conversion_pending boolean, archived boolean
)
language sql stable security invoker set search_path = public
as $$
  select
    sc.creator_id, sc.fan_id, sc.username, cr.name as model, sc.ca_total,
    sc.status, sc.last_message_at, sc.last_message_is_mine, sc.has_unread,
    sc.assigned_chatter_id, ch.display_name as chatter_name, ch.team as chatter_team, sc.assigned_label,
    (coalesce(cm.compteur_base, 0) + coalesce(r.cnt, 0))::int as compteur_r,
    r.derniere_relance_at,
    (r.derniere_relance_jour = (now() at time zone 'Europe/Paris')::date) as relance_today,
    (r.derniere_relance_at is not null
       and sc.last_message_is_mine = false
       and sc.last_message_at > r.derniere_relance_at) as conversion_pending,
    coalesce(cm.archived, false) as archived
  from spender_conversations sc
  join creators cr on cr.id = sc.creator_id
  left join chatters ch on ch.id = sc.assigned_chatter_id
  left join spender_crm cm on cm.creator_id = sc.creator_id and cm.fan_id = sc.fan_id
  left join lateral (
    select count(*) as cnt,
           max(rl.created_at) as derniere_relance_at,
           max(rl.jour_paris) as derniere_relance_jour
    from relances rl
    where rl.creator_id = sc.creator_id and rl.fan_id = sc.fan_id
      and rl.created_at > coalesce(cm.compteur_reset_at, '-infinity'::timestamptz)
  ) r on true
  where sc.ca_total >= p_seuil
$$;
grant execute on function crm_spenders_tracker(numeric) to authenticated;
