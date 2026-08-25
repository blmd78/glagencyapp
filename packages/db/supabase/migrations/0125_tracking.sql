-- Tracker de présence — socle (incrément 1 de la reprise « Chatter Tracker »).
--
-- Trois horizons de données, et c'est TOUT le dimensionnement du chantier :
--   chaud   `tracker_live`      une ligne par poste, ÉCRASÉE   (~200 lignes)
--   tiède   `tracker_focus_raw` purgée à 14 jours              (~32 600/jour)
--   froid   le reste, définitif                                (~5 200/jour)
-- Les heartbeats (46 400/jour mesurés en production) ne sont JAMAIS historisés : ils ne servent
-- qu'à l'état « en ligne » et à la détection d'un poste éteint, deux usages sans historique.

-- PUREMENT ADDITIVE : aucune table existante n'est touchée. Sûre à appliquer avant déploiement.

-- ---------------------------------------------------------------------------
-- Postes
-- ---------------------------------------------------------------------------

-- Le POSTE, pas la personne. Un membre peut en avoir plusieurs (Mac + PC) : le multi-poste est
-- natif ici, là où le tracker d'origine le bricolait avec une colonne `alias_of` ajoutée après coup.
create table if not exists public.tracker_devices (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('chatter', 'manager')),
  label        text,
  -- sha256 du bearer. Le token en clair n'est montré QU'UNE FOIS, à l'enregistrement.
  token_hash   text not null unique,
  machine_id   text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

comment on column public.tracker_devices.token_hash is
$cmt$sha256 du bearer du poste — le token en clair n'est jamais stocké$cmt$;

create index if not exists tracker_devices_profile_idx
  on public.tracker_devices (profile_id, active);

-- Quota et jours travaillés appartiennent à la PERSONNE, pas au poste. Table à part plutôt que
-- deux colonnes de plus sur `profiles`, déjà très chargée.
create table if not exists public.tracker_settings (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  daily_quota_minutes int  not null default 480,
  workdays            text not null default '1,2,3,4,5'
);

comment on column public.tracker_settings.workdays is
$cmt$jours ISO travaillés, 1 = lundi (ex. « 1,2,3,4,5 »)$cmt$;

-- ---------------------------------------------------------------------------
-- Horizon FROID — les événements d'état
-- ---------------------------------------------------------------------------

-- `heartbeat` et `focus` sont VOLONTAIREMENT absents du check : c'est cette contrainte qui garantit
-- que l'horizon froid ne se remplit pas par accident. Ils ont leurs propres tables.
create table if not exists public.tracker_events (
  id              bigint generated always as identity primary key,
  client_event_id text not null unique,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid not null references public.tracker_devices(id) on delete cascade,
  session_id      text not null,
  type            text not null check (type in
                    ('shift_start','shift_end','pause','resume','idle_start','idle_end','model')),
  at              timestamptz not null,
  local_date      date not null,
  received_at     timestamptz not null default now(),
  skewed          boolean not null default false,
  meta            jsonb
);

comment on column public.tracker_events.client_event_id is
$cmt$identifiant fourni par l'agent — porte l'idempotence du POST d'ingest$cmt$;
comment on column public.tracker_events.skewed is
$cmt$horloge du poste écartée de plus de 5 min de l'heure serveur — accepté, mais marqué$cmt$;

-- Les trois accès que le tracker d'origine a dû indexer après coup, pour la même raison : sans eux,
-- le menu des dates et le regroupement par modèle relisent la table entière à chaque page.
create index if not exists tracker_events_profile_date_idx
  on public.tracker_events (profile_id, local_date);
create index if not exists tracker_events_date_idx
  on public.tracker_events (local_date);
create index if not exists tracker_events_type_date_idx
  on public.tracker_events (type, local_date);

-- Postgres n'indexe PAS les colonnes de clé étrangère. Sans cet index, supprimer un poste
-- (cas courant : remplacement de PC) déclencherait un scan complet de la table.
create index if not exists tracker_events_device_idx on public.tracker_events (device_id);

-- ---------------------------------------------------------------------------
-- Horizon CHAUD — l'état courant, écrasé
-- ---------------------------------------------------------------------------

