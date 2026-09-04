-- Contrôle des shifts MyPuls — socle (incrément 1).
-- Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md
--
-- Ce que MyPuls mesure et que rien d'autre ne mesure ici : le TEMPS DE CHATTING réel de toute
-- l'agence, tous les jours, sans agent sur le poste. Le Tracker de présence (0125/0126) attend
-- toujours ses applications Electron — `tracker_events` est vide en production depuis l'origine.
-- Ces tables-ci sont alimentées dès le premier run.
--
-- Trois grandeurs MyPuls, à ne pas confondre (vérifié sur capture le 2026-09-01) :
--   « Chatting actif »      minutes porteuses de messages, gouverné par `idle`  → active_minutes
--   « Temps connecté »      durée de session de l'app, plus large              → fiche seulement
--   « Couverture »          part du créneau couverte, en %                     → mypuls_shift_coverage
--
-- LE paramètre à surveiller est `idle` : le passer de 3 à 10 minutes ajoute ~115 minutes MÉDIANES
-- par chatteur et par jour (mesuré sur le 29/08/2026, 137 chatteurs). `break`, lui, ne change
-- RIEN au temps mesuré — 137 chatteurs sur 137 au même résultat — il ne fait que regrouper les
-- segments pour l'affichage. D'où `idle_minutes` figé en base ET recopié sur chaque run.
--
-- PUREMENT ADDITIVE : aucune table existante n'est touchée, aucune ligne `tracker_*` n'est écrite.

-- ---------------------------------------------------------------------------
-- Les faits
-- ---------------------------------------------------------------------------

-- Un SEGMENT d'activité, au grain fin (`break = idle`) : c'est le grain qui porte la timeline,
-- et les vacations s'en déduisent par regroupement (packages/core/src/mypuls-shifts).
-- ~2 600 lignes/jour pour toute l'agence, en UN appel HTTP.
--
-- Clé naturelle (mypuls_user_id, started_at) : deux segments d'une même personne ne peuvent pas
-- commencer dans la même minute. C'est elle qui rend le ré-import IDEMPOTENT — indispensable,
-- puisque chaque run redemande le jour J et le jour J+1 (le créneau du soir court jusqu'à 05:00
-- le lendemain : demander le seul jour J le tronque, et la troncature ressemble à une faute).
create table if not exists public.mypuls_shift_segments (
  -- L'« ID chatteur » de MyPuls. Volontairement SANS clé étrangère : MyPuls connaît des comptes
  -- que le CRM ignore (encadrants, adresses e-mail), et un fait observé ne doit pas être refusé
  -- parce qu'on n'a pas encore rattaché la personne.
  mypuls_user_id text        not null,
  day            date        not null,
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  active_minutes int         not null,
  messages       int         not null,
  models         jsonb       not null default '[]'::jsonb,
  -- Résolu à l'import ; null = orphelin, visible dans l'écran Réglages.
  profile_id     uuid references public.profiles(id) on delete set null,
  imported_at    timestamptz not null default now(),
  primary key (mypuls_user_id, started_at)
);

comment on column public.mypuls_shift_segments.day is
$cmt$jour Paris de DÉBUT du segment — un segment de nuit se termine le lendemain$cmt$;
comment on column public.mypuls_shift_segments.active_minutes is
$cmt$colonne « Temps actif » du CSV = le « Chatting actif » de la fiche MyPuls (même grandeur, vérifié)$cmt$;
comment on column public.mypuls_shift_segments.models is
$cmt$[{"label":"Lolafps","messages":322}] — le PSEUDO MyPuls du modèle, brut. La résolution vers creators est un chantier séparé : le CRM stocke le nom d'usage (« Lola ») et le rapprochement par nom ouvre le piège de sous-chaîne Julie/Juliette$cmt$;

create index if not exists mypuls_shift_segments_day_idx
  on public.mypuls_shift_segments (day);
create index if not exists mypuls_shift_segments_profile_day_idx
  on public.mypuls_shift_segments (profile_id, day);

-- Le VERDICT de couverture, tel que MyPuls le calcule — jamais recalculé chez nous.
-- Mesuré : un recalcul depuis les segments donne une erreur médiane de 0,57 point mais un MAXIMUM
-- de 20,7 points, parce qu'un segment à cheval sur la borne d'un créneau ne peut pas être réparti
-- sans la distribution minute par minute. À 80 % de seuil et avec de l'argent au bout, 20 points
-- d'erreur ne sont pas une approximation, c'est une sanction fabriquée.
-- ~206 lignes/jour.
create table if not exists public.mypuls_shift_coverage (
  day            date        not null,
  -- Vocabulaire CRM (`profiles.shift`, `police_entries.shift`), PAS celui du domaine tracker qui
  -- dit « nuit » : c'est ce vocabulaire-là qui compte au moment de pré-remplir une sanction.
  slot           text        not null check (slot in ('matin', 'aprem', 'soir')),
  -- Bornes RÉELLES du créneau ce jour-là. Stockées ligne à ligne parce que les fenêtres MyPuls
  -- sont saisies dans un formulaire, modifiables à tout moment et sans aucun versionnement :
  -- les figer ici est le seul moyen de voir après coup qu'elles ont bougé.
  slot_start_at  timestamptz not null,
  slot_end_at    timestamptz not null,
  mypuls_user_id text        not null,
  -- Le tableau de couverture de MyPuls ne porte QUE le nom, jamais l'ID. On le résout via le CSV
  -- du même run, où le couple (nom, ID) est bijectif — vérifié : 0 collision sur 155 personnes et
  -- 7 jours. On conserve le libellé lu : c'est la preuve de ce qu'on a rapproché.
  chatter_label  text        not null,
  profile_id     uuid references public.profiles(id) on delete set null,
  coverage_pct   numeric(4,1) not null,
  active_minutes int         not null,
  messages       int         not null,
  first_at       timestamptz,
  last_at        timestamptz,
  imported_at    timestamptz not null default now(),
  primary key (day, slot, mypuls_user_id)
);

