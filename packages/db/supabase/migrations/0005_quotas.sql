-- Table `quotas` : seuils journaliers PAR ÉQUIPE (config manuelle, jamais écrasée par le
-- refresh d'ingestion). Portage de quotas.json du dashboard legacy vers Postgres.
-- Design : packages/db/design/schema-design.json (table quotas — re-clé creator_id -> team_id).
--   - 5 seuils journaliers ; higher-is-better partout SAUF reactivite_s (LOWER-is-better) ;
--   - une équipe SANS ligne = quotas non configurés (ignorée par les cartes Analyses) ;
--   - PREMIÈRE écriture web : la page /chatter/quotas édite ces seuils via server actions
--     (session authenticated + RLS) — l'ingestion service-role ne touche JAMAIS cette table.

create table quotas (
  team_id         uuid primary key references teams(id) on delete cascade,
  presence_h      numeric(4,1)  not null check (presence_h > 0),          -- h/j, higher-is-better
  reactivite_s    integer       not null check (reactivite_s > 0),        -- s/j, LOWER-is-better
  medias_proposes integer       not null check (medias_proposes >= 0),    -- /j
  conv_pct        numeric(5,2)  not null check (conv_pct between 0 and 100), -- %/j
  ca_eur          numeric(12,2) not null check (ca_eur >= 0),             -- €/j
  updated_at      timestamptz   not null default now(),
  updated_by      uuid          references profiles(id) on delete set null
);

-- ── RLS : lecture authenticated (même modèle que 0004) + écriture authenticated
-- (config éditable par l'équipe ; l'app trace l'auteur via updated_by).
alter table quotas enable row level security;
create policy quotas_auth_read   on quotas for select to authenticated using (true);
create policy quotas_auth_insert on quotas for insert to authenticated with check (true);
create policy quotas_auth_update on quotas for update to authenticated using (true) with check (true);
create policy quotas_auth_delete on quotas for delete to authenticated using (true);

-- ── Backfill profiles : le trigger 0002 ne couvre que les inscriptions POSTÉRIEURES.
-- Un user créé avant n'a pas de ligne profiles → son premier Save violerait la FK
-- quotas.updated_by -> profiles(id) (erreur 23503).
insert into profiles (id)
select u.id
from auth.users u
left join profiles p on p.id = u.id
where p.id is null;

-- ── Seed depuis quotas.json legacy (dashboard VPS, valeurs du 2026-06-30).
-- Jointure par nom d'équipe : les 13 clés (Carla, Alice…) matchent teams.name (vérifié en base).
-- taux_conv_pct (legacy) -> conv_pct ; ca (legacy) -> ca_eur.
insert into quotas (team_id, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur)
select t.id, v.presence_h, v.reactivite_s, v.medias_proposes, v.conv_pct, v.ca_eur
from (
  values
    ('Carla',    7, 300, 30, 25, 286),
    ('Alice',    7, 300, 20, 25, 148),
    ('Julie',    7, 300, 25, 25, 119),
    ('Sarah',    7, 300, 20, 25, 125),
    ('Lucie',    7, 300, 15, 25, 105),
    ('Lena',     7, 300, 15, 25, 111),
    ('Lola',     7, 300, 15, 25,  80),
    ('Claire',   7, 300, 10, 25,  80),
    ('Mathilde', 7, 300, 10, 25,  80),
    ('Maeva',    7, 300, 10, 25,  80),
    ('Emma',     7, 300, 10, 25,  80),
    ('Jade',     7, 300, 10, 25,  80),
    ('Manon',    7, 300, 10, 25,  80)
) as v(team_name, presence_h, reactivite_s, medias_proposes, conv_pct, ca_eur)
join teams t on t.name = v.team_name
on conflict (team_id) do nothing;

-- Garde-fou : n'échoue QUE si les 13 équipes attendues existent bien mais que le seed est
-- incomplet (jointure ratée / équipe renommée). Sur une base neuve où `teams` n'est pas encore
-- peuplé par l'ingestion (préprod, CI, `db reset`), le seed est un no-op légitime et la garde
-- est ignorée → les migrations restent rejouables depuis zéro. Prod : les 13 équipes existent,
-- la garantie « pas de seed à moitié » est préservée.
do $$
declare n_quotas integer; n_expected integer;
begin
  select count(*) into n_expected from teams
  where name in ('Carla','Alice','Julie','Sarah','Lucie','Lena','Lola','Claire','Mathilde','Maeva','Emma','Jade','Manon');
  select count(*) into n_quotas from quotas;
  if n_expected >= 13 and n_quotas < 13 then
    raise exception 'Seed quotas incomplet : % ligne(s) au lieu de 13 alors que les 13 équipes existent — jointure ratée ?', n_quotas;
  end if;
end $$;