-- Une ligne par poste, mise à jour à chaque battement. JAMAIS d'insert historique : c'est ce qui
-- remplace 17 M de lignes de heartbeat par an.
create table if not exists public.tracker_live (
  device_id         uuid primary key references public.tracker_devices(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  state             text not null check (state in ('active','pause','idle','off')),
  since             timestamptz,
  -- Rempli par le SERVEUR, jamais par l'agent : un poste à l'heure fausse ne doit pas disparaître
  -- de « en ligne ».
  last_heartbeat_at timestamptz not null,
  machine_id        text,
  current_model     text
);

create index if not exists tracker_live_profile_idx on public.tracker_live (profile_id);

-- ---------------------------------------------------------------------------
-- Horizon TIÈDE — les changements de fenêtre, purgés à 14 jours
-- ---------------------------------------------------------------------------

-- L'URL BRUTE n'est jamais stockée : query et fragment peuvent contenir des jetons de session.
-- Seuls l'hôte normalisé (kind='domain') ou le nom de process (kind='app') arrivent ici.
create table if not exists public.tracker_focus_raw (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id  uuid not null references public.tracker_devices(id) on delete cascade,
  at         timestamptz not null,
  local_date date not null,
  kind       text not null check (kind in ('app','domain')),
  label      text not null
);

create index if not exists tracker_focus_raw_profile_date_idx
  on public.tracker_focus_raw (profile_id, local_date);
-- Sert la purge quotidienne.
create index if not exists tracker_focus_raw_date_idx
  on public.tracker_focus_raw (local_date);
create index if not exists tracker_focus_raw_device_idx on public.tracker_focus_raw (device_id);

-- ---------------------------------------------------------------------------
-- Horizon FROID — les tables de faits, figées à chaque fin de shift
-- ---------------------------------------------------------------------------

-- `on delete cascade` sur `profile_id` : c'est la convention du schéma pour TOUTE référence à
-- `profiles` (61 FK en production, aucune en `restrict`). Supprimer un membre efface donc son
-- historique de présence — comme celui de ses rapports de police et de ses sessions de formation.
-- Assumé : la suppression est réservée aux doublons et erreurs de saisie, les départs se traitent
-- par bannissement.
create table if not exists public.tracker_shift_rows (
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  date                  date not null,
  shift_key             text not null check (shift_key in ('matin','aprem','nuit','jour')),
  active_minutes        int  not null default 0,
  pause_minutes         int  not null default 0,
  idle_minutes          int  not null default 0,
  counted_pause_minutes int  not null default 0,
  effective_minutes     int  not null default 0,
  quota_minutes         int  not null default 0,
  missing_minutes       int  not null default 0,
  pause_count           int  not null default 0,
  idle_cuts             int  not null default 0,
  started_at            timestamptz,
  ended_at              timestamptz,
  crashed               boolean not null default false,
  recovered             boolean not null default false,
  open_shift            boolean not null default false,
  launched              boolean not null default false,
  off_task_minutes      int  not null default 0,
  off_task_over         boolean not null default false,
  stagnant_minutes      int  not null default 0,
  stagnant_over         boolean not null default false,
  overlap_minutes       int  not null default 0,
  is_workday            boolean not null default true,
  compliant             boolean not null default false,
  reasons               text[] not null default '{}',
  computed_at           timestamptz not null default now(),
  primary key (profile_id, date, shift_key)
);

comment on column public.tracker_shift_rows.ended_at is
$cmt$fin effective — pour un shift coupé faute de battement, c'est le dernier battement connu (le
job de fin de shift le fige AVANT que tracker_live ne soit écrasée)$cmt$;

create index if not exists tracker_shift_rows_date_idx
  on public.tracker_shift_rows (date, shift_key);

create table if not exists public.tracker_focus_shift (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date       date not null,
  shift_key  text not null check (shift_key in ('matin','aprem','nuit','jour')),
  kind       text not null check (kind in ('app','domain')),
  label      text not null,
  minutes    int  not null,
  allowed    boolean not null,
  primary key (profile_id, date, shift_key, kind, label)
);

create index if not exists tracker_focus_shift_date_idx
  on public.tracker_focus_shift (date, shift_key);

-- Le modèle est identifié par `creators(id)`, PAS par un nom libre : même règle que pour les
-- personnes (identité = `profiles.id`). C'est ce qui rend possible la jointure avec
-- `chatter_creator_daily` (CA par chatter × modèle × jour), donc le €/heure par modèle — le
-- croisement que ni le tracker ni le CRM ne peuvent produire seuls.
create table if not exists public.tracker_model_time (
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  date              date not null,
  shift_key         text not null check (shift_key in ('matin','aprem','nuit','jour')),
  creator_id        uuid not null references public.creators(id) on delete cascade,
  minutes           int  not null,
  untracked_minutes int  not null default 0,
  primary key (profile_id, date, shift_key, creator_id)
);

