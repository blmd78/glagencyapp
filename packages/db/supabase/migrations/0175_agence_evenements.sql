-- Agence : le calendrier des événements de l'agence, et la cloche de nouveautés.
-- Spec : docs/superpowers/specs/2026-09-25-agence-calendrier-notifications-design.md
--
-- La cloche est CALCULÉE À LA VOLÉE (décision Benoit 2026-09-25) : on ne stocke que l'heure de la
-- dernière ouverture de chacun (`agency_notification_seen`). Pas une ligne par personne et par
-- événement, pas de robot de nuit pour les rappels du jour J.

create table if not exists public.agency_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 120),
  start_date    date not null,
  end_date      date not null,
  remind_on_day boolean not null default false,
  audience      text[] not null default array['chatteur','sous-manager','manager','police']::text[],
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint agency_events_dates check (end_date >= start_date),
  constraint agency_events_audience check (
    cardinality(audience) >= 1
    and audience <@ array['chatteur','sous-manager','manager','police']::text[]
  )
);
create index if not exists agency_events_start_idx   on public.agency_events (start_date);
create index if not exists agency_events_end_idx     on public.agency_events (end_date);
create index if not exists agency_events_created_idx on public.agency_events (created_at desc);

create table if not exists public.agency_notification_seen (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

alter table public.agency_events            enable row level security;
alter table public.agency_notification_seen enable row level security;

-- LECTURE : admin (superadmin compris), ou un rôle visé par l'événement. Membre parti = rien.
-- AUCUNE policy d'écriture : les Server Actions écrivent en service-role après la garde admin.
create policy agency_events_read on public.agency_events
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.left_at is null and p.role = any(audience)
    )
  );

-- Sa propre ligne, et seulement elle.
create policy agency_notification_seen_own on public.agency_notification_seen
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

grant select on public.agency_events to authenticated;
grant select, insert, update on public.agency_notification_seen to authenticated;

-- La cloche. `security invoker` : la RLS de `agency_events` s'applique à l'appelant, qui ne voit
-- donc que les nouveautés qui le visent.
--   • « event »    : un événement, daté de sa création ;
--   • « reminder » : un événement à rappeler, daté de 00:00 HEURE DE PARIS de son premier jour —
--                    omis s'il a été créé ce jour-là ou après (sa notice « event » suffit).
-- Seules les nouveautés passées et des 30 derniers jours comptent. `unread` = celles postérieures à
-- la dernière ouverture (toutes si la personne n'a jamais ouvert sa cloche).
create or replace function public.agency_notifications(p_limit int default 10)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with today as (
    select (now() at time zone 'Europe/Paris')::date as d
  ),
  items as (
    select e.id, 'event'::text as kind, e.title, e.start_date, e.end_date, e.created_at as at
    from agency_events e
    where e.created_at > now() - interval '30 days'
    union all
    select e.id, 'reminder'::text, e.title, e.start_date, e.end_date,
           (e.start_date::timestamp at time zone 'Europe/Paris') as at
    from agency_events e, today t
    where e.remind_on_day
      and e.start_date <= t.d
      and e.start_date > t.d - 30
      and e.created_at < (e.start_date::timestamp at time zone 'Europe/Paris')
  ),
  visible as (
    select * from items where at <= now()
  ),
  seen as (
    select s.seen_at from agency_notification_seen s where s.profile_id = auth.uid()
  )
  select jsonb_build_object(
    'unread', (
      select count(*) from visible v
      where v.at > coalesce((select seen_at from seen), '-infinity'::timestamptz)
    ),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', x.id, 'kind', x.kind, 'title', x.title,
                 'startDate', x.start_date, 'endDate', x.end_date, 'at', x.at
               ) order by x.at desc)
      from (select * from visible order by at desc limit greatest(p_limit, 0)) x
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.agency_notifications(int) to authenticated;
