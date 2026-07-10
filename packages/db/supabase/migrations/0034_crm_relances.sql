-- 0034 — Tracker de relances (R1→R10) du CRM spenders (fusion gla-workflow).
-- L'ACTE de relance (sur Snap) est une saisie humaine — invisible au scrape. La DÉTECTION
-- (qui relancer) et la VÉRIFICATION (a-t-il reparlé ?) viennent de spender_conversations.
-- Compteur R = nb de relances depuis compteur_reset_at, PAR CONVERSATION (creator_id, fan_id).

-- Journal des relances : 1 ligne = 1 acte, numéro figé à l'insert.
create table relances (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  fan_id      bigint not null,
  chatter_id  uuid references chatters(id) on delete set null,   -- closer qui a relancé
  created_by  uuid references profiles(id) on delete set null,   -- profil qui a saisi
  numero_r    int not null,                                      -- compteur au moment de l'acte
  note        text,
  jour_paris  date not null default ((now() at time zone 'Europe/Paris')::date),
  created_at  timestamptz not null default now()
);
-- 1 relance max / jour / spender (garanti en base).
create unique index relances_one_per_day on relances (creator_id, fan_id, jour_paris);
create index relances_conv_idx on relances (creator_id, fan_id, created_at desc);

-- État CRM éditable par conversation (≠ spender_conversations scrapé/écrasé).
create table spender_crm (
  creator_id        uuid not null references creators(id) on delete cascade,
  fan_id            bigint not null,
  compteur_reset_at timestamptz,                        -- borne du cycle R (null = depuis toujours)
  archived          boolean not null default false,
  archived_at       timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (creator_id, fan_id)
);

-- Vue tracker : joint le scrape (état conversation) au CRM (compteur R, grisé, R10, conversion).
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
    coalesce(r.cnt, 0)::int as compteur_r,
    r.derniere_relance_at,
    (r.derniere_relance_jour = (now() at time zone 'Europe/Paris')::date) as relance_today,
    -- conversion en attente : une relance existe, et depuis, le fan a reparlé (dernier
    -- message de LUI, postérieur à notre dernière relance) → on proposera le reset.
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

-- RLS : lecture + écriture = droit crm-spenders + cloisonnement par modèle.
alter table relances enable row level security;
alter table spender_crm enable row level security;

create policy relances_read on relances for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
create policy relances_insert on relances for insert to authenticated
  with check (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));

create policy spender_crm_read on spender_crm for select to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
create policy spender_crm_write on spender_crm for all to authenticated
  using (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())))
  with check (public.has_page('crm-spenders') and (public.is_admin() or creator_id in (
    select creator_id from profile_creators where profile_id = auth.uid())));