create index if not exists tracker_model_time_date_idx
  on public.tracker_model_time (date, shift_key);

-- `creator_id` est le dernier champ de la PK composite, donc inutilisable en préfixe.
create index if not exists tracker_model_time_creator_idx on public.tracker_model_time (creator_id);

-- Idempotence des rapports Discord : un rapport par (jour, shift), rejouable sans doublon.
create table if not exists public.tracker_reports (
  date      date not null,
  shift_key text not null check (shift_key in ('matin','aprem','nuit','jour')),
  sent_at   timestamptz not null default now(),
  payload   jsonb not null,
  primary key (date, shift_key)
);

-- ---------------------------------------------------------------------------
-- Configuration — remplace config/rules.json, qui vit sur un disque qu'on va éteindre
-- ---------------------------------------------------------------------------

create table if not exists public.tracker_rules (
  id                         int primary key default 1 check (id = 1),
  off_task_threshold_minutes int  not null default 30,
  stagnant_threshold_minutes int  not null default 60,
  main_tool                  text not null default 'mypuls.app',
  tool_min_minutes           int  not null default 330,
  lateness_max_minutes       int  not null default 10,
  apps                       text[] not null default '{}',
  domains                    text[] not null default '{}',
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references public.profiles(id) on delete set null
);

-- Reprise à l'identique de la liste blanche en production au 2026-08-25.
insert into public.tracker_rules (id, apps, domains)
values (
  1,
  array['chrome','msedge','firefox','brave','opera','vivaldi','discord','slack','telegram',
        'whatsapp','whatsapp.root','infloww','sunbrowser','adspower global','adspower','gologin',
        'gl agency shift','iremotech','chatgpt classic','explorer','shellexperiencehost',
        'applicationframehost','searchhost','startmenuexperiencehost','textinputhost',
        'snippingtool','notepad','msedgewebview2'],
  array['mypuls.app','onlyfans.com','fansly.com','fanvue.com','discord.com','telegram.org',
        'glagencyapp-web.vercel.app','gla-workflow-z5f2.vercel.app','chatgpt.com',
        'gemini.google.com','grok.com','claude.ai','translate.google.com','loom.com',
        'iremotech.com','google.com']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- LECTURE : qui possède la page « presence », plus les admins ; un membre lit toujours SES lignes.
-- Le cloisonnement fin par modèle reste APPLICATIF (lib/services/creator-scope.ts), comme pour le
-- rapport police — la RLS ne le porte pas.
-- ÉCRITURE : service-role après garde applicative. Aucune policy d'écriture pour `authenticated`,
-- SAUF tracker_settings, qui s'édite depuis l'UI admin.

alter table public.tracker_devices     enable row level security;
alter table public.tracker_settings    enable row level security;
alter table public.tracker_events      enable row level security;
alter table public.tracker_live        enable row level security;
alter table public.tracker_focus_raw   enable row level security;
alter table public.tracker_shift_rows  enable row level security;
alter table public.tracker_focus_shift enable row level security;
alter table public.tracker_model_time  enable row level security;
alter table public.tracker_reports     enable row level security;
alter table public.tracker_rules       enable row level security;

create policy tracker_devices_read on public.tracker_devices for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_settings_read on public.tracker_settings for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));
create policy tracker_settings_admin_write on public.tracker_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy tracker_events_read on public.tracker_events for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_live_read on public.tracker_live for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_focus_raw_read on public.tracker_focus_raw for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_shift_rows_read on public.tracker_shift_rows for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_focus_shift_read on public.tracker_focus_shift for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy tracker_model_time_read on public.tracker_model_time for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

-- EXCEPTION à la règle de lecture ci-dessus : `tracker_reports` est admin-only. Ce n'est pas une
-- surface utilisateur mais la table d'idempotence des rapports Discord — son payload agrège tout
-- le monde, y compris des personnes hors du périmètre du lecteur.
create policy tracker_reports_read on public.tracker_reports for select to authenticated
  using ((select public.is_admin()));

create policy tracker_rules_read on public.tracker_rules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));
create policy tracker_rules_admin_write on public.tracker_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