comment on column public.mypuls_shift_coverage.coverage_pct is
$cmt$part du créneau couverte, en % — verdict MyPuls repris tel quel, jamais recalculé$cmt$;
comment on column public.mypuls_shift_coverage.first_at is
$cmt$première activité DANS le créneau — c'est elle qui porte le retard$cmt$;

create index if not exists mypuls_shift_coverage_profile_day_idx
  on public.mypuls_shift_coverage (profile_id, day);

-- Les 6 tuiles du haut du relevé MyPuls, au grain JOUR.
--
-- DÉRIVÉES, pas scrapées, et c'est délibéré : les tuiles que MyPuls affiche décrivent la FENÊTRE
-- demandée, pas une journée (« 129 chatteurs actifs / 350 vacations » pour 31/08→01/09). Or notre
-- run demande toujours J et J+1 pour ne pas tronquer le créneau du soir. Recopier ces tuiles
-- telles quelles les étiquetterait « jour J » alors qu'elles couvrent deux jours — un chiffre
-- faux et invérifiable à l'écran. On les calcule donc sur les lignes du jour J qu'on vient
-- d'écrire, ce qui a l'avantage supplémentaire de ne jamais contredire le tableau d'en dessous.
create table if not exists public.mypuls_day_kpi (
  day            date not null primary key,
  chatters_actifs int not null,
  vacations      int  not null,
  active_minutes int  not null,
  messages       int  not null,
  models_worked  int  not null,
  models_total   int  not null,
  slots_held     int  not null,
  slots_total    int  not null,
  imported_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Réglages et journal
-- ---------------------------------------------------------------------------

create table if not exists public.mypuls_shift_settings (
  id                 int  primary key check (id = 1),
  idle_minutes       int  not null default 3,
  break_minutes      int  not null default 60,
  coverage_threshold numeric not null default 80,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id) on delete set null
);

comment on column public.mypuls_shift_settings.idle_minutes is
$cmt$minutes sans message au-delà desquelles MyPuls compte une pause. LE paramètre qui décide du temps mesuré : 3 → 10 ajoute ~115 min médianes par chatteur et par jour. Le changer change les sanctions$cmt$;
comment on column public.mypuls_shift_settings.break_minutes is
$cmt$regroupement d'AFFICHAGE des segments en vacations. Ne change pas le temps mesuré — vérifié sur 137 chatteurs$cmt$;

insert into public.mypuls_shift_settings (id) values (1) on conflict (id) do nothing;

-- Le garde-fou du chantier. Sans ce journal, « le scrape a échoué » et « personne n'a travaillé »
-- sont INDISCERNABLES — et c'est le faux positif le plus cher ici, puisqu'il produit des sanctions
-- injustes. Un jour sans run `ok` affiche « relevé indisponible », jamais des zéros.
create table if not exists public.mypuls_shift_runs (
  id            bigint generated always as identity primary key,
  ran_at        timestamptz not null default now(),
  day_from      date not null,
  day_to        date not null,
  status        text not null check (status in ('ok', 'echec')),
  segments      int  not null default 0,
  coverage_rows int  not null default 0,
  -- Les libellés MyPuls qu'on n'a pas su rattacher, avec leur ID : la matière de l'écran Réglages.
  unmatched     jsonb not null default '[]'::jsonb,
  error         text,
  -- Recopiés du réglage AU MOMENT DU RUN : un changement d'`idle` déplace le temps mesuré, il doit
  -- rester lisible dans l'historique sans avoir à deviner quand le réglage a bougé.
  idle_minutes       int not null,
  coverage_threshold numeric not null
);

create index if not exists mypuls_shift_runs_day_idx
  on public.mypuls_shift_runs (day_to desc, ran_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- LECTURE : qui possède la page « presence », plus les admins ; un membre lit toujours SES lignes.
-- Même formule que 0125 — le cloisonnement fin par modèle reste APPLICATIF
-- (lib/services/creator-scope.ts), la RLS ne le porte pas.
-- ÉCRITURE : service-role après garde applicative. AUCUNE policy d'écriture, sauf les réglages,
-- qui s'éditent depuis l'UI admin.

alter table public.mypuls_shift_segments enable row level security;
alter table public.mypuls_shift_coverage enable row level security;
alter table public.mypuls_day_kpi        enable row level security;
alter table public.mypuls_shift_settings enable row level security;
alter table public.mypuls_shift_runs     enable row level security;

create policy mypuls_shift_segments_read on public.mypuls_shift_segments for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

create policy mypuls_shift_coverage_read on public.mypuls_shift_coverage for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')) or profile_id = (select auth.uid()));

-- Agrégat d'agence, sans profile_id : la clause « ses propres lignes » n'a pas de sens ici.
create policy mypuls_day_kpi_read on public.mypuls_day_kpi for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));

create policy mypuls_shift_settings_read on public.mypuls_shift_settings for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));
create policy mypuls_shift_settings_admin_write on public.mypuls_shift_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Le journal porte les libellés non rattachés : même porte que le reste de la page.
create policy mypuls_shift_runs_read on public.mypuls_shift_runs for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('presence')));
