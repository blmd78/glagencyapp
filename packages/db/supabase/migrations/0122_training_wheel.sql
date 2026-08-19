-- 0122 — Roue des récompenses (incrément 3 formation) : config (1 ligne), tickets hebdo, tirages.
-- Spec : docs/superpowers/specs/2026-08-19-formation-roue-design.md.
-- Écritures = service-role depuis les Server Actions (comme 0121) ; RLS = lecture (moi / encadrant
-- frm-suivi / admin) ; config lisible par toute la face Formation, modifiable par l'admin.
-- Montants en EUROS ; un lot non monétaire (day off) a amount_eur null.

create table public.training_wheel_config (
  id          smallint primary key default 1 check (id = 1),
  title       text not null default 'Roue de la chance' check (length(title) between 1 and 60),
  -- [{ "label": "Cadeau", "weight": 80, "lose": false }, { "label": "Raté", "weight": 20, "lose": true }]
  sectors     jsonb not null,
  -- [{ "label": "5 €", "weight": 60, "amount_eur": 5 }, …]  (amount_eur null = non monétaire)
  prizes      jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
create index training_wheel_config_updated_by_idx on public.training_wheel_config (updated_by);
insert into public.training_wheel_config (id, sectors, prizes) values (
  1,
  '[{"label":"Cadeau","weight":80,"lose":false},{"label":"Raté","weight":20,"lose":true}]'::jsonb,
  '[{"label":"5 €","weight":60,"amount_eur":5},{"label":"10 €","weight":20,"amount_eur":10},{"label":"Day off supplémentaire","weight":5,"amount_eur":null},{"label":"20 €","weight":5,"amount_eur":20},{"label":"Donner 5 € à un membre de ton équipe","weight":10,"amount_eur":5}]'::jsonb
);

create table public.training_wheel_tickets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  week        date not null,                       -- lundi de la semaine récompensée (classement de cette semaine-là)
  reason      text not null check (length(reason) between 1 and 120),   -- « Top 2 — semaine du 11/08 » / « Offert par … »
  granted_by  uuid references public.profiles(id) on delete set null,   -- null = classement (système)
  created_at  timestamptz not null default now(),
  used_at     timestamptz,
  unique (profile_id, week)
);
create index training_wheel_tickets_pending_idx on public.training_wheel_tickets (profile_id) where used_at is null;
create index training_wheel_tickets_granted_by_idx on public.training_wheel_tickets (granted_by);

create table public.training_wheel_spins (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  ticket_id    uuid not null unique references public.training_wheel_tickets(id) on delete cascade,
  week         date not null,
  spun_at      timestamptz not null default now(),
  sector_label text not null,
  won          boolean not null,
  prize_label  text,                                          -- null si Raté
  amount_eur   numeric(8,2) check (amount_eur is null or amount_eur >= 0),
  paid_at      timestamptz,                                   -- compta, plus tard
  paid_by      uuid references public.profiles(id) on delete set null,
  check (won = (prize_label is not null))
);
create index training_wheel_spins_profile_idx on public.training_wheel_spins (profile_id, spun_at desc);
create index training_wheel_spins_week_idx on public.training_wheel_spins (week desc);
create index training_wheel_spins_paid_by_idx on public.training_wheel_spins (paid_by);

alter table public.training_wheel_config enable row level security;
alter table public.training_wheel_tickets enable row level security;
alter table public.training_wheel_spins enable row level security;

create policy training_wheel_config_read on public.training_wheel_config for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_wheel_config_admin_write on public.training_wheel_config for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_wheel_tickets_read on public.training_wheel_tickets for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_wheel_spins_read on public.training_wheel_spins for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
-- Aucune policy d'écriture authenticated sur tickets/spins : service-role depuis les actions.

-- ── Journal du membre : une ligne « recompense » par tirage ────────────────────────────────
alter table public.member_events drop constraint member_events_kind_check;
alter table public.member_events add constraint member_events_kind_check
  check (kind in ('creation','role','shift','closing','modele','manager','pages','nouveau',
                  'arrivee','sortie','lien','identite','sanction','rapport','recompense'));

create or replace function public.training_wheel_spin_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_by     uuid;
begin
  select t.reason, t.granted_by into v_reason, v_by from training_wheel_tickets t where t.id = new.ticket_id;
  -- to_value lisible sans jointure : « Roue : 10 € — Top 2 — semaine du 11/08 » / « Roue : Raté — … »
  insert into member_events (profile_id, created_by, kind, to_value)
  values (new.profile_id, v_by, 'recompense',
          'Roue : ' || case when new.won then coalesce(new.prize_label, 'cadeau') else 'Raté' end
          || ' — ' || coalesce(v_reason, ''));
  return new;
end;
$$;
revoke all on function public.training_wheel_spin_journal() from public;
create trigger trg_training_wheel_spin_journal
  after insert on public.training_wheel_spins
  for each row execute function public.training_wheel_spin_journal();

-- ── Semaine passée (lundi), heure de Paris ────────────────────────────────────────────────
create or replace function public.training_last_week()
returns date
language sql stable security invoker set search_path = public, pg_temp
as $$
  select (date_trunc('week', ((now() at time zone 'Europe/Paris')::date)::timestamp)::date - 7);
$$;

-- ── Classement DE LA SEMAINE : Σ par cas (hors boss) du meilleur total obtenu dans la semaine ──
create or replace function public.training_weekly_ranking(p_week date)
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric)
language sql stable security definer set search_path = public, pg_temp
as $$
  with bounds as (
    select (p_week::timestamp at time zone 'Europe/Paris') as t0,
           ((p_week + 7)::timestamp at time zone 'Europe/Paris') as t1
  ),
  best as (
    select s.profile_id, s.case_id, max(s.total) as best_total, min(s.scored_at) as first_at
    from training_sessions s
    join training_cases c on c.id = s.case_id
    cross join bounds b
    where s.status = 'scored' and s.total is not null and c.kind <> 'boss'
      and s.scored_at >= b.t0 and s.scored_at < b.t1
    group by s.profile_id, s.case_id
  )
  select b.profile_id, coalesce(p.display_name, '—'), sum(b.best_total)::integer, count(*)::integer,
         round(avg(b.best_total), 2)
  from best b
  join profiles p on p.id = b.profile_id
  where p.left_at is null and p.role = 'chatteur'
    and ((select public.is_admin()) or (select public.has_page('formation')))
  group by b.profile_id, p.display_name
  order by 3 desc, 5 desc, min(b.first_at) asc;
$$;

-- ── Pastille sidebar / éligibilité : 1 = ticket non utilisé OU top 3 de la semaine passée non réclamé ──
create or replace function public.training_wheel_pending(p_profile uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when not (p_profile = (select auth.uid()) or (select public.has_page('frm-suivi'))) then 0
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.used_at is null) then 1
    when exists (select 1 from training_wheel_tickets t where t.profile_id = p_profile and t.week = public.training_last_week()) then 0
    when exists (
      select 1
      from public.training_weekly_ranking(public.training_last_week()) with ordinality as r(profile_id, display_name, points, cases_done, avg_total, rn)
      where r.profile_id = p_profile and r.points > 0 and r.rn <= 3
    ) then 1
    else 0
  end;
$$;

revoke execute on function public.training_last_week() from public, anon;
revoke execute on function public.training_weekly_ranking(date) from public, anon;
revoke execute on function public.training_wheel_pending(uuid) from public, anon;
grant execute on function public.training_last_week() to authenticated;
grant execute on function public.training_weekly_ranking(date) to authenticated;
grant execute on function public.training_wheel_pending(uuid) to authenticated;
