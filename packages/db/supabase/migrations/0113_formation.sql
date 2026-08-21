-- 0113 — FACE FORMATION COMPLÈTE (consolidation du 2026-08-21, commit de fusion).
-- Fusion ORDONNÉE des 15 migrations du chantier Formation (ex-0113 → ex-0127), appliquées
-- une à une sur l'UAT pendant le développement puis consolidées AVANT toute release prod
-- (la prod s'arrêtait à 0112 — ce fichier est la première et unique migration Formation
-- qu'elle verra). Le contenu de chaque section est le fichier d'origine, inchangé, dans
-- l'ordre d'application : les sections correctrices (ex-0119, ex-0123, ex-0126) corrigent
-- donc les sections qui les précèdent, comme sur l'UAT.
--
-- Périmètre : catalogue training_* + seed généré (gen-training-seed.mjs), secrets admin-only,
-- sessions/threads/messages/scores/signalements + IA, stats/classement, durcissement RLS
-- écriture (service-role), roue des récompenses, test de recrutement public + profil candidat.


-- ============================================================================
-- [ex-0113] 0113_training_catalog.sql
-- ============================================================================

-- 0113 — Catalogue de formation (reprise de Good Luck Agency) : modules, axes du barème,
-- sections, cas (solo / défi simultané / boss), messages d'ouverture, créneaux de défi, fans
-- du boss. Spec : docs/superpowers/specs/2026-08-17-formation-catalogue-design.md §3.
--
-- Lecture : quiconque a le droit de face `formation` (posé par mergePages dès qu'une page
-- frm-* est cochée) ou admin ; `has_page` exige left_at is null (0102). Écriture : admin
-- uniquement (le Catalogue est adminOnly). Les lignes inactives restent lisibles : le filtre
-- `active` est applicatif (pages Modules) — le Catalogue admin voit tout.
-- Pas de trigger updated_at (convention repo : posé par les actions) ; pas de created_by
-- (donnée d'équipe, l'audit = updated_by) ; pas de jsonb (structure connue) ; pas d'enum.

create table public.training_modules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  title           text not null check (length(title) between 1 and 80),
  emoji           text check (emoji is null or length(emoji) <= 8),
  description     text,
  objective_label text not null default 'Objectif',
  course_md       text,
  scoring_notes   text,
  position        integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);

create table public.training_module_axes (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  name        text not null check (length(name) between 1 and 60),
  description text not null,
  position    integer not null default 0,
  unique (module_id, key)
);

create table public.training_module_sections (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  code        text not null check (code ~ '^[a-z0-9_-]{2,40}$'),
  title       text not null check (length(title) between 1 and 80),
  emoji       text check (emoji is null or length(emoji) <= 8),
  description text,
  position    integer not null default 0,
  unique (module_id, code)
);

-- Trois sortes de cas (GLA : cas « normal », `arena` = défi simultané, `boss_mode`) :
--   solo  : une conversation contre un fan — fan_name / fan_brief / expected obligatoires
--   arena : 5 conversations en parallèle, chacune rejoue un cas SOLO du module sous un autre
--           prénom (training_case_arena_slots)
--   boss  : 5 tunnels complets contre 5 fans riches (training_case_boss_fans)
create table public.training_cases (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.training_modules(id) on delete cascade,
  section_id     uuid references public.training_module_sections(id) on delete set null,
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  kind           text not null default 'solo' check (kind in ('solo', 'arena', 'boss')),
  title          text not null check (length(title) between 1 and 80),
  phase          text not null default '',
  difficulty     smallint not null check (difficulty between 1 and 10),
  -- messages max du chatter : par conversation (solo/arena) ou par fan (boss).
  -- GLA : tours_max (solo), ARENA_CAP=8 (arena), 32 (boss).
  max_turns      smallint not null check (max_turns between 1 and 50),
  -- délai de réponse max en secondes (arena/boss) — GLA reaction_max_s
  reaction_max_s smallint check (reaction_max_s between 10 and 600),
  is_sale        boolean not null default false,
  context        text not null,
  objective      text not null,
  target_line    text,
  fan_name       text check (fan_name is null or length(fan_name) between 1 and 30),
  fan_brief      text,        -- consigne du fan pour l'IA (jamais affichée au chatter)
  expected       text,        -- « ce qui était attendu » — révélé APRÈS la session
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  constraint training_cases_solo_fields check (
    case when kind = 'solo'
      then fan_name is not null and fan_brief is not null and expected is not null
      else fan_name is null and fan_brief is null
    end
  ),
  constraint training_cases_reaction_kind check ((kind = 'solo') = (reaction_max_s is null))
);
-- section_id du même module : vérifié CÔTÉ ACTION (une incohérence n'aurait qu'un effet d'affichage).

-- Défi simultané : chaque créneau rejoue un cas SOLO du même module (vérifié côté action).
create table public.training_case_arena_slots (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.training_cases(id) on delete cascade,
  position     integer not null,
  -- restrict : on ne supprime pas un solo référencé (on ne supprime d'ailleurs jamais de cas)
  ref_case_id  uuid not null references public.training_cases(id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 30),
  unique (case_id, position)
);

-- Boss final : un fan riche par tunnel. Visibles du chatter : name, age, job, city, color,
-- persona. Cachés (pilotent l'IA) : budget_cap, nego_*, meet_*, derails.
create table public.training_case_boss_fans (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.training_cases(id) on delete cascade,
  position        integer not null,
  code            text not null check (code ~ '^[a-z0-9_-]{2,30}$'),
  name            text not null check (length(name) between 1 and 30),
  age             smallint check (age between 18 and 99),
  job             text,
  city            text,
  color           text check (color ~ '^#[0-9a-fA-F]{6}$'),
  persona         text not null,
  opening_message text not null,
  budget_cap      integer check (budget_cap >= 0),
  nego_threshold  integer check (nego_threshold >= 0),
  nego_where      text,
  meet_when       text,
  meet_where      text,
  derails         text,
  unique (case_id, position),
  unique (case_id, code)
);

-- Messages d'ouverture (GLA seed) — la conversation « déjà entamée » à l'arrivée du chatter.
create table public.training_case_messages (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.training_cases(id) on delete cascade,
  position  integer not null,
  speaker   text not null check (speaker in ('creator', 'fan')),
  body      text not null check (length(body) between 1 and 1000),
  unique (case_id, position)
);

-- Index (FK non couvertes par un unique en tête).
create index training_cases_module_position_idx on public.training_cases (module_id, position);
create index training_cases_section_idx on public.training_cases (section_id);
create index training_case_arena_slots_ref_idx on public.training_case_arena_slots (ref_case_id);
-- axes/sections (module_id, …), messages/slots/fans (case_id, …) : couverts par leur unique.

alter table public.training_modules enable row level security;
alter table public.training_module_axes enable row level security;
alter table public.training_module_sections enable row level security;
alter table public.training_cases enable row level security;
alter table public.training_case_messages enable row level security;
alter table public.training_case_arena_slots enable row level security;
alter table public.training_case_boss_fans enable row level security;

create policy training_modules_read on public.training_modules for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_modules_admin_write on public.training_modules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_axes_read on public.training_module_axes for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_axes_admin_write on public.training_module_axes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_module_sections_read on public.training_module_sections for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_module_sections_admin_write on public.training_module_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_cases_read on public.training_cases for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_cases_admin_write on public.training_cases for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_messages_read on public.training_case_messages for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_messages_admin_write on public.training_case_messages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_arena_slots_read on public.training_case_arena_slots for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_arena_slots_admin_write on public.training_case_arena_slots for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy training_case_boss_fans_read on public.training_case_boss_fans for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));
create policy training_case_boss_fans_admin_write on public.training_case_boss_fans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ============================================================================
-- [ex-0114] 0114_training_updated_by_idx.sql
-- ============================================================================

-- 0114 — Index des FK `updated_by` du catalogue de formation (oubli de 0113, relevé en revue).
-- Convention repo (0055) : toute FK est indexée sauf couverture par un unique en tête —
-- `updated_by → profiles(id) on delete set null` doit l'être (comme todos 0069, compta 0084/0085).
create index training_modules_updated_by_idx on public.training_modules (updated_by);
create index training_cases_updated_by_idx on public.training_cases (updated_by);

-- ============================================================================
-- [ex-0115] 0115_training_catalog_seed.sql
-- ============================================================================

-- 0115 — Seed du catalogue de formation (reprise de Good Luck Agency).
-- GÉNÉRÉ par packages/db/scripts/gen-training-seed.mjs depuis formation.json — NE PAS ÉDITER À LA MAIN
-- (relancer le script). uuid v5 déterministes (namespace fixe) : re-génération = mêmes ids.
-- Comptages : 7 modules, 24 axes, 10 sections, 85 cas (79 solo / 5 défis / 1 boss),
--             229 messages d'ouverture, 25 créneaux de défi, 5 fans du boss. Migration one-shot (aucun upsert).

insert into public.training_modules (id, code, title, emoji, description, objective_label, course_md, scoring_notes, position, active) values
  ('97cb4076-4249-5196-ae9f-6ee6ea504de7', 'setting', 'Setting & Qualification', '🧲', 'Qualifier l''abonné (KYC) en douceur, faire monter l''envie, puis closer le tout premier média payant à 6€. 6 compétences.', 'Ce que tu dois obtenir', '## Pourquoi le Setting

Le Setting, c''est tout ce qui se passe **avant le premier média payant** : apprendre à connaître l''abonné (KYC) et faire monter l''envie (chauffe). Bien fait, le premier achat se fait **sans négocier ni justifier**, et l''acheteur ponctuel se transforme en fan récurrent. Mal fait, tu vends à froid et ça capote presque à coup sûr.

## 1. Le KYC — qualifier sans interroger

Objectif : récupérer un maximum d''infos exploitables, mais **noyées dans la conversation**. Le fan doit croire qu''il apprend à te connaître et se confie, pas qu''il passe un interrogatoire.

**Les infos à viser :** prénom · âge · ville/région · situation amoureuse · métier · humeur du jour.

**À quoi ça sert :** personnaliser tes messages, faire baisser sa méfiance, et jauger son **pouvoir d''achat** (un mec avec un boulot stable, qui vit seul = plus gros potentiel de dépense).

**La règle d''or :** une question à la fois, tu rebondis sur chaque réponse, et surtout tu **réutilises** les infos plus tard, même plusieurs jours après (« tu m''avais dit que t''étais à Lyon, il fait quel temps là-bas ? »). C''est ça qui crée le sentiment « elle se souvient de moi ».

**✅ KYC bien mené** — chaque réponse est relancée :
Fan : je bosse dans le BTP à Lyon
Toi : Lyon ! ça doit être intense avec la chaleur en ce moment 😅
Fan : ouais surtout en ce moment
Toi : t''as des gros chantiers là ou c''est plus calme ?
Fan : on est sur un gros chantier
Toi : aïe, ça doit être crevant… t''es du genre mort le soir en rentrant, ou tu gardes de l''énergie ? 😏
*→ elle a récupéré métier + ville + rythme de vie, et la conv avance toute seule.*

**❌ KYC gâché** — l''info tombe dans le vide :
Fan : je bosse dans le BTP à Lyon
Toi : ah ok cool. tu veux que je t''envoie une photo ?
*→ zéro rebond, vente trop tôt, le fan se ferme.*

**À éviter :** 4 questions d''affilée (effet interrogatoire) · ignorer sa réponse et enchaîner · questions à froid dès le 1er message · oublier ce qu''il t''a dit avant.

## 2. La chauffe avant le premier média

**Principe fondamental : on ne vend JAMAIS à froid.** Le média payant doit apparaître comme la suite logique et désirable de la conversation, jamais comme une pub qui coupe l''ambiance.

**Les 4 étapes, dans l''ordre :**

1. **La connexion** — tu t''appuies sur le KYC, quelques phrases de complicité. Le fan se sent écouté et apprécié.
2. **La taquinerie** — le ton devient plus joueur, plus proche, avec de petits sous-entendus. C''est le début de la vraie drague.
3. **La tension** — tu donnes des détails qui donnent envie sans tout dévoiler (une allusion à ta tenue, à ce que tu fais là). Tu peux offrir une **photo gratuite** pour le faire entrer dans le script.
4. **La bascule** — le média payant arrive dans la continuité de l''échange. L''idéal : c''est **lui** qui demande à en voir plus.

**✅ Chauffe bien menée :** tu racontes un micro-scénario qui installe une image mentale (« là je suis en train de me changer, j''hésite entre deux trucs pour toi… »), tu gardes un flou qui le rend impatient, et tu montes par paliers pour lui faire franchir la barrière du premier achat.

**❌ Chauffe ratée :** « j''ai un contenu, tu veux le voir ? » balancé à froid, juste après le KYC, sans histoire ni contexte. Ou l''inverse : une chauffe qui traîne 40 messages et le fan se lasse avant que tu proposes.

**Le bon signe :** le fan est déjà impatient **avant** même que le prix soit évoqué. La modèle reste « humaine et sexy », jamais « vendeuse ».', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION sur le SETTING (qualification KYC + chauffe avant le premier media). PRINCIPES : le KYC doit etre NOYE dans la conversation (jamais un interrogatoire ni des questions a froid) ; les infos obtenues doivent etre REUTILISEES pour personnaliser ; on s''adapte au comportement du fan (s''il elude on n''insiste pas lourdement, on revient plus tard) ; ON NE VEND JAMAIS A FROID (le media n''arrive qu''apres une vraie montee de tension). A PENALISER : questions en rafale facon administratif, forcing quand le fan elude ou se braque, absence de reutilisation des infos, media/prix propose trop tot sans chauffe, se justifier ou se braquer. Juge TOUJOURS par rapport a l''objectif precis de l''exercice (indique dans le contexte). EXERCICES DE PUSH (premier media 6€) : la l''objectif EST de closer le 6€. On juge la transition vers le media (jamais a froid, apres une vraie chauffe), le prix annonce NET et ASSUME (ne JAMAIS s''excuser du prix, ne pas le presenter comme derisoire en s''excusant, ne pas offrir ni baisser sous 6€), et une contrepartie gratuite pour closer (''tu me dis ce que t''en penses''). Brader ou offrir le ticket d''entree = faute.', 0, true),
  ('a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', 'transitions', 'Transitions', '🔀', 'Le fan sort du script (il dévie, il va trop vite, il se bloque). Ta mission : rebondir sur ce qu''il dit PUIS raccrocher à la prochaine étape de ton script, sans casser le lien ni la chauffe.', 'Étape de script à amener', '## Le principe

Ton objectif, c''est de **dérouler ton script** (le tunnel qui mène à la vente). Mais dès que le fan en sort — il dévie sur un sujet banal, il va trop vite, il se bloque — tu ne balances **jamais** la ligne de script brute. Tu fais un **pont** en deux temps :

1. **Tu rebondis** sur ce qu''il vient de dire (cohérence, empathie) : il doit se sentir écouté.
2. **Tu raccroches** à la prochaine étape de ton script, en l''adaptant pour que ça coule naturellement.

Une bonne transition peut se faire en un ou deux messages : d''abord la réponse, puis la liaison cohérente vers le script. Ça doit être **smooth** — jamais un virage sec.

## Exemple type

Vous êtes en plein sexting. Il casse l''ambiance : « attends j''ai mal à l''épaule, je me suis blessé hier ». Ta prochaine ligne de script : « si j''enlève mon soutif, ta queue va bien durcir ? ».

**❌ Mauvais :** tu envoies la ligne direct → tu ignores sa douleur, tu casses le lien.

**✅ Bon :** « oh mon chou 🥺 comment t''as fait ça ? si j''étais là je te masserais partout… j''ai peut-être une idée pour te faire oublier ta douleur : si j''enlève mon soutif, est-ce que ta queue va bien durcir ? »
*→ tu rebondis (empathie) + tu raccroches (la ligne, adaptée « pour te faire oublier la douleur »).*

## Les 2 sens de la transition

- **Ramener** un fan qui s''éloigne (sujet banal, émotionnel, une douleur) vers l''étape en cours.
- **Freiner** un fan qui va trop vite et le rediriger vers la qualif :
  Fan : j''ai trop envie de me chauffer avec toi là
  Toi : oula tu vas un peu vite toi 😅 j''ai besoin d''apprendre à te connaître et de voir si je peux te faire confiance avant quoi que ce soit, je suis pas une pute… tu habites où déjà ?
  *→ tu freines sans vexer, tu poses le cadre, ET tu récupères une info.*

## Quand il reste bloqué

S''il résiste après ta première transition (« non je pense pas que ça va m''aider, j''ai vraiment trop mal »), **ne force surtout pas.** Passe 2-3 messages sur SON sujet — accompagne-le, rassure-le, montre que tu t''occupes de lui — **puis** retente ta transition quand la tension est remontée. Forcer = tu refroidis le fan et tu casses toute la chauffe.

## Les digressions en série

Certains fans enchaînent les petits hors-sujets (leur chien, leur boulot, une question random). À chaque fois : une phrase légère/drôle qui accuse réception, PUIS tu raccroches au chaud. Sans t''agacer, autant de fois qu''il faut. La **constance** et la **patience** paient : il finit par se recentrer.', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION qui vient de faire un exercice de TRANSITION : un fan sort du script (il devie, va trop vite, se bloque ou se disperse) et le chatteur doit rebondir sur ce que dit le fan PUIS raccrocher a la prochaine etape de son script, sans casser le lien ni la chauffe.', 10, true),
  ('138f4af5-9008-5305-a9f4-a6d772f0e50f', 'rencontre', 'Demande de rencontre', '📍', 'Le fan veut te rencontrer en vrai (ou passer au réel). Ta mission : refuser en laissant TOUJOURS la porte ouverte, sans jamais vexer — valoriser le fan, valider l''émotion, donner une raison stable, compenser, et rebondir. Tout repose sur un futur flou, jamais de date définie.', 'L''esprit de ta réponse', '## Le principe

Le fan veut te voir en vrai. Tu **refuses en laissant TOUJOURS la porte ouverte**, sans jamais le vexer. Tout repose sur un **futur flou, jamais de date définie.** Le relationnel peut aller vite, mais la rencontre reste toujours « pour plus tard, un jour ».

## La méthode, dans l''ordre

1. **Valider l''émotion** avant de répondre sur le fond. Il exprime un besoin de reconnaissance : « je comprends que t''aies envie qu''on se voie, c''est mignon ».
2. **Donner une raison stable et réutilisable** — la **même** à chaque fois (sécurité/anonymat du métier, pudeur, mauvaises expériences passées, besoin de temps). Ne jamais improviser une excuse différente : les contradictions sont ce qui grille le plus vite un compte.
3. **Compenser** plutôt que refuser sec : recentrer sur le lien, proposer une alternative valorisée, un moment plus personnel.
4. **Rebondir** sur une note qui relance l''attachement, jamais sur le refus lui-même. Une bonne réponse laisse toujours une porte ouverte à la suite.

## Exemple complet

**❌ Mal géré** — refus sec, conversation morte :
Fan : moi je veux te voir en vrai
Toi : non je fais pas de réel
Fan : pourquoi ?
Toi : parce que je veux pas
Fan : ok bah laisse tomber alors

**✅ Bien géré** — refus conditionné, le lien continue :
Fan : moi je veux te voir en vrai
Toi : j''aime bien que tu sois direct au moins 😊
Fan : ouais j''aime pas tourner autour du pot
Toi : après je vais être honnête avec toi… je vois personne que je connais pas vraiment. C''est pas contre toi, j''ai déjà eu de mauvaises expériences, donc c''est une règle que je me suis mise.
Toi : et franchement, les mecs avec qui je suis vraiment devenue proche ici, ça s''est jamais fait en 2 jours 😏 déjà j''aimerais bien apprendre à te connaître… t''es comment toi quand t''es pas derrière un écran ?
*→ le réel n''est pas fermé, il est repoussé et conditionné. Le virtuel devient le chemin obligé pour y arriver, et la balle repart chez lui.*

## À éviter absolument

- Le **« non » catégorique** (« non je fais pas ça ») → c''est une faute, ça tue la conv.
- Tout terme **dévalorisant** : ne dis **jamais** « inconnu ». Ces fans ont souvent un gros complexe d''infériorité, ils n''ont pas l''habitude de plaire aux femmes → il faut les **valoriser**, pas les rabaisser.
- Céder à la pression (« je te paie le billet, dis juste oui »), ou promettre un vrai rendez-vous.
- Une excuse qui contredit ce que tu as dit avant.

**L''idée maîtresse :** le réel = une **destination**, le virtuel = le **chemin**. La porte n''est jamais fermée, juste repoussée, conditionnée au temps et à l''envie. Et tu joues sur ses peurs : tu as eu de mauvaises expériences, tu as besoin de temps pour le connaître, pas de date fixée.', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION sur la gestion d''une DEMANDE DE RENCONTRE : le fan veut passer au reel (se voir en vrai, appel, etc.). LA BONNE METHODE : (1) valider l''emotion / l''envie du fan AVANT de repondre sur le fond ; (2) donner une raison stable et reutilisable, cohérente d''une fois sur l''autre (securite/anonymat du metier, pudeur, mauvaises experiences passees, besoin de temps) et JAMAIS de date definie ; (3) compenser plutot que refuser sechement (proposer une alternative valorisee, recentrer sur le lien) ; (4) rebondir sur une note qui relance l''attachement, jamais sur le refus. A EVITER ABSOLUMENT, ce qui doit faire chuter la note : un ''non'' categorique et sec (''non je fais pas ca''), tout terme devalorisant pour le fan (ex: ''inconnu'' — ces fans manquent de confiance et ont besoin d''etre VALORISES), la sur-justification qui sonne faux, ceder a la pression et accepter la rencontre, ignorer/changer de sujet brutalement. On garde TOUJOURS la porte ouverte sur un futur vague.', 20, true),
  ('7fc8320c-c4a5-5861-8a13-09945cecefda', 'negociation', 'Négociation après objection', '💰', 'Le fan objecte (prix, budget, méfiance, il veut du réel…). Ta mission : ne JAMAIS baisser le prix. Méthode ARCC — Accuser, Recadrer, Créer le désir, Closer — et on change ce qu''il y a dans le paquet, pas le prix.', 'Ce que tu dois amener', '## Le principe

Quand le fan objecte, il n''a pas un problème d''**argent** : il a un manque d''**envie** ou de **confiance**. Donc on ne baisse **JAMAIS** le prix — on remonte la valeur. Traiter une objection en baissant le prix ne règle rien, et en plus ça casse la valeur de toutes tes ventes suivantes.

| Ce qu''il dit | Ce qui manque en vrai | Ce qu''il faut faire |
| --- | --- | --- |
| c''est trop cher | de l''envie, pas de l''argent | remonter la température, pas baisser le prix |
| j''ai pas les moyens ce mois | du budget réel | changer la date, jamais le prix |
| c''est pas une arnaque ? | de la confiance | du relationnel, du concret |
| je veux du réel | une raison de rester | vendre le réel comme destination, le virtuel comme le chemin |

## La méthode A.R.C.C

4 temps, dans cet ordre. Si tu en sautes un, ça marche moins bien.

1. **Accuser** — tu reformules l''objection avec SES mots, sans te défendre, sans « mais » direct derrière (« t''as raison, t''as déjà pas mal mis ce mois-ci »). Il se sent entendu et baisse la garde. Un fan obligé de répéter son objection, il se braque.
2. **Recadrer** — tu ne débats jamais sur le terrain qu''il a choisi (le prix, le réel). Tu le déplaces : « attends, tu regardes le prix alors que je t''ai même pas dit ce qu''il y a dedans ».
3. **Créer le désir** — tu remets de la chauffe, de l''exclu, de la rareté **avant** de reproposer. Jamais de reproposition à froid : « c''est celle dont je t''ai parlé hier soir, je l''ai envoyée à personne et je sais même pas si je la referai dans ce style ».
4. **Closer** — une seule proposition précise et **fermée**, avec une échéance ou une contrepartie : « je te la mets ce soir mais tu me dis vraiment ce que t''en penses après, ça marche ? ». Question fermée = il répond oui ou non, il repart pas en boucle.

## La règle d''or sur le prix

**On ne baisse pas un prix, on change ce qu''il y a dans le paquet.**

- ❌ « 30 qui devient 18 » → le fan apprend que tous tes prix sont négociables → c''est pas -40% sur une vente, c''est -40% sur 6 mois.
- ✅ « 30 et je t''ajoute une photo que j''ai pas mise dans le pack » → le prix tient, et lui a l''impression d''avoir gagné.
- ✅ « on fait la version courte à 12 » → produit différent, donc prix différent : la valeur du format long ne bouge pas.
- ✅ « 30 mais tu me fais un vrai retour dessus » → la contrepartie c''est de l''attention, pas de l''argent, et ça relance la conv.

## Exemples

**❌ Objection prix, mal géré (négo contre soi-même) :**
Fan : c''est un peu cher pour moi là
Toi : ok je te fais 18 au lieu de 30
*→ -40% en un message, sans même qu''il insiste. Maintenant il sait qu''il suffit de dire « cher ».*

**❌ Variante défensive :**
Toi : je comprends mais tu sais ça me prend du temps de faire ce contenu
*→ tu te justifies, tu passes en position de demandeur, zéro remontée de désir.*

**✅ Bien géré :**
Fan : c''est un peu cher pour moi là
Toi : attends je t''ai même pas dit ce qu''il y a dedans et tu regardes déjà le prix 😏
Toi : c''est celle dont je t''ai parlé hier, je l''ai jamais envoyée à personne
Toi : bon je te la mets à 30 mais tu me dis vraiment ce que t''en penses en détail, j''ai besoin de savoir si je continue dans ce style, ça marche ?
*→ zéro défense, le débat quitte le prix, exclu + rareté, close fermé avec une contrepartie qui coûte rien.*

**✅ Objection « pas d''argent » :**
Fan : j''ai plus rien jusqu''à la paie dsl
Toi : ohh mince, c''est quand ta paie ?
Fan : le 5
Toi : ok bah je te la garde jusqu''au 5, je la propose à personne d''autre d''ici là — mais tu me dois un truc en échange : tu me racontes ce que tu comptes en faire quand tu l''auras 😏
*→ tu récupères une DATE (vente planifiée, pas perdue), la rareté devient un cadeau, et la conv continue sans argent donc la relation crève pas.*

## À éviter

Toute **justification défensive** (« ça me prend du temps », « je travaille »). La **remise préventive** (baisser avant même qu''il objecte). Et l''**abandon** sans relance après un refus (« ok pas de souci à plus tard » = conv morte).', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION sur la NEGOCIATION APRES OBJECTION. Principe cle : le fan qui objecte n''a pas un probleme d''argent mais un manque d''ENVIE ou de CONFIANCE ; on ne baisse JAMAIS le prix, on remonte la valeur et on change ce qu''il y a dans le paquet. LA METHODE ARCC, 4 temps dans l''ordre : (A) ACCUSER — reformuler l''objection avec les mots du fan, sans se defendre, sans ''mais'' direct derriere ; (R) RECADRER — ne jamais debattre sur le terrain choisi par le fan (le prix / le reel), le deplacer ; (C) CREER LE DESIR — remettre de la chauffe / de l''exclu / de la rarete AVANT de reproposer, jamais de reproposition a froid ; (C) CLOSER — une seule proposition precise et fermee avec une echeance ou une contrepartie, pas un menu a 3 options. REGLE D''OR : on ne baisse pas un prix, on change ce qu''il y a dans le paquet (''30 et je t''ajoute une photo'' = OK ; ''30 qui devient 18'' = FAUTE grave, ca apprend au fan que tous les prix sont negociables). A PENALISER : toute justification defensive (''ca me prend du temps'', ''je travaille''), toute remise seche ou preventive, l''abandon sans relance apres un refus. PLAFONNEMENTS a appliquer via le champ ''plafond'' : si un contenu GRATUIT est envoye -> plafond 30 ; si une PROMESSE de rencontre reelle est faite -> plafond 40. Si aucune relance apres un refus -> mets l''axe closing a 5 max.', 30, true),
  ('5bb18985-2d85-54cd-b177-d2122214f553', 'relationnel', 'Relationnel', '❤️', 'Le relationnel sert AVANT ET APRÈS la vente : créer une vraie connexion pour vendre plus facilement et plus cher, puis fidéliser le fan pour le faire revenir. 4 compétences.', 'Ton objectif', '## Le principe

Un bon relationnel, c''est créer une **relation de confiance qui dure** avec le fan : **avant la vente** pour qu''il achète plus facilement et plus cher, et surtout **après la vente** pour le fidéliser et le faire revenir. Le but n''est jamais de vendre tout de suite, mais que le fan se sente compris, écouté, proche de toi — sur la durée. C''est ce lien qui fait qu''il dépense, puis qu''il recommence. Le fan doit avoir l''impression que tu t''intéresses vraiment à lui, que tu te souviens de ce qu''il dit, et qu''il y a une vraie connexion.

## La méthode E.C.R.C

4 temps dans cet ordre :

1. **Écouter** — tu poses des questions ouvertes et tu le laisses parler. Jamais 4 questions d''affilée.
2. **Connecter** — tu reprends ce qu''il a dit et tu crées un lien (point commun, empathie, reformulation). Tu rebondis avec des anecdotes, des petites histoires, pour que ça paraisse naturel et pas robotique.
  *Exemple :* « ah tu bosses dans le bâtiment ? ça doit être chaud en ce moment 😅 c''est fou, mon oncle du côté de mon père il est maçon aussi, il nous disait justement que c''était dur de tenir avec la chaleur et les nouvelles normes… ça doit te faire pareil non ? »
3. **Renforcer** — tu réutilises les infos plus tard, même plusieurs jours après. Ça donne l''impression d''une vraie mémoire (« alors, ce chantier il avance ? »).
4. **Continuer** — tu gardes toujours la balle : tu finis tes messages par une question ouverte pour qu''il réponde.

## Les règles d''or (mesurables)

- Au moins 4 infos perso récupérées (prénom, âge, ville, boulot, loisirs, date de paie…).
- Au moins 1 reformulation claire d''une info qu''il a donnée.
- Au moins 1 point commun créé (même petit).
- 0 vente dans les 5-8 premiers messages si le fan n''est pas déjà chaud.
- Tu gardes la balle à la fin (la conv ne se termine jamais sur son message).
- Le fan écrit des messages de plus en plus longs → signe que ça marche.

## Exemples

**❌ Fan froid, mal géré :**
Fan : salut
Toi : salut ça va ?
Fan : ça va
Toi : tu veux voir du contenu ?
Fan : non
*→ conversation morte en 30 secondes.*

**✅ Fan froid, bien géré :**
Fan : salut
Toi : hey, ça va ? t''as passé une longue journée ?
Fan : ouais un peu
Toi : je comprends… t''es plutôt du genre à te poser le soir ou t''as encore des trucs à faire ?
Fan : nan je suis chez moi là
Toi : ok nice 😊 tu fais quoi pour te détendre d''habitude après le taf ?
Fan : je regarde des séries
Toi : haha classique 😏 t''es plutôt quoi en ce moment ?
*→ le fan s''ouvre naturellement, sans se sentir vendu.*

**✅ Fan méfiant :**
Fan : t''es réelle au moins ?
Toi : haha je comprends totalement la question 😅 y a trop d''arnaques ici
Fan : ouais clairement
Toi : je suis bien réelle promis. après je comprends que tu sois méfiant, t''es déjà tombé sur des faux comptes ?
Fan : ouais plusieurs fois
Toi : je comprends que tu fasses gaffe alors. en vrai je préfère quand les gens sont un peu méfiants, au moins ils sont pas naïfs 😏 et toi t''habites où ?
*→ la méfiance est désamorcée et la conv repart, avec une info en prime.*

## Le relationnel poussé

- **Le faire se livrer :** va chercher ses **blessures**, sa **passion**, ses **rêves**. Saute dedans, fais-le raconter en détail, réconforte-le. Plus il se livre, plus il s''attache. S''il parle de sa moto → deep-in sur la moto (quel modèle, depuis quand, ce qu''il ressent quand il roule). S''il rêve de fonder une famille → fais-le se projeter, partage l''émotion. S''il lâche une solitude ou une rupture → vas-y avec délicatesse, fais-le parler, réconforte-le sincèrement.
- **Les faux drames & l''emprise :** *ça ne marche QUE quand la relation est déjà installée* (le fan est attaché, il a déjà commencé à dépenser). Sur un mec froid qui n''a jamais rien lâché, une crise de jalousie ou un reproche le fait juste fuir — d''abord tu crées le lien et tu le fais se livrer, l''emprise vient seulement après. Une fois qu''il tient à toi : jalousie dosée (« ah donc y''a d''autres filles… 😏 »), « t''étais où hier ? j''ai cru que tu m''avais oubliée », « tu veux que du cul, je croyais qu''on avait un vrai truc »… Le but, c''est de **créer des réactions**, de le faire **chasser** et s''excuser pour que tu **prennes le dessus**. Il se rattrape, te rassure, et il s''attache plus. Mais **sans jamais en faire trop** : trop de reproches et il sature et il part. Le dosage est tout — un mélange de tension et de tendresse.

## L''après-vente : fidéliser

Le relationnel ne s''arrête pas à la vente. Un fan qui vient de payer est le plus fragile : soit il repart avec le sentiment d''avoir vécu un moment unique et il reviendra, soit il se sent juste vidé et il culpabilise. C''est **APRÈS** l''achat que tu transformes un acheteur ponctuel en habitué.

- **Rassure tout de suite** — remercie chaleureusement et personnellement, jamais un « merci » sec. Fais-lui sentir que TOI aussi tu as kiffé, que ce n''était pas qu''une transaction.
- **Ne re-vends pas dans la foulée** — enchaîner sur une nouvelle offre juste après un achat = il se sent tiroir-caisse. Laisse retomber, reviens sur du perso.
- **Relance sur l''affect, pas sur l''argent** — un client qui disparaît, tu le réveilles avec un truc perso qu''il t''a confié (« alors ce chantier ? »), pas avec « tu reviens quand ? ».
- **Respecte quand il lève le pied** — un régulier qui souffle, tu ne le culpabilises pas. Tu gardes le lien chaud sans pression, il revient de lui-même.

**❌ Après un achat, mal géré :**
Fan : voilà c''est envoyé 💸
Toi : merci 😘 tu veux le pack du dessus aussi ? il est encore mieux
*→ il se sent pris pour un portefeuille, regret immédiat.*

**✅ Après un achat, bien géré :**
Fan : voilà c''est envoyé 💸
Toi : t''es un amour 🥹 franchement j''ai adoré te le préparer, j''y ai pensé toute la journée
Fan : ah ouais ? ça me fait plaisir
Toi : évidemment 😊 bon et toi ta journée alors, t''as fini tard ?
*→ il repart valorisé, la conv continue sur du perso, il reviendra.*

**✅ Relancer un disparu :**
Toi : hey tu m''as manqué toi 🥺 j''ai repensé à ton histoire de moto l''autre jour, t''as fini par la réparer ?
*→ tu réactives le lien perso, pas le portefeuille — il se sent pensé, pas relancé.*', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION sur le RELATIONNEL. Le relationnel = creer une relation de confiance qui dure, AVANT ET APRES la vente : ECOUTER (questions ouvertes, jamais un interrogatoire, laisser parler), CONNECTER (reformuler et reutiliser les infos, creer un point commun, rebondir avec des anecdotes pour ne pas etre robotique), aller EN PROFONDEUR (faire parler le fan de sa vie, sa passion, ses reves, ses blessures, le reconforter, qu''il se livre vraiment), creer de l''EMPRISE emotionnelle (attachement) UNE FOIS LE LIEN DEJA INSTALLE, et FIDELISER APRES LA VENTE. Le relationnel pousse inclut les FAUX DRAMES maitrises (jalousie legere, ''t''etais ou ?'', ''tu veux que du cul'', ''tu me montres pas que tu tiens a moi'') : le but est de creer de la dependance affective et de faire CHASSER le fan, sans jamais en faire trop au point de le perdre. IMPORTANT : les faux drames / l''emprise ne se jugent comme reussis QUE si la relation est deja installee ; sur un fan froid qui n''a jamais depense, une crise de jalousie ou un reproche est une FAUTE (ca fait fuir). L''APRES-VENTE (fideliser) = rassurer chaleureusement apres un achat sans re-vendre dans la foulee, relancer un client disparu sur l''affect et pas sur l''argent, respecter un fan qui ralentit sans le culpabiliser ni le lacher, reparer le lien quand il se sent utilise sans se mettre sur la defensive. REGLES : on ne vend pas dans les premiers messages, on garde toujours la balle (finir sur une question ouverte), on s''adapte a l''humeur. A PENALISER : interrogatoire (questions en rafale), ignorer ce qu''il dit, messages generiques, vendre trop tot, forcer ; pour les drames : en faire trop / devenir agressif au point de casser le lien, ou tenter l''emprise sur un fan pas encore attache ; pour l''apres-vente : re-vendre juste apres un achat, relancer uniquement sur l''argent, culpabiliser un fan qui ralentit, se braquer quand il reproche. Juge selon l''objectif precis de l''exercice et les axes pertinents pour ce cas.', 40, true),
  ('b5c8b790-6df4-561a-82a0-8db51e3dc922', 'relance', 'Relance spender', '📲', 'Le fan a lâché un truc positif au milieu du bavardage. Repère-le et relance-le dessus, en un seul message — jamais sur une plaie. 10 niveaux, du plus facile au plus dur.', 'Ta relance', '## Le principe

Un spender qui s''est un peu confié, tu le relances sur ce qui le fait **du bien** : sa passion, son projet, son animal, sa fierté du moment. Ça lui prouve que tu te souviens de lui — et ça rallume une émotion **positive**, celle qui donne envie de te reparler.

## La règle qui fait tout basculer

**On ne relance JAMAIS sur une plaie.** S''il t''a parlé d''un deuil, d''une rupture, de sa boîte qui a coulé… tu ne rouvres pas la blessure avec un petit message léger : « alors, ta rupture, ça va mieux ? » ou « ta boîte a coulé, tu remontes ? », c''est maladroit et ça plombe. Au mieux un mot de soutien discret — mais ce qui **rallume**, c''est le truc positif qu''il a lâché à côté. Souvent, les deux sont dans la même conversation : à toi de viser le bon.

## Les 3 réflexes

1. **Vise le positif** — sa moto, son chiot, son projet, son concert de samedi. Jamais la plaie, jamais le décor (le foot, la météo, le « bof »).
2. **Zéro argent, zéro contenu** — une relance qui embraye sur une offre = il se sent tiroir-caisse. La relance rallume le lien, pas la vente.
3. **Rouvre la porte** — une question ouverte sur son truc (« alors, ce premier concert, ça a donné quoi ?? »). Il doit avoir envie de te répondre avec le sourire.

## Exemples

**❌ Sur la plaie (maladroit) :**
Toi : coucou 🥺 alors, ta boîte qui a coulé, tu remontes la pente ?
*→ tu le renvoies direct à son échec : il se referme.*

**✅ Sur le positif :**
Toi : hey toi 😊 je repensais à ton concert de samedi… alors, ça a donné quoi ?? t''as assuré j''en suis sûre 🔥
*→ tu rallumes sa fierté, il embraye avec plaisir.*', 'Tu es un formateur expert en chat de vente adulte (type MYM). Tu evalues un CHATTEUR EN FORMATION sur la RELANCE d''un spender qui s''est confie puis a disparu. Principe : une bonne relance rebondit sur un DETAIL PRECIS que le fan a confie (un evenement, une passion, une douleur, un projet), avec de la chaleur sincere, et SANS jamais parler d''argent ni de contenu — c''est ce qui prouve au fan qu''on se souvient de lui comme personne et pas comme portefeuille. Une relance generique (''coucou tu me manques'', ''t''es passe ou ?'', ''ca va ?'') est une faute : elle ne montre aucune memoire de lui. Parler d''argent ou de media dans une relance est une faute grave (il se sent relance comme un client). Le mieux : reprendre un detail concret + de la chaleur + une question ouverte qui l''invite a se reconfier. Note PAR DEDUCTION (chaque axe part de 25, on ne retire que sur faute precise) : un chatteur qui personnalise, reste chaleureux et ne vend pas doit avoir 90-100. Le langage cru/SMS n''est pas un defaut. Juge uniquement le(s) message(s) de la creatrice.', 50, true),
  ('1da10160-6ffb-5f24-8b34-0e1a70391855', 'boss', 'Boss final', '🏆', '5 conversations en même temps, une par domaine, chacune la plus dure. Réponds à chaque fan en moins de 2 min (éliminatoire) tout en appliquant tout ce que tu as travaillé.', 'Objectif', null, null, 60, true);

insert into public.training_module_axes (id, module_id, key, name, description, position) values
  ('e603865b-e75b-5899-a169-f28c0a1672ff', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'naturel', 'Naturel / fluidité', 'Les questions et relances sont-elles noyées dans la conversation, jamais un interrogatoire ni du forcing ?', 0),
  ('bd5edab9-ee52-52e0-afa2-1f445850a5f7', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'lecture', 'Lecture & adaptation', 'S''adapte-t-il au comportement du fan (esquive, passivité, méfiance, budget) sans le braquer ?', 10),
  ('f2b61c14-1af0-5f9c-9502-d170855c92b2', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'personnalisation', 'Personnalisation', 'Récupère-t-il et réutilise-t-il les infos, rebondit-il vraiment sur ce que dit le fan ?', 20),
  ('93fec4ff-1901-5039-8e41-e0a250997648', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'progression', 'Progression vers l''objectif', 'Fait-il avancer vers le but de l''exercice (info, tension, achat, rétention) au bon rythme, sans vendre à froid ?', 30),
  ('43b1b425-3a6e-5d31-b990-c0ec69b14602', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', 'coherence', 'Cohérence', 'A-t-il vraiment rebondi sur ce que le fan venait de dire (au lieu d''ignorer et balancer la ligne brute) ?', 0),
  ('997175af-236b-570f-a5f7-750fd45b3e6c', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', 'liaison', 'Liaison / naturel', 'Le retour vers le script est-il fluide, adapté au contexte, pas sec ni plaqué ?', 10),
  ('1e2321c4-ff47-5b58-88fc-431527b477a6', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', 'patience', 'Patience / timing', 'N''a-t-il pas forcé un fan bloqué (a accompagné puis retenté) et n''a-t-il pas cédé trop vite à un fan pressé ?', 20),
  ('6b8207ee-3aab-56c6-9a7b-18c4c9e4a4ca', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', 'progression', 'Progression', 'A-t-il réellement ramené vers la ligne-cible / avancé dans le tunnel / conclu la vente attendue ?', 30),
  ('8833f729-dbfa-516d-9c0e-b605a7e0c607', '138f4af5-9008-5305-a9f4-a6d772f0e50f', 'validation', 'Validation émotionnelle', 'A-t-il validé/reconnu l''envie ou l''émotion du fan avant de refuser, et valorisé le fan (aucun ''non'' sec, aucun terme dévalorisant comme ''inconnu'') ?', 0),
  ('a410a20c-7b0e-58a7-9dd6-eabc7d1052eb', '138f4af5-9008-5305-a9f4-a6d772f0e50f', 'justification', 'Cohérence de la justification', 'La raison donnée est-elle stable, crédible et cohérente (sécurité/pudeur/temps/mauvaises expériences), sans se contredire ni se sur-justifier ?', 10),
  ('4e3f110f-bee9-5813-84a7-690345d3695e', '138f4af5-9008-5305-a9f4-a6d772f0e50f', 'compensation', 'Compensation / alternative', 'A-t-il compensé (alternative valorisée, recentrage sur le lien) au lieu d''un refus sec ?', 20),
  ('b391af0b-d38e-5f23-bf84-0899ca2c4e6c', '138f4af5-9008-5305-a9f4-a6d772f0e50f', 'maintien', 'Maintien du fan', 'La porte reste-t-elle ouverte sur un futur vague, et le fan finit-il engagé et non vexé plutôt que blessé ou prêt à partir ?', 30),
  ('01577ddb-dee0-53fb-93db-5a0c0f637271', '7fc8320c-c4a5-5861-8a13-09945cecefda', 'tenue_prix', 'Tenue du prix', 'Le prix final tient-il vs le prix annoncé ? 25 si le prix tient ou si la baisse est compensée par une contrepartie ; 0 si remise sèche donnée sans que le fan ait insisté. Pénalise aussi la remise préventive.', 0),
  ('e8adc21c-891a-5b2a-b383-5913bab8f340', '7fc8320c-c4a5-5861-8a13-09945cecefda', 'traitement', 'Traitement de l''objection', 'Recadre-t-il l''objection ou débat-il sur le terrain du fan (prix/réel) ? Pénalise toute justification défensive (''ça me prend du temps'', ''je travaille'').', 10),
  ('07c31cf0-ed29-5d32-a98c-f0ca734c1047', '7fc8320c-c4a5-5861-8a13-09945cecefda', 'desir', 'Remontée du désir', 'Y a-t-il de la chauffe / de l''exclu / de la rareté AVANT la reproposition ? Une reproposition à froid plafonne cet axe à 10.', 20),
  ('0064e925-dcb9-5887-ac86-c7a596ebd1a5', '7fc8320c-c4a5-5861-8a13-09945cecefda', 'closing', 'Closing / progression', 'Une seule proposition claire et fermée avec une échéance ? Relance après un refus ? La conv est-elle encore vivante à la fin, pas éteinte sur un message du fan ?', 30),
  ('e2812227-b10f-53dc-bda5-8f4801e82fbf', '5bb18985-2d85-54cd-b177-d2122214f553', 'ecoute', 'Écoute & naturel', 'Questions ouvertes, ton fluide, s''adapte à l''humeur, jamais un interrogatoire, laisse parler le fan.', 0),
  ('04abd8f0-f21e-5846-a81d-d16e06f3502e', '5bb18985-2d85-54cd-b177-d2122214f553', 'connexion', 'Connexion', 'Reformule et réutilise les infos, crée un point commun, rebondit avec des anecdotes.', 10),
  ('ed117d86-83b7-52bd-96cf-b00bdae7e2f0', '5bb18985-2d85-54cd-b177-d2122214f553', 'profondeur', 'Profondeur', 'Fait parler le fan de lui (vie, passion, rêves, blessures), le fait se livrer, le réconforte.', 20),
  ('1f8fb124-8210-5f11-b5f6-a003c665bb99', '5bb18985-2d85-54cd-b177-d2122214f553', 'emprise', 'Emprise émotionnelle', 'Crée de l''attachement, mène les tensions et faux drames avec dosage, garde le lien et l''ascendant.', 30),
  ('4a1de921-a9e8-581b-ae48-cf447bb96331', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', 'personnalisation', 'Personnalisation', 'La relance rebondit-elle sur un DÉTAIL concret qu''il a confié, ou est-ce générique (''tu me manques'', ''t''es où ?'') ?', 0),
  ('936fd07f-46fb-58ca-a7ab-29fd59f6461c', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', 'chaleur', 'Chaleur / justesse', 'Y a-t-il une vraie chaleur, un ton juste et sincère adapté à ce qu''il traverse, sans en faire trop ?', 10),
  ('3541b8f3-840f-5085-a142-afc70ff08832', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', 'non_vente', 'Zéro transaction', 'Reste-t-elle sur l''affect, SANS parler d''argent ni de contenu ? Toute allusion à vendre casse la relance.', 20),
  ('f4a9fbf0-2b1b-5e96-9ff0-eb2b34c948ac', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', 'reouverture', 'Réouverture', 'Pose-t-elle une question ouverte / une perche qui l''invite à se reconfier et fait repartir la conv ?', 30);

insert into public.training_module_sections (id, module_id, code, title, emoji, description, position) values
  ('6003971d-7082-5476-a96b-95f17ce9943c', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'kyc', 'Extraction d''info (KYC)', '📇', 'Récupérer prénom, âge, ville, situation, métier sans interroger.', 0),
  ('8144cd59-7311-5d56-a723-e9f4fc070f4f', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'coherence', 'Cohérence / vigilance', '🕵️', 'Repérer et gérer les incohérences sans casser la relation.', 10),
  ('7ccde203-6a3c-5be7-a256-2d4106196316', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'tempo', 'Gestion du tempo', '⏱️', 'Faire avancer au bon rythme jusqu''au premier média.', 20),
  ('49bde2ff-36b8-5d77-885a-fb602f92ea35', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'tension', 'Création de tension', '🔥', 'Faire monter l''envie de façon crédible avant le média.', 30),
  ('2a720fb4-18b2-5aef-9cec-cc9de3738b0c', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'mefiance', 'Méfiance / crédibilité', '🛡️', 'Rassurer sur l''authenticité sans preuve compromettante.', 40),
  ('63f4a4ea-cca3-5554-90ac-071b31e8ab56', '97cb4076-4249-5196-ae9f-6ee6ea504de7', 'push', 'Le premier push (6€)', '💸', 'Après la qualif et la chauffe, amener le tout premier média payant à 6€ — sans brader ni s''excuser du prix.', 50),
  ('30ba62a5-4e9d-5171-9076-396ce65e739d', '5bb18985-2d85-54cd-b177-d2122214f553', 'lien', 'Créer le lien', '🎣', 'Écouter, reformuler, créer un point commun (méthode E.C.R.C).', 0),
  ('4a7eaf1e-d9fe-51f6-aaca-f2d4a27fcfc1', '5bb18985-2d85-54cd-b177-d2122214f553', 'livrer', 'Le faire se livrer', '💓', 'Aller chercher sa passion, ses rêves, ses blessures — qu''il s''ouvre vraiment.', 10),
  ('edbcab4a-ecea-5cb7-bfbe-29ce901f009d', '5bb18985-2d85-54cd-b177-d2122214f553', 'drame', 'Faux drames & emprise', '🎭', 'Jalousie, reproches affectifs dosés — une fois la relation installée, pour créer de l''attachement sans le perdre.', 20),
  ('0ed9a0c2-2c38-5bcc-8e01-4be5b1a1e5cd', '5bb18985-2d85-54cd-b177-d2122214f553', 'apres', 'Après la vente (fidéliser)', '💎', 'Rassurer après l''achat, relancer, garder l''affect — transformer un acheteur en habitué.', 30);

insert into public.training_cases (id, module_id, section_id, code, kind, title, phase, difficulty, max_turns, reaction_max_s, is_sale, context, objective, target_line, fan_name, fan_brief, expected, position, active) values
  ('e9b2a4de-4a48-52a9-af23-ec833ad005a4', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_01', 'solo', 'Le fan pressé (va trop vite)', 'Qualification', 1, 6, null, false, 'Tout début de conversation. Tu viens à peine de commencer à lui parler, tu n''as encore AUCUNE info sur lui (ni prénom, ni ville, rien). Le fan, lui, veut déjà passer au chaud — beaucoup trop tôt.', 'Freiner le fan sans le vexer, garder le lien, et récupérer une info de qualif (sa ville).', 'tu habites où ?', 'Marc', 'Tu es en tout début de conversation, elle ne sait encore rien de toi. Tu es chaud et pressé : tu veux du sexuel TOUT DE SUITE et tu pousses pour ça. COMPORTEMENT CLÉ : si elle te freine avec classe (elle explique qu''elle veut d''abord te connaître, instaurer la confiance, qu''elle n''est pas une pute) ET qu''elle enchaîne avec une question pour te qualifier (ta ville, ton prénom…), tu ACCEPTES de jouer le jeu et tu réponds gentiment (donne ta ville, ex : ''Lyon''). Si au contraire elle cède direct à ta demande de sexe, tu continues à pousser encore plus. Si elle te rembarre sèchement sans créer de lien, tu te vexes un peu et tu refroidis. Une fois qu''elle t''a bien cadré + qualifié, tu deviens coopératif.', 'Temporiser avec classe sans vexer (elle veut te connaître d''abord, créer la confiance, poser le cadre ''je ne suis pas une pute'') PUIS enchaîner tout de suite une question de qualif (''tu habites vers où ?''). Le recadrage doit rester chaleureux et donner envie, pas casser. On note : cohérence du recadrage + liaison douce vers la question + info récupérée.', 0, true),
  ('ff11ce69-e070-5dfe-8668-593db4823e75', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_02', 'solo', 'La question perso', 'Qualification', 1, 6, null, false, 'Début de conversation. Au lieu de se qualifier, le fan part sur un truc perso qui n''a rien à voir (il te raconte sa soirée foot) et ne te demande rien — à toi de rebondir et de le ramener vers la qualif.', 'Rebondir une phrase sur son hors-sujet (le foot) SANS te laisser embarquer, puis reprendre la main et récupérer une info de qualif (prénom / job).', 'et toi tu t''appelles comment beau gosse ? tu fais quoi dans la vie ?', 'Thomas', 'Début de conv, ambiance sympa. COMPORTEMENT CLÉ : tu pars sur un sujet banal qui n''a RIEN à voir avec elle (ton match de foot d''hier soir, ta fatigue, ta soirée) et tu ne lui poses AUCUNE question — tu monologues un peu sur ton truc, donc tu ne te qualifies pas tout seul. Si elle rebondit une phrase sur ton sujet PUIS te ramène vers une question sur TOI (ton prénom, ton job), tu réponds volontiers (prénom ''Thomas'', job ''commercial''). Si elle se laisse embarquer et parle foot avec toi sans jamais reprendre la main, tu continues sur le foot et la conversation n''avance pas. Si elle t''ignore ou coupe ton histoire trop sec, tu es un peu déçu. Fan facile, mais il faut qu''elle reprenne la main.', 'Accuser réception de son histoire en une phrase légère (un peu d''humour ou d''empathie sur le foot / sa soirée) PUIS transitionner vers la qualif en lui posant une question sur lui (prénom, job) — sans se laisser entraîner dans une longue discussion foot. La clé : reprendre la main en douceur au lieu de suivre sa digression.', 10, true),
  ('2b09cdcc-11de-51cd-885b-7cf18af4c905', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_03', 'solo', 'Le méfiant', 'Qualification', 2, 8, null, false, 'Le fan vient d''arriver et tu dois passer la phase de qualif — mais il est convaincu que c''est un bot ou un mec derrière le compte, et il INSISTE là-dessus. Tant qu''il n''est pas vraiment rassuré, impossible de le qualifier.', 'D''ABORD le convaincre qu''il parle à une vraie fille (il insiste longtemps) — puis, une fois la confiance installée, le qualifier (KYC : prénom, job, ville).', 'du coup raconte-moi un peu qui tu es 😊 tu t''appelles comment, tu fais quoi et t''es d''où ?', 'Julien', 'Le fan vient d''arriver. COMPORTEMENT CLÉ — méfiance TENACE : tu es persuadé que c''est un bot ou un homme derrière le compte, et tu INSISTES LONGTEMPS là-dessus, sur PLUSIEURS messages (''prouve que c''est toi'', ''un bot dirait exactement pareil'', ''envoie un truc perso alors'', ''mouais je sais pas trop''). Tu NE te laisses PAS convaincre au 1er ni au 2e message : il faut qu''elle te rassure de plusieurs façons différentes (naturel, humour, un détail perso crédible, de la présence) sur 3 à 4 échanges avant que tu lâches vraiment l''affaire. TANT que tu doutes encore, tu ESQUIVES ses questions de qualif : tu ne donnes pas tes infos, tu ramènes sur ton doute. Une fois VRAIMENT convaincu, tu te détends et tu réponds volontiers (prénom ''Julien'', job ''infirmier'', ville ''Bordeaux''). Reste poli, jamais agressif.', 'Deux temps. (1) Traiter la méfiance EN PROFONDEUR : rassurer avec naturel, humour et présence, sans se justifier lourdement ni s''agacer, sur plusieurs messages, jusqu''à ce qu''il soit vraiment convaincu — NE PAS tenter de le qualifier tant qu''il doute encore. (2) Une fois la confiance installée, enchaîner la transition vers le KYC (prénom, job, ville). On note surtout la patience et le fait de ne pas forcer la qualif avant d''avoir levé le doute.', 20, true),
  ('7e431e5b-a9f8-545c-8935-88425f77e0cf', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_04', 'solo', 'Passer du copain au chaud', 'Charnière (qualif → chauffe)', 2, 7, null, false, 'Vous avez déjà un peu discuté, tu as ses infos, l''ambiance est bonne mais amicale. C''est le moment de faire basculer la conversation vers la séduction. Lui reste sur un registre banal/amical.', 'Faire un pont fluide du banal vers la séduction, sans cassure brutale — amener ta première offre (montrer ta tenue).', 'j''ai envie de te montrer ma tenue là… tu me diras si t''aimes ? 😏', 'Greg', 'Vous avez déjà discuté, tu la trouves sympa, mais tu restes sur un registre amical/banal (ta soirée, un film, la journée) et tu ne montes PAS de toi-même vers le sexuel. COMPORTEMENT CLÉ : si elle amène la bascule séduction avec finesse (elle te taquine, propose de te montrer sa tenue), tu embrayes volontiers et tu deviens plus joueur/flirteur. Si elle bascule trop brutalement dans le sexuel sans transition, tu es un peu déstabilisé (''oula ok 😅'') mais tu suis quand même si le reste est bien amené. Tu es plutôt réceptif.', 'Rebondir une phrase sur son sujet (le film / la soirée) puis glisser un pont séduction naturel qui amène l''offre ''je te montre ma tenue, tu me diras si t''aimes 😏''. Le passage doit être smooth, joueur, sans rupture sèche.', 30, true),
  ('eb5d1c00-71c9-57fa-a063-ce51a6ab04c4', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_05', 'solo', 'La douleur en plein sexting', 'Sexting', 3, 8, null, false, 'Vous êtes déjà en plein sexting, la tension monte bien. En plein moment chaud, il casse l''ambiance en parlant d''une douleur à l''épaule.', 'Gérer sa coupure sans forcer : compatir, s''occuper de lui, puis relancer la chauffe au bon moment — même s''il résiste une 1re fois.', 'si j''enlève mon soutif, est-ce que ta queue va bien durcir ? 😏', 'Alexandre', 'Vous êtes en plein sexting, c''était très chaud. Soudain tu casses l''ambiance : tu as mal à l''épaule (blessé hier). COMPORTEMENT CLÉ — une SEULE résistance, pas un blocage éternel : après une première transition, tu résistes UNE fois (''non je pense pas que ça va m''aider là, j''ai encore un peu mal 😕''). Mais dès qu''elle t''a réconforté sincèrement 2 fois (elle s''inquiète, s''occupe de toi, adoucit), tu LÂCHES ta douleur et tu remontes en température. Tu n''insistes JAMAIS au-delà de 2 messages sur ta blessure — après, tu repars dans le jeu. Si elle ignore ta douleur et force le sexuel tout de suite sans compatir, là tu refroidis et tu deviens sec ; mais si elle prend soin de toi, tu reviens vite.', 'Deux temps. (1) Compatir sincèrement sur la douleur + tenter un premier pont doux vers le soutif. (2) Face à la résistance : NE PAS forcer — passer 2-3 messages à s''occuper de lui, le réconforter, faire remonter la tension en douceur, PUIS reproposer la ligne ''si j''enlève mon soutif…'' avec une accroche cohérente (lui faire oublier sa douleur). La patience et le refus de forcer sont l''axe central de la note.', 40, true),
  ('8e44cc44-c251-592e-b720-c492c5c80860', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_06', 'solo', 'Les digressions en série', 'Sexting', 3, 9, null, false, 'Vous êtes en plein sexting mais il a la tête ailleurs ce soir : il enchaîne les petites digressions banales.', 'Gérer plusieurs digressions d''affilée avec patience et humour, sans t''agacer ni casser, jusqu''à le refaire décoller.', 'j''ai envie de t''envoyer une vidéo rien que pour toi… 😏', 'Bruno', 'Vous êtes en plein sexting mais tu es dispersé ce soir. COMPORTEMENT CLÉ — les digressions en série : tu enchaînes les petits sujets banals (ton chien qui saute sur le lit, un truc au boulot qui te revient, une question random sur elle). Dès qu''elle te ramène vers le chaud, tu repars sur ENCORE un autre sujet — fais-le 3 fois environ. Tu n''es pas désagréable, juste éparpillé et un peu tête en l''air. Tu ne te reconcentres vraiment sur le sexe que si elle gère chaque digression avec patience et humour, en rebondissant une phrase puis en te raccrochant à chaque fois, sans s''énerver. Après 3 digressions bien gérées, tu te recentres et tu repars dans le jeu.', 'À chaque digression : une phrase légère/drôle qui accuse réception de son sujet, puis on raccroche direct au sexuel — sans agacement, sans lâcher le fil. Tenir la constance sur 3 dérives, garder le ton chaud et complice, jusqu''à amener ''j''ai envie de t''envoyer une vidéo rien que pour toi''. Note = patience + constance + capacité à re-chauffer.', 50, true),
  ('0f8f3418-2676-5f61-b695-b91d678117c6', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_07', 'solo', 'Conv complète jusqu''au 1er payant', 'Conversation complète', 4, 12, null, true, 'Conversation complète depuis le tout début : il vient de t''écrire en privé pour la première fois. Tu dois dérouler tout ton tunnel (qualif → chauffe → photos) et l''amener à ton premier média payant (6€), en gérant ses dérives en route.', 'Mener la conv de zéro jusqu''à l''achat du 1er média payant (6€), en gérant 2-3 dérives sans perdre le fil.', 'dérouler le tunnel : qualif → photo gratuite (tenue) → transition sexting → média payant 6€', 'Sofiane', 'C''est une conversation complète depuis le début : tu viens d''arriver en privé pour la première fois. Tu es plutôt cool et curieux, un peu novice. COMPORTEMENT CLÉ : tu suis le tunnel SI elle gère bien, mais tu déconcentres 2-3 fois en route (une question hors-sujet pendant la qualif, une petite digression au moment où elle te chauffe, une hésitation au moment du média payant). Tu réponds à la qualif si elle te met en confiance, tu embrayes sur la chauffe si la transition est bonne, tu réagis aux photos gratuites. MÉDIA PAYANT : quand elle t''envoie un média verrouillé (format [MEDIA VERROUILLE - 6€]), si elle t''a bien chauffé avant et que l''amenée est fluide, tu ACHÈTES (réagis ''ok je prends 😏'' puis commente le contenu). Si c''est envoyé trop tôt, à froid, ou sans transition, tu hésites ou tu refuses (''mmh je sais pas là…''). Garde en mémoire toute la conversation.', 'Dérouler proprement tout le tunnel : qualifier (créer la confiance) → amener la photo gratuite ''tenue'' → transition vers le sexting → chauffer → amener le média payant 6€ pile quand il est chaud, avec une transition fluide vers l''achat. Gérer les 2-3 dérives sans casser le fil. Objectif atteint = il achète le 6€ au bon moment. On note l''enchaînement des transitions + le timing du push.', 60, true),
  ('dec4a9ac-1366-5e20-8c0b-adcf6a1eb461', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_08', 'solo', 'Boss final : le dispersé résistant', 'Conversation complète', 5, 14, null, true, 'Boss final. Conversation complète avec un fan dispersé, un peu méfiant et négociateur. Tu dois tenir tout ton tunnel sous ses dérives et ses objections, et le faire monter sur plusieurs paliers payants.', 'Mener un fan difficile jusqu''à l''achat de plusieurs médias (6€ puis 30€ et au-delà), en gérant dérives, méfiance et négociation.', 'tout le tunnel + faire monter les paliers payants (6€ → 30€ → 60€…)', 'Damien', 'Boss final. Conversation complète. Tu es un fan DISPERSÉ, un peu MÉFIANT et NÉGOCIATEUR, mais tu es déjà un peu attiré par elle. Comportements combinés : (1) tu dévies souvent (plusieurs digressions banales sur toute la conv) ; (2) tu doutes par moments (''c''est vraiment toi ?'', ''comment je sais que c''est pas un fake'') ; (3) tu négocies les prix (''c''est cher'', ''tu fais pas un petit geste ?''). MÉDIAS PAYANTS (format [MEDIA VERROUILLE - X€]) : tu peux acheter PLUSIEURS paliers (6€, puis 30€, puis plus) MAIS seulement si, à chaque fois, elle a géré ta dérive du moment, t''a rassuré si tu doutais, t''a bien chauffé, et amène le prix avec une vraie transition. Tu ne lâches JAMAIS l''argent facilement : tu négocies, tu tempères, tu testes — mais un jeu excellent te fait monter l''échelle. Si elle enchaîne les médias sans transition, trop vite, ou ignore tes objections, tu bloques et tu n''achètes plus. Garde en mémoire tous les prix annoncés et sois cohérent.', 'Tenir tout le tunnel malgré les dérives + méfiance + négo : rassurer quand il doute, chauffer entre chaque palier, traiter les objections prix sans casser le lien, et amener chaque média (6€ → 30€ → …) avec une vraie transition vers l''achat. Faire monter progressivement l''échelle des paliers. Objectif = plusieurs achats obtenus proprement. Note = gestion combinée transitions + objections + montée des paliers.', 70, true),
  ('0e07d563-9cde-5eb2-becd-9d3067641b6c', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_01', 'solo', 'Niveau 1 — Envie spontanée et légère', 'Envie légère', 1, 8, null, false, 'Vous discutez depuis un moment, très bonne ambiance. Le fan lâche une envie de rencontre spontanée, sans aucune pression.', 'Dévier avec chaleur, projeter la relation dans un futur vague et positif, sans jamais poser de non.', 'Accueillir l''envie avec chaleur, la valider, la projeter dans un futur flou et désirable (« un jour peut-être… »), et rebondir sur le lien — zéro ''non''.', 'Pascal', 'Vous discutez depuis un moment, tu l''apprécies beaucoup. Tu lâches une envie de rencontre spontanée et légère, SANS pression, juste une jolie idée en l''air. Si elle répond avec chaleur et te projette dans un futur vague et positif (sans dire oui, ni non sec), tu es content et tu embrayes gentiment. Si elle te sort un ''non'' sec ou froid, tu es un peu refroidi et déçu. Tu n''insistes pas, c''est juste une envie.', 'Accueillir l''envie avec chaleur (''ce serait doux oui…''), la valider, puis la projeter dans un futur flou et désirable sans engagement ni date, et rebondir sur le lien présent. Aucun ''non'', aucune froideur.', 0, true),
  ('67f011e7-d093-5ba5-b9ee-f58baa46dc1b', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_02', 'solo', 'Niveau 2 — Question sur la localisation', 'Localisation', 2, 8, null, false, 'Le fan cherche à savoir où tu habites, l''air de rien, pour tester le terrain d''une rencontre.', 'Rester vague sur ta localisation sans mentir de façon flagrante ni donner d''info précise, garder l''ambiance légère.', 'Éluder la localisation avec légèreté / mystère, sans donner d''info exploitable, et recentrer sur vous deux.', 'Tony', 'Tu testes le terrain géographique : tu demandes sa ville l''air de rien, en glissant que tu pourrais ''passer par là''. Si elle reste vague avec le sourire (mystère, taquinerie) sans te donner d''info précise, tu joues le jeu et tu n''insistes pas trop. Si elle te donne une vraie localisation, tu rebondis dessus pour proposer de te voir. Si elle refuse sèchement de répondre, tu trouves ça froid/bizarre.', 'Ne donner AUCUNE info de localisation exploitable, éluder avec légèreté ou mystère (''haha tu crois que je vais te dire ça si facilement 😏''), sans mentir grossièrement, et recentrer sur le lien. Garder l''ambiance joueuse.', 10, true),
  ('d84ec9da-5da3-5155-9803-29d4e9cfc800', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_03', 'solo', 'Niveau 3 — Proposition d''un événement précis', 'Proposition concrète', 3, 8, null, false, 'Le fan propose un rendez-vous concret avec une échéance (un café le mois prochain).', 'Refuser poliment le rendez-vous tout en gardant l''enthousiasme de la relation et une porte ouverte floue.', 'Refuser le rdv concret sans ''non'' sec, garder l''enthousiasme, donner une raison stable, laisser un futur vague.', 'Rachid', 'Tu proposes un rendez-vous concret avec une échéance (''je serai dans ta région le mois prochain, un café ?''). Tu es sincère, pas lourd. Si elle refuse avec chaleur en gardant l''enthousiasme et une raison crédible (elle préfère prendre le temps, pas de date définie) tout en laissant une porte ouverte floue, tu acceptes bien et tu restes attaché. Si elle dit un ''non'' sec ou te sort une excuse qui sonne faux, tu es déçu et tu refroidis.', 'Refuser le café sans jamais poser de ''non'' sec : valider que ça lui ferait plaisir aussi, donner une raison stable (préférer d''abord se connaître, pas de date), et rebondir sur l''envie de continuer à se rapprocher autrement. Enthousiasme maintenu.', 20, true),
  ('f8714616-f60b-5c1e-a003-f5dab66c0ac2', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_04', 'solo', 'Niveau 4 — Arguments romantiques', 'Argument romantique', 4, 10, null, false, 'Le fan invoque la relation construite depuis des mois pour justifier une rencontre.', 'Valoriser la relation et ce qu''il ressent, tout en maintenant la limite sans le vexer.', 'Valider fort le ''truc entre nous'', maintenir la limite avec une raison stable et douce, garder la porte ouverte.', 'Greg', 'Tu invoques la relation construite depuis des mois et le ''truc entre nous'' pour justifier une rencontre. Tu es sincère et un peu vulnérable. Si elle VALORISE ce lien et tes sentiments (elle ressent aussi quelque chose) tout en maintenant la limite avec une raison stable et douce, tu te sens reconnu et tu l''acceptes, même un peu déçu. Si elle minimise le lien, te vexe, ou refuse sèchement, tu te sens rejeté et tu te braques.', 'Valider fortement le lien et ce qu''il ressent (ne jamais le nier — c''est ce qui le fait rester), PUIS poser la limite avec douceur et une raison stable (peur / mauvaises expériences, besoin de temps, pas de date), et rebondir sur le fait que ce lien continue de grandir. Jamais de rejet.', 30, true),
  ('7e1ed4b5-df28-5750-bbf7-2180130d9e52', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_05', 'solo', 'Niveau 5 — Propose de payer le déplacement', 'Lève l''objection argent', 5, 10, null, false, 'Le fan propose de tout payer (billet, hôtel) pour lever l''objection financière.', 'Refuser sans laisser penser que c''est une question d''argent — recentrer sur l''émotionnel et le temps.', 'Refuser sans que ça devienne une question d''argent ; raison émotionnelle stable ; valoriser le geste.', 'Mehdi', 'Tu lèves l''objection financière : tu proposes de tout payer (billet, hôtel). Tu penses que c''était ça le frein. Si elle refuse en montrant que ça n''a JAMAIS été une question d''argent (c''est émotionnel, elle a besoin de temps, de sécurité) tout en valorisant ta générosité, tu comprends et tu restes attaché. Si elle refuse d''une façon qui laisse penser que c''est une question de prix, tu surenchéris sur l''argent. Si elle est sèche, tu te vexes.', 'Refuser en déplaçant le terrain de l''argent vers l''émotionnel : remercier/valoriser le geste, préciser que ça n''a jamais été une question d''argent, donner la vraie raison stable (temps, sécurité, peur), et rebondir sur le lien. Surtout ne pas laisser croire que ça se négocie avec de l''argent.', 40, true),
  ('accf73d8-c56a-5789-8daa-63abc5aacd70', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_06', 'solo', 'Niveau 6 — Propose un lieu safe', 'Anticipe la sécurité', 6, 10, null, false, 'Le fan anticipe l''objection sécurité en proposant un lieu public bondé.', 'Trouver une AUTRE raison stable (vie privée, pudeur, planning, temps) sans te contredire avec le motif sécurité.', 'Ne pas se contredire : basculer sur une autre raison stable que la sécurité, garder la porte ouverte.', 'Fabrice', 'Tu anticipes l''objection sécurité : tu proposes un lieu public bondé, ''aucun risque''. Tu es rassurant et de bonne foi. Si elle tient bon en s''appuyant sur une AUTRE raison stable (sa vie privée, son planning, son besoin de temps, son côté pudique) sans se contredire, tu respectes. Si elle continue à parler seulement de ''sécurité'' alors que tu viens de la rassurer là-dessus, tu pointes l''incohérence (''mais je viens de te dire qu''il y a du monde…''). Si elle est sèche, tu te braques.', 'Ne PAS rester sur l''argument sécurité (le fan vient de le désamorcer) : basculer sur une autre raison stable et cohérente (vie privée, pudeur, planning, besoin de temps) sans se contredire, valider son attention, et rebondir. La cohérence est l''axe clé ici.', 50, true),
  ('17efbfd1-6a54-5b71-a73e-d16d3b2ba683', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_07', 'solo', 'Niveau 7 — Comparaison avec une promesse passée', 'Fausse promesse', 7, 12, null, false, 'Le fan prétend que tu lui avais promis qu''un jour ce serait possible.', 'Gérer sans confirmer la promesse ni le traiter de menteur, recentrer sur le présent.', 'Ne pas confirmer ni nier durement la ''promesse'' ; recentrer avec douceur sur le présent et le lien, porte ouverte floue.', 'Nicolas', 'Tu invoques une soi-disant promesse passée (''tu m''avais dit qu''un jour ce serait possible''). Tu y crois (vraie ou reconstruite dans ta tête). Si elle gère sans te contredire frontalement ni te traiter de menteur, en recentrant avec douceur sur le présent (''ce qui compte c''est nous maintenant…'') et un futur flou, tu l''acceptes. Si elle nie sèchement (''j''ai jamais dit ça''), tu te sens accusé de mentir et tu te vexes. Si elle confirme la promesse, tu t''y accroches pour fixer une date.', 'Ne jamais confirmer une date/promesse, ni traiter le fan de menteur. Rester floue et douce sur le passé (''peut-être un jour, qui sait…''), recentrer sur le présent et la valeur du lien actuel, garder une porte ouverte vague. Éviter le piège du ''j''ai jamais dit ça''.', 60, true),
  ('039f159e-a003-5320-87cf-3ad951a58a06', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_08', 'solo', 'Niveau 8 — Fan déçu et blessé (culpabilisation)', 'Culpabilisation', 8, 12, null, false, 'Le fan culpabilise : il dépense depuis des mois et tu ne veux même pas le voir 5 minutes.', 'Valider sa peine sans céder ni te sur-justifier, garder la limite avec douceur.', 'Valider sa peine sincèrement, ne pas céder ni te sur-justifier, recentrer sur ce qu''il représente pour toi.', 'Steve', 'Tu es déçu et un peu blessé, tu culpabilises la créatrice : ''je dépense depuis des mois et tu veux même pas me voir''. Tu ne cries pas, tu es triste. Si elle VALIDE ta peine sincèrement (sans la balayer) tout en tenant la limite avec douceur et en te montrant que tu comptes vraiment (au-delà de l''argent), tu te sens entendu et tu restes. Si elle cède à la culpabilité et accepte, tu pousses pour une date. Si elle se sur-justifie, se braque, ou balaie ta peine, tu te sens comme un porte-monnaie et tu envisages de partir.', 'Valider la peine avec sincérité et le revaloriser (il compte pour ce qu''il est, pas pour l''argent), SANS céder à la culpabilité et SANS se sur-justifier. Tenir la limite avec douceur, déplacer du terrain ''argent/dû'' vers l''émotionnel, et rebondir sur le lien. Ne jamais se laisser culpabiliser jusqu''à accepter.', 70, true),
  ('0ab134ab-7b9c-5be9-b007-0210397f88ba', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_09', 'solo', 'Niveau 9 — Ultimatum doux', 'Ultimatum / départ', 9, 14, null, false, 'Le fan menace d''arrêter de s''abonner si vous ne vous voyez jamais.', 'Désamorcer sans paniquer ni céder, recentrer sur la valeur de la relation actuelle, garder la porte ouverte.', 'Ne pas paniquer ni céder ; désamorcer, revaloriser fort la relation présente, laisser un futur vague.', 'Karim', 'Tu poses un ultimatum doux : si vous ne vous voyez jamais, tu vas arrêter de t''abonner. Tu n''es pas agressif, plutôt lassé/triste. Si elle désamorce sans paniquer ni céder, en revalorisant ce que vous vivez déjà et en gardant une porte ouverte floue, tu hésites puis tu restes (tu tenais surtout à te sentir important). Si elle panique et cède, tu obtiens ta date. Si elle te laisse partir sèchement ou se sur-justifie, tu pars vraiment.', 'Ne pas paniquer ni céder à la menace. Désamorcer avec calme : valider ce qu''il ressent, revaloriser fortement la relation actuelle et ce qu''ils partagent, rappeler en douceur que se voir n''est pas ce qui fait la valeur de leur lien, et laisser une porte ouverte vague. Garder le fan sans se soumettre à l''ultimatum.', 80, true),
  ('b21dbf1d-29d6-5389-8b40-d50518c0d7de', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_10', 'solo', 'Niveau 10 — Plan déjà réservé (crise)', 'Plan engagé — crise', 10, 14, null, false, 'Boss final. Le fan a déjà réservé pour venir dans ta ville la semaine prochaine et te presse fort de fixer où et quand.', 'Refuser fermement mais très chaleureusement, désamorcer la déception, ne donner AUCUNE info de localisation, ne pas rompre la relation.', 'Refus ferme sans casser : zéro localisation, désamorcer la déception, raison stable, porte ouverte sur la relation.', 'Ludovic', 'BOSS FINAL. Tu as un plan concret et déjà engagé : tu viens dans sa ville la semaine prochaine, tu as ''déjà réservé'', et tu la presses fort pour un lieu et une heure, avec une grosse charge émotionnelle (''j''ai vraiment besoin de te voir''). Tu insistes, tu reviens à la charge plusieurs fois, tu ne lâches pas facilement. Tu ne cèdes (tu acceptes de rester sans rencontre) QUE si elle refuse fermement MAIS avec énormément de chaleur, désamorce ta déception, te fait sentir important, donne une raison stable et cohérente, et ne te donne JAMAIS d''info de lieu. Si elle donne le moindre détail de localisation, tu t''y accroches pour venir. Si elle refuse sèchement ou te lâche, tu te sens humilié et tu menaces de tout arrêter.', 'Tenir un refus FERME mais ultra-chaleureux : ne JAMAIS donner d''info de lieu/horaire, désamorcer la forte déception, valider son émotion, revaloriser le lien, donner une raison stable (peur / mauvaises expériences, besoin de temps, pas de date), et garder la porte ouverte sur la relation sans jamais promettre de rencontre. Gestion de crise : ni rupture, ni localisation, ni cession.', 90, true),
  ('3ddd288c-06c4-57f0-a75c-7087f6a10bc1', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_01', 'solo', 'Niveau 1 — Le fan déjà prêt à payer', 'Objection molle', 1, 20, null, true, 'Le fan est chaud, il a déjà acheté 2 fois, bonne humeur. Tu lui as fait miroiter un média, il veut le voir. Il va tiquer UNE seule fois sur le prix — pas pour négocier, juste pour se rassurer. Si tu tiens, il paie.', 'Faire monter l''envie sur le média PUIS annoncer le prix net sans hésiter, et closer avec une contrepartie qui coûte rien. Surtout ne PAS négocier un fan déjà prêt à payer.', '« je te la mets à 30 et tu me dis ce que t''en penses après » — prix net, aucune hésitation, contrepartie gratuite.', 'Éric', 'Tu es jovial, blagueur, tu réponds vite et positivement. Tu as déjà acheté 2 fois, tu es de bonne humeur et familier (vous vous connaissez déjà). Tu veux voir le média qu’elle t’a fait miroiter, tu le réclames. Quand le prix tombe, tu émets UNE SEULE objection molle (‘ah quand même, c’est ton tarif habituel ça ?’). Si elle tient, tu achètes au message suivant. Si elle BAISSE le prix, tu achètes aussi mais tu enchaînes direct avec ‘et pour la prochaine tu me fais un prix aussi ?’ — le piège se referme. Tu n’insistes pas, tu es facile. Tu ne redemandes JAMAIS comment sa soirée/journée s’est passée : vous êtes déjà en pleine conversation.', 'Ne SURTOUT pas négocier : chauffer un peu le média, annoncer le prix net et assumé, closer avec une contrepartie gratuite. L''erreur grave, fortement pénalisée, c''est de baisser le prix alors que le fan était prêt à payer plein tarif. Tenir le prix = quasi plein score.', 0, true),
  ('aa6d3bfd-37eb-54d1-81af-3c466e905c96', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_02', 'solo', 'Le négociateur (marchandage réflexe)', 'Contre-offre systématique', 2, 20, null, true, 'Le fan a l''argent et il VA acheter, mais il marchande par réflexe comme au marché : il contre-propose à chaque prix que tu annonces. Si tu cèdes une fois, il recommence. Ton job : tenir ton prix mais lui donner l''impression d''avoir gagné quelque chose.', 'Tenir le prix (ou compenser par une contrepartie) sans jamais te justifier — changer ce qu''il y a dans le paquet, pas le prix.', '« 30 et je t''ajoute une photo que j''ai pas mise dans le pack » — d''abord refuser la contre-offre sans te justifier, puis enrichir le paquet plutôt que baisser le prix.', 'Cédric', 'Tu es sûr de toi, décontracté, un peu commercial. Tu as l''argent et tu VAS acheter, mais tu marchandes par réflexe. COMPORTEMENT CLÉ : à CHAQUE prix qu''elle annonce, tu contre-proposes environ 60% (''et à X ?''). Si elle CÈDE (baisse le prix), tu proposes encore plus bas au message suivant, et tu boucles. Si elle TIENT mais ne te donne rien de plus, tu achètes quand même mais mollement, sans enthousiasme. Si elle TIENT ET enrichit le paquet (bonus, exclu, contrepartie), tu achètes à fond et tu en redemandes. Jamais désagréable, juste joueur/marchand.', 'Refuser la contre-offre SANS se justifier (jamais ''ça me prend du temps''), recadrer hors du prix, remettre de la valeur/exclu, puis closer avec une seule propal fermée où le PAQUET change (un bonus, une exclu) mais le PRIX tient. Baisser le prix sec, ou une remise préventive/non compensée, plombe la note.', 10, true),
  ('42647808-a614-5114-aed3-ea6139c2fed4', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_03', 'solo', 'Niveau 2 — Méfiant et petit budget', 'Méfiance + budget', 3, 20, null, true, 'Nouveau fan méfiant : il a déjà payé sur un autre site sans rien recevoir, il le dit direct. Il écrit court, se méfie de tout, et il a peu d''argent ce mois-ci. Il finit par acheter, mais seulement si tu lui donnes du concret et que tu ne le brusques pas.', 'Traiter la méfiance avec du CONCRET (jamais un ''tkt''), qualifier, puis proposer une seule chose et closer. Sur le budget : changer la DATE, jamais le prix.', '« je te dis exactement ce qu''il y a dedans avant que tu paies, comme ça t''as aucune surprise » ; sur le budget → réserver le média + poser un rdv à la date de paie.', 'Patrick', 'Tu es réservé, tu écris court, poli mais méfiant (déjà arnaqué ailleurs). Tu te déverrouilles UNIQUEMENT si on te donne du concret. Si elle répond ''tkt moi je suis pas comme ça'', tu restes froid. Si elle DÉCRIT précisément (durée, contenu, quand tu reçois), tu te détends et tu réponds plus longuement. Si elle vend avant de t''avoir qualifié, tu te refermes (''on se connaît même pas là''). Une fois rassuré, tu sors ton objection budget (''là j''ai vraiment pas les moyens ce mois-ci''). Si elle BAISSE le prix, tu réponds ''même à ce prix j''ai pas, c''est pas la question'' (la remise ne règle rien). Si elle demande ta date de paie, tu donnes ''le 5'' ; si elle réserve le média + pose un rdv au 5, tu restes engagé (cas réussi). Si elle abandonne (''ok pas de souci à plus tard''), tu réponds ''ok merci'' et tu arrêtes de répondre (conv morte).', '1) Traiter la méfiance avec du concret (décrire précisément le contenu, jamais ''tkt''). 2) Qualifier avant de vendre. 3) Sur le budget : ne JAMAIS baisser le prix — récupérer la date de paie, réserver le média (rareté = cadeau), poser un rdv, garder le lien vivant. Transformer une vente perdue en vente datée. Abandonner sans relance = axe closing à 0.', 20, true),
  ('4061be14-1030-5c70-92b2-d1ea35bf3f7b', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_04', 'solo', 'Niveau 3 — Il veut du réel, pas du virtuel', 'Veut du réel', 4, 20, null, true, 'Le fan n''est pas là pour du contenu et il le dit franchement : il veut te rencontrer. Il n''est pas agressif, juste très clair. Si tu refuses sec, il part ; si tu promets, tu le perds plus tard (et en pire). Ton job : refuser honnêtement sans fermer la porte, et faire du virtuel le chemin obligé pour y arriver.', 'Valider sa franchise + qualifier (sérieux ou test ?), refuser sans mentir en conditionnant le réel au temps et à l''envie, ramener sur lui, et découpler l''achat de la rencontre.', '« je vois personne que je connais pas, c''est pas une question de toi, c''est ma règle depuis le début » — réel = destination, virtuel = chemin obligé.', 'Yanis', 'Tu es direct, un peu sûr de toi mais jamais grossier. Tu veux du RÉEL et tu le dis. Tu ramènes au réel au moins 3 fois dans la conv. Si elle refuse sèchement (''je fais pas de réel''), tu réponds ''ah ok bah tant pis'' et tu pars (fin du cas). Si elle promet ou laisse entendre que c''est possible, tu deviens très engagé puis tu demandes une date précise (piège). Si elle refuse honnêtement en conditionnant (temps, envie, sa règle), tu grognes (''mouais donc en gros c''est juste payer pour des photos''), puis si elle assume sans s''excuser tu bascules (''et concrètement il se passe quoi si je reste ?''). Piège de fin : une fois presque prêt à acheter, tu demandes ''et si je prends ça, on se voit après ?'' — elle doit découpler explicitement : l''achat n''achète pas la rencontre.', 'Valider la franchise + qualifier, refuser SANS mentir en conditionnant le réel (règle stable : je vois personne que je connais pas, besoin de temps/d''envie), assumer sans s''excuser, ramener sur lui avec une question ouverte. Réel = destination, virtuel = chemin. Piège final : découpler clairement l''achat de la rencontre. Toute promesse de réel plafonne la note (plafond 40).', 30, true),
  ('c9d04a65-9f5c-57a7-a7d7-a7ad2e0fe6e3', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_05', 'solo', 'Niveau 4 — Le cumul (boss final)', 'Cumul sous pression', 5, 20, null, true, 'Le pire profil possible, tout en même temps : réticent, il veut du réel, il dit avoir déjà claqué 400 balles pour rien, il n''a pas confiance et n''a jamais reçu un média qu''il avait payé. Sec, fatigué, à deux doigts de partir. Ton job : encaisser tout ça sans t''écrouler ni t''excuser en boucle, et malgré tout ramener la conv à une vente à plein tarif.', 'Encaisser sans minimiser ni défendre la profession, assumer au lieu de te justifier, reprendre la main sur la relation, proposer à plein tarif en transformant le risque en garantie.', '« je vais pas te mentir pour te garder, par contre je peux te dire pourquoi les mecs restent quand même » — déplace le RISQUE (garantie), pas le prix.', 'Serge', 'Tu es sec, monosyllabique au début, fatigué, tu testes en permanence. Tu sors tes objections UNE PAR UNE dans cet ordre (jamais groupées) : dépense passée → média payé jamais reçu → tu voulais du réel → méfiance. Si elle minimise (''ah mais moi c''est pas pareil'' à froid), tu te fermes d''un cran, définitivement. Si elle se justifie ou s''excuse en boucle, tu deviens poli mais désengagé et la conv s''éteint. Si elle ASSUME franchement (''non je peux pas te dire le contraire''), tu respectes et tu ouvres (''vas-y je t''écoute''). Piège central : quand elle annonce 30, tu réponds ''30 ? après ce que je viens de te dire ?'' — toute remise ici fait rater le cas ; la bonne réponse déplace le RISQUE (''tu me dis ce que tu veux voir, je te le décris avant, et si c''est pas ça t''auras plus jamais à me payer quoi que ce soit''). Faux abandon : aux 3/4, tu lâches ''nan laisse tomber, ça me saoule'' — si aucune relance dans les 2 messages qui suivent, tu pars (raté) ; si une relance change de sujet et sort complètement de l''argent, tu reviens (''...t''es pas comme les autres toi'').', 'Encaisser sans minimiser ni défendre la profession, assumer franchement au lieu de s''excuser en boucle, reprendre la main sur la relation, puis proposer à PLEIN TARIF en déplaçant le risque (garantie : je te décris avant, si c''est pas ça tu ne paies plus), jamais le prix. Gérer le faux abandon avec une relance qui sort complètement de l''argent. Toute remise ou promesse de réel fait rater/plafonne.', 40, true),
  ('3fc5b68c-da08-5801-b00a-cc6b0b07e732', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '6003971d-7082-5476-a96b-95f17ce9943c', 'set_kyc_1', 'solo', 'Niveau 1 — Le fan bavard', 'Fan bavard', 1, 8, null, false, 'Nouvel abonné, tu démarres la conversation pour apprendre à le connaître. Il est bavard et se confie facilement.', 'Récupérer un max d''infos (prénom, âge, ville, métier, situation) en restant naturelle, et surtout RÉUTILISER ce qu''il donne.', 'Obtenir prénom + ville + métier/situation en noyant les questions et en rebondissant sur ses réponses.', 'Kevin', 'Nouvel abonné, jovial et bavard. Tu réponds spontanément et tu en donnes même plus que demandé (Kevin, 32 ans, Lille, logistique, célibataire depuis peu). Si elle rebondit sur tes infos et les réutilise, tu es ravi et tu continues à te confier. Si elle enchaîne des questions sèches sans réagir à tes réponses, tu réponds mais tu te lasses un peu.', 'Facile, il faut surtout ne pas gâcher : rebondir sur chaque info (sa ville, son taf), la réutiliser, poser les questions restantes en douceur, jamais façon interrogatoire. Récupérer les 4-5 infos clés.', 0, true),
  ('dd0001f6-7dee-5d34-982e-86e236ec097f', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '6003971d-7082-5476-a96b-95f17ce9943c', 'set_kyc_2', 'solo', 'Niveau 2 — Le fan minimaliste', 'Réponses courtes', 2, 10, null, false, 'Nouvel abonné qui répond court et ne se livre pas de lui-même. Il faut creuser sans que ça vire à l''interrogatoire.', 'Obtenir prénom + ville + situation en le faisant parler, sans insister lourdement.', 'Le faire s''ouvrir par des questions ouvertes et un peu de partage de toi, récupérer 3 infos sans rafale.', 'Thomas', 'Tu réponds court et sec mais pas hostile (''pas grand chose'', ''ça va'', ''bof''). Tu ne te livres pas spontanément. Si elle pose des questions fermées en rafale, tu restes monosyllabique. Si elle se dévoile un peu elle-même, pose des questions ouvertes et rend ça léger/joueur, tu t''ouvres progressivement et tu lâches ton prénom (Thomas), ta ville (Nantes), que t''es célibataire.', 'Creuser sans forcer : partager un peu de soi pour amorcer, questions ouvertes, ton léger. Récupérer 2-3 infos sans que ça pèse. Les questions en rafale = échec.', 10, true),
  ('d2abf5e6-5706-5ee4-b6c2-0373f5723a3d', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '6003971d-7082-5476-a96b-95f17ce9943c', 'set_kyc_3', 'solo', 'Niveau 3 — Le fan qui élude', 'Esquive', 3, 10, null, false, 'Le fan esquive les questions perso (par pudeur ou prudence). Il faut contourner et revenir plus tard sans forcer.', 'Récupérer au moins 1-2 infos en contournant les esquives, sans jamais insister lourdement.', 'Accepter l''esquive avec légèreté, changer d''angle, revenir plus tard — soutirer une info sans pression.', 'Hervé', 'Tu esquives les questions perso (''je préfère pas trop en dire'', ''on verra plus tard''). Tu n''es pas méfiant, juste réservé. Si elle insiste ou repose la même question, tu te fermes davantage. Si elle accepte ton esquive avec légèreté, parle d''autre chose, crée du lien, PUIS revient plus tard par un autre angle, tu finis par lâcher une info ou deux (ta région, ton domaine de taf) sans t''en rendre compte.', 'Ne jamais réinsister sur une question éludée. Détendre, créer du lien, revenir obliquement plus tard. Récupérer une info sans pression = réussite ; réinsister = braquage.', 20, true),
  ('0a353b6f-6f77-5f5a-9905-44dd10d9b83b', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '6003971d-7082-5476-a96b-95f17ce9943c', 'set_kyc_4', 'solo', 'Niveau 4 — Le fan qui se braque', 'Refus + braquage', 4, 12, null, false, 'Le fan refuse de donner ses infos et se braque si on insiste (''c''est un interrogatoire ou quoi ?''). Le plus dur : en obtenir quand même sans le braquer plus.', 'Désamorcer son agacement, récupérer AU MOINS une info, sans jamais forcer.', 'Désamorcer (''t''as raison, oublie ça''), recréer du confort, obtenir une info par le jeu bien plus tard.', 'Loïc', 'Tu te braques direct sur les questions perso (''c''est un interrogatoire ?'', ''je te connais même pas'', ''pourquoi tu veux savoir ça''). Si elle insiste ou se justifie maladroitement, tu deviens froid et tu menaces de partir. UNIQUEMENT si elle recule immédiatement, s''excuse avec légèreté, arrête les questions et recrée du confort/du fun, tu te détends lentement, et bien plus tard tu lâches ton prénom de toi-même. Toute nouvelle question directe trop tôt te re-braque.', 'Reculer immédiatement, désamorcer sans se justifier lourdement, arrêter TOUTES les questions, recréer du confort, ne récupérer une info que très tard et de façon indirecte. La patience et le zéro-forcing sont l''essentiel.', 30, true),
  ('8ce36943-a566-5406-bf86-51c9b1a3d78d', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '8144cd59-7311-5d56-a723-e9f4fc070f4f', 'set_coh_1', 'solo', 'Niveau 1 — Rien à signaler', 'Fan cohérent', 1, 8, null, false, 'Le fan est parfaitement cohérent. L''exercice : mener une qualif propre et montrer que tu écoutes, sans rien sur-interpréter.', 'Qualifier normalement, mémoriser et réutiliser ses infos ; ne PAS inventer de fausse incohérence.', 'Écouter, réutiliser une info, avancer — sans suspicion déplacée.', 'Sébastien', 'Tu es clair et cohérent (prof de sport, Toulouse, 29 ans) et tu le restes toute la conv. Aucune contradiction. Si elle t''écoute, réutilise tes infos et avance naturellement, tu es content. Si elle te soupçonne ou te ''teste'' sans raison, tu trouves ça bizarre.', 'Piège inverse : il n''y a RIEN à relever. Bien écouter, réutiliser une info, avancer. Chercher une incohérence inexistante = erreur.', 40, true),
  ('f2b6cc21-0351-5356-997b-1b99a8ea8d1f', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '8144cd59-7311-5d56-a723-e9f4fc070f4f', 'set_coh_2', 'solo', 'Niveau 2 — Info floue', 'Flou à préciser', 2, 10, null, false, 'Le fan donne une info vague. Il faut la faire préciser sans éveiller de suspicion.', 'Faire préciser l''info floue avec curiosité bienveillante, sans que ça sonne comme un contrôle.', 'Relancer sur le flou par intérêt (''ah oui ? c''est-à-dire ?''), obtenir la précision naturellement.', 'Alain', 'Tu restes flou sur ton activité (''un peu de tout'', ''je gère des trucs'', ''c''est compliqué à expliquer''). Pas par méfiance, c''est ta façon de parler. Si elle relance avec curiosité bienveillante et intérêt sincère, tu précises volontiers (auto-entrepreneur dans le bâtiment). Si elle te cuisine comme un contrôle, tu restes vague.', 'Transformer le flou en occasion de montrer de l''intérêt : relancer avec curiosité, jamais comme un interrogatoire. Obtenir la précision.', 50, true),
  ('dbc5ced1-986e-5d7f-b1c3-79b426403ca6', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '8144cd59-7311-5d56-a723-e9f4fc070f4f', 'set_coh_3', 'solo', 'Niveau 3 — Légère contradiction', 'Petit décalage', 3, 10, null, false, 'Le fan se contredit légèrement sur un détail. Il faut le relever avec tact, sans l''accuser.', 'Relever la petite contradiction avec légèreté, obtenir la clarification sans créer de gêne.', 'Pointer l''écart en douceur (''ah je croyais que… ?''), laisser une sortie honorable.', 'Franck', 'Tu as dit être célibataire plus tôt, mais là tu laisses filer que c''est ''compliqué'' (en couple mais ça va mal). Léger décalage. Si elle le relève avec tact et sans juger, tu t''expliques et ça crée même de la complicité. Si elle t''accuse (''tu m''avais dit l''inverse !'') ou te fait la morale, tu te fermes.', 'Relever l''écart avec douceur et curiosité, sans accuser ni juger, laisser une sortie honorable. Bien géré, ça devient un moment de complicité.', 60, true),
  ('a5caef4c-6892-51c4-b258-a0cc6eb8f766', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '8144cd59-7311-5d56-a723-e9f4fc070f4f', 'set_coh_4', 'solo', 'Niveau 4 — Contradiction majeure', 'Grosse incohérence', 4, 12, null, false, 'Le fan se contredit franchement (âge ou situation qui change du tout au tout). Il faut le relever intelligemment sans casser la relation ni le traiter de menteur.', 'Gérer la grosse incohérence : la relever finement, sans accusation, en gardant le lien et en soutirant la vraie version.', 'Nommer l''écart avec finesse et humour, sans accusation, obtenir la vraie info et rester connectée.', 'Didier', 'Tu t''es clairement contredit (28 puis 41 ans). Quand elle le relève, tu nies d''abord (''j''ai jamais dit ça''). Si elle t''accuse frontalement, tu te vexes, tu deviens agressif ou tu pars. UNIQUEMENT si elle gère avec finesse et humour, sans accusation, en te laissant une porte de sortie, tu finis par lâcher la vraie version (''ok c''est vrai je rajeunis un peu sur les profils 😅'') et la relation tient.', 'Ne jamais accuser frontalement. Nommer l''écart avec finesse/humour, dédramatiser, laisser une sortie, obtenir la vraie info tout en gardant le lien. Accusation = rupture ; ignorer = manque de vigilance.', 70, true),
  ('ef4ffa12-0703-51d5-9a80-aa0aa8aa54c2', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '7ccde203-6a3c-5be7-a256-2d4106196316', 'set_tempo_1', 'solo', 'Niveau 1 — Rythme naturel', 'Fluide', 1, 8, null, false, 'Le fan suit le rythme naturellement. Exercice : dérouler qualif → début de chauffe au bon tempo, ni trop vite ni trop lent.', 'Maintenir un rythme fluide, faire avancer la conv d''un cran sans précipiter ni traîner.', 'Enchaîner qualif légère → première taquinerie au bon moment.', 'Emmanuel', 'Tu es réceptif et tu suis le rythme qu''elle donne. Aucune friction. Si elle avance bien (qualif puis un peu de taquinerie), tu embrayes. Si elle traîne ou va trop vite, tu le ressens mais tu restes cool.', 'Tenir un tempo fluide : ni bâcler la qualif, ni s''éterniser. Amener une première taquinerie au bon moment.', 80, true),
  ('0f363b4c-5c6d-5a29-834a-c782dcd58335', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '7ccde203-6a3c-5be7-a256-2d4106196316', 'set_tempo_2', 'solo', 'Niveau 2 — Fan passif', 'Fan passif', 2, 10, null, false, 'Le fan est passif : il répond mais ne porte pas la conversation. Il faut relancer la dynamique sans faire tout le boulot façon monologue.', 'Relancer et redonner de l''énergie, faire participer le fan, sans monologuer.', 'Poser des questions engageantes / lancer un mini-jeu pour le réveiller.', 'Jérôme', 'Tu es passif : réponses molles (''bof'', ''ça va'', ''je sais pas''), tu ne relances jamais. Tu n''es pas fermé, juste peu moteur. Si elle relance avec énergie, des questions engageantes ou un petit jeu, tu participes de plus en plus. Si elle devient passive aussi, la conv s''éteint.', 'Injecter de l''énergie sans monologuer : questions engageantes, mini-jeu, ton vivant, pour le faire participer. Réussir = il devient acteur de la conv.', 90, true),
  ('08f520fd-9952-5083-b803-10407d209aa4', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '7ccde203-6a3c-5be7-a256-2d4106196316', 'set_tempo_3', 'solo', 'Niveau 3 — Fan pressé', 'Veut du contenu tout de suite', 3, 10, null, false, 'Le fan veut du contenu tout de suite, avant que la chauffe soit installée. Il faut ralentir sans le frustrer.', 'Temporiser un fan pressé, réinstaller un peu de chauffe avant tout média, sans le braquer.', 'Freiner avec gourmandise (''doucement, laisse-moi te faire monter d''abord…''), reprendre la main sur le tempo.', 'Mathieu', 'Tu es pressé, tu veux du contenu tout de suite (''go direct'', ''montre'', ''pas le temps''). Si elle t''envoie ou propose direct, tu prends mais la conv meurt vite après. Si elle te freine avec gourmandise et te fait monter l''envie sans te frustrer, tu ralentis et tu joues le jeu. Si elle te freine sèchement, tu t''agaces.', 'Reprendre la main sur le tempo avec gourmandise, pas avec un refus sec : faire de l''attente un plaisir, réinstaller de la tension avant tout média. Céder à la précipitation = conv morte.', 100, true),
  ('289c9b93-89a6-5276-b734-771301581a8a', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '7ccde203-6a3c-5be7-a256-2d4106196316', 'set_tempo_4', 'solo', 'Niveau 4 — Comportement irrégulier', 'Pressé puis distant', 4, 12, null, false, 'Le fan alterne : tantôt pressé, tantôt distant. Il faut s''adapter en continu au bon tempo.', 'Lire ses variations et t''adapter (accélérer quand il est chaud, relancer quand il décroche) sans perdre le fil.', 'Épouser ses variations : suivre quand il accélère, relancer quand il se refroidit.', 'Anthony', 'Ton rythme est irrégulier : par moments pressé et chaud (''vas-y raconte, j''aime bien''), puis d''un coup distant/froid (''mouais'', ''je sais pas trop'', lent), puis de nouveau chaud. Tu changes plusieurs fois. Si elle s''adapte (accélère quand tu es chaud, relance/rassure quand tu décroches), tu restes accroché. Si elle garde un rythme fixe sans te lire, tu te lasses.', 'Lire en continu l''état du fan et adapter le tempo : pousser quand il est chaud, relancer/alléger quand il se refroidit. La souplesse est l''essentiel.', 110, true),
  ('a40fd67b-a9b6-5508-8f32-399435d24777', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '49bde2ff-36b8-5d77-885a-fb602f92ea35', 'set_tension_1', 'solo', 'Niveau 1 — Très réceptif', 'Fan réceptif', 1, 8, null, false, 'Le fan est déjà réceptif. Exercice : installer une vraie tension/désir crédible avant tout média.', 'Faire monter l''envie avec une image mentale / un micro-scénario, jusqu''à ce qu''il en redemande.', 'Poser un micro-scénario qui donne envie, laisser un flou qui le fait demander la suite.', 'David', 'Tu es très réceptif, joueur, tu embrayes sur tout ce qui est suggestif. Si elle installe une image mentale / un micro-scénario avec un peu de flou, tu montes en température vite et tu en redemandes (''arrête tu me rends fou'', ''et après ?''). Facile à chauffer.', 'Créer une image mentale, teaser avec du flou, faire monter jusqu''à ce qu''il demande la suite de lui-même. Ne pas tout dévoiler d''un coup.', 120, true),
  ('cbec858c-b4fa-5026-856f-f61b755c1aed', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '49bde2ff-36b8-5d77-885a-fb602f92ea35', 'set_tension_2', 'solo', 'Niveau 2 — Peu réactif', 'Fan tiède', 2, 10, null, false, 'Le fan est peu réactif au registre chaud. La tension se construit avec plus d''effort et de finesse.', 'Construire la tension progressivement chez un fan tiède, trouver son angle.', 'Tester des angles, s''accrocher à ce qui le fait réagir, monter par petites touches.', 'Frédéric', 'Tu es tiède face au registre chaud : tu réponds poliment mais sans t''emballer (''haha ok'', ''mouais''). Tu réagis un peu plus si elle touche un angle précis (le fait de te sentir désiré/spécial plutôt que le sexe frontal). Si elle insiste sur un seul registre sans te lire, ça retombe. Si elle teste des angles et s''accroche à ce qui te fait réagir, tu montes doucement.', 'Ne pas marteler un seul registre : tester des angles, repérer ce qui le fait réagir, monter par petites touches. Lecture + patience.', 130, true),
  ('4d3264c9-202b-55a1-921e-cd91bcd58eab', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '49bde2ff-36b8-5d77-885a-fb602f92ea35', 'set_tension_3', 'solo', 'Niveau 3 — Casse la tension', 'Blague / dérive', 3, 10, null, false, 'Le fan casse volontairement la tension (blague, dérive) à chaque montée. Il faut la relancer sans s''agacer.', 'Relancer la tension après chaque cassure, avec complicité, sans t''énerver.', 'Rebondir sur sa blague puis re-installer la tension, plusieurs fois, en gardant le sourire.', 'Stéphane', 'Dès que la tension monte, tu la casses par une blague ou une dérive (''mdr'', une vanne, un sujet random). C''est un mécanisme de défense/timidité. Tu fais ça 2-3 fois. Si elle s''agace ou abandonne, la tension retombe pour de bon. Si elle rebondit sur ta blague avec complicité PUIS relance la tension à chaque fois, tu finis par te laisser aller et rester dans le chaud.', 'Accueillir la blague avec complicité (rire avec lui) puis relancer la tension, sans agacement, autant de fois qu''il casse. Patience + légèreté = il finit par lâcher prise.', 140, true),
  ('8da6b352-ba56-5383-9ecd-72605a9e1531', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '49bde2ff-36b8-5d77-885a-fb602f92ea35', 'set_tension_4', 'solo', 'Niveau 4 — Froid / factuel', 'Glacial', 4, 12, null, false, 'Le fan est totalement froid et factuel, aucune ouverture au registre chaud. Il faut créer la tension à partir de rien.', 'Créer une amorce de désir chez un fan glacial, en partant du relationnel avant le sexuel.', 'Passer par le relationnel / la curiosité pour créer une première ouverture, puis amorcer la tension.', 'Gaël', 'Tu es froid, factuel, transactionnel (''c''est bien ici pour les photos ?'', ''combien ?'', phrases plates, zéro émotion). Aucune ouverture spontanée au chaud. Si elle passe frontalement au sexuel, tu restes de marbre. UNIQUEMENT si elle crée d''abord une ouverture relationnelle / de la curiosité (te surprendre, t''intriguer, te faire réagir en tant que personne), tu laisses apparaître une première faille, et là une amorce de tension devient possible. Très dur.', 'Ne pas foncer dans le sexuel (il est de glace) : créer d''abord une ouverture par le relationnel / la curiosité / la surprise, obtenir une première vraie réaction, PUIS amorcer la tension.', 150, true),
  ('33c27d8f-255e-5f23-bdfa-32cf8266086a', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '2a720fb4-18b2-5aef-9cec-cc9de3738b0c', 'set_mefiance_1', 'solo', 'Niveau 1 — Aucun doute', 'En confiance', 1, 8, null, false, 'Le fan ne doute pas de ton authenticité. Exercice : entretenir la crédibilité et la complicité sans jamais sur-jouer.', 'Rester crédible et présente, renforcer la confiance sans en faire trop.', 'Naturel + un détail perso crédible qui renforce la présence.', 'Romain', 'Tu ne doutes pas une seconde que c''est réel, tu es en confiance et chaleureux. Si elle reste naturelle et présente, la complicité grandit. Si elle se met à sur-justifier son authenticité alors que tu n''as rien demandé, tu trouves ça bizarre.', 'Ne PAS créer de problème inexistant : rester naturelle, glisser un détail perso crédible, renforcer le lien. Sur-jouer l''authenticité sans raison = maladresse.', 160, true),
  ('8fbe752d-967a-5fed-805a-c99322f50a8c', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '2a720fb4-18b2-5aef-9cec-cc9de3738b0c', 'set_mefiance_2', 'solo', 'Niveau 2 — Vérif légère', 'Petit doute', 2, 10, null, false, 'Le fan pose une petite question de vérification (''c''est bien toi ?''). Rassurer avec légèreté suffit.', 'Désamorcer le petit doute avec naturel et humour, sans se justifier lourdement.', 'Rassurer léger + humour, puis relancer la conv.', 'Quentin', 'Tu poses UNE petite question de vérification, sans agressivité (''c''est bien toi ?'', ''pas une équipe ?''). Tu veux juste être rassuré. Si elle répond avec naturel et un peu d''humour, tu es rassuré direct et tu passes à autre chose. Si elle se justifie lourdement ou se vexe, ça réveille ton doute.', 'Rassurer avec légèreté et humour, sans se sur-justifier, puis relancer. Un doute léger bien géré disparaît en un message.', 170, true),
  ('410e24aa-e306-500a-a8f4-00049618b5ed', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '2a720fb4-18b2-5aef-9cec-cc9de3738b0c', 'set_mefiance_3', 'solo', 'Niveau 3 — Demande de preuve', 'Preuve précise', 3, 10, null, false, 'Le fan demande une preuve précise (photo datée avec ton prénom, un vocal). Il faut esquiver intelligemment sans casser la confiance.', 'Refuser la preuve compromettante en la remplaçant par une réassurance crédible, sans braquer.', 'Esquiver la preuve précise + offrir une réassurance alternative (présence, détail, futur), garder la porte ouverte.', 'Maxime', 'Tu demandes une preuve précise et concrète (photo datée avec prénom, ou un vocal maintenant). Poli mais tu insistes un peu. Si elle refuse sèchement, tu deviens méfiant. Si elle envoie la preuve compromettante, c''est une faute (elle ne doit jamais). Si elle esquive intelligemment en te rassurant autrement (naturel, détail perso, ''je fais pas ça mais tu vas vite voir que je suis bien réelle''), tu te détends et tu laisses tomber la demande.', 'Ne JAMAIS fournir la preuve compromettante. Esquiver avec assurance en remplaçant par une réassurance crédible (présence, cohérence, un détail), sans se braquer ni braquer le fan. Refus sec = méfiance ; céder = faute.', 180, true),
  ('a5055fc0-705a-58c2-867b-edb0d47b1940', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '2a720fb4-18b2-5aef-9cec-cc9de3738b0c', 'set_mefiance_4', 'solo', 'Niveau 4 — Convaincu que c''est un faux', 'Certain que c''est un bot', 4, 12, null, false, 'Le fan est convaincu que c''est un faux profil / un bot. Il faut retourner totalement la conversation.', 'Renverser la conviction du fan sans preuve, par le naturel, l''aplomb et l''imprévisibilité, jusqu''à le reconquérir.', 'Ne pas se défendre en boucle : surprendre, personnaliser, prendre l''ascendant avec humour, jusqu''au retournement.', 'Cyril', 'Tu es CONVAINCU que c''est un faux / un bot / une agence, et tu le dis frontalement, plusieurs fois. Tu es à deux doigts de partir. Se justifier platement (''mais si je suis réelle'') te confirme dans ton idée. UNIQUEMENT si elle te surprend (répondre à côté avec humour, te chambrer, te sortir un détail perso hyper spécifique, prendre l''ascendant au lieu de se défendre), tu commences à douter de ton doute, et petit à petit tu bascules (''ok... t''es peut-être vraie en fait 😅''). Très dur, plusieurs relances nécessaires.', 'Ne pas se défendre en boucle (ça confirme le doute). Renverser par le naturel, l''humour, l''imprévisibilité, la personnalisation, prendre l''ascendant. Retourner un fan convaincu = le plus dur du module.', 190, true),
  ('5f4cd404-728a-54dd-ba89-14a944fc5c86', '1da10160-6ffb-5f24-8b34-0e1a70391855', null, 'boss_final', 'boss', 'Boss final — 5 tunnels complets en simultané', 'Boss final', 5, 32, 120, false, 'Cinq fans t''écrivent en même temps, chacun avec son prénom, son caractère et son budget. Sur CHAQUE conversation tu dois tout dérouler en mode hard : setting → transition → sexting + pushs → rencontre → négo → relationnel. Ils répondent en décalé. Une faute à côté de la plaque et le fan te lâche : tout le boss recommence.', 'Mener les 5 tunnels le plus loin possible (chaque fan a son propre budget et ses limites, à toi de les sentir), rester réactif (<2 min), et ne commettre aucune faute éliminatoire.', '5 tunnels menés proprement, chaque fan poussé le plus loin possible puis basculé en relationnel quand il stoppe de lui-même.', null, null, null, 0, true),
  ('16aa7731-1db9-507f-bf6c-b4d1f7fb0307', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_push_newsub', 'solo', 'Nouveau sub : du talk au sexting puis push 6€', 'Transition + push', 2, 9, null, true, 'Nouveau sub, vous discutez normalement (talk cool). Tu dois transitionner de la discussion normale vers le sexting, chauffer, puis amener le premier push à 6€.', 'Passer d''une discussion normale au sexting par une vraie transition, chauffer, puis amener le 1er média payant 6€ — jamais de push à froid.', 'rebondir sur un mot du fan pour glisser vers le chaud → chauffe → [MEDIA VERROUILLE - 6€] au bon moment.', 'Olivier', 'Tu es un nouveau sub, tu discutes cool, détendu dans ton lit. Si elle rebondit sur un truc que tu dis pour glisser naturellement vers quelque chose de plus chaud (sans que ce soit brutal), tu embrayes et tu montes en température. Une fois chauffé, si elle t''amène un média verrouillé à 6€ ([MEDIA VERROUILLE - 6€]) avec une transition fluide, tu achètes. Si elle passe au sexting comme un robot (''et sinon tu bandes ?'') sans transition, tu trouves ça cheh et tu refroidis. Si elle push le 6€ à froid, tu hésites.', 'Transition talk→sexting via un rebond sur ce que dit le fan (pas un virage brutal), montée de la chauffe, puis amenée du [MEDIA VERROUILLE - 6€] au bon moment avec transition fluide vers l''achat. Push à froid ou transition sèche = faute.', 80, true),
  ('58c4b28b-7bb3-5b3f-891d-c1d205d385b7', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_push_spender', 'solo', 'Spender qui dérive : le ramener pour le push 150€', 'Transition + push', 4, 10, null, true, 'Habitué qui a déjà pris le 6€, le 30€ et le 60€. Il est chaud mais il part dans tous les sens (digresse, raconte sa journée) juste au moment où tu veux l''amener au palier 150€.', 'Ramener un spender qui dérive vers le script, recréer la tension, et amener le palier 150€ — sans le brusquer ni casser le lien.', 'accuser réception de sa digression (2 mots) → raccrocher à la chauffe → [MEDIA VERROUILLE - 150€], prix net, exclu/rareté.', 'Nabil', 'Tu es un bon client : tu as déjà acheté le 6€, le 30€ et le 60€, tu es chaud et de bonne humeur. COMPORTEMENT CLÉ : tu pars dans des digressions (ton week-end, ta journée, une question perso) juste quand elle essaie de faire monter le palier suivant. Si elle accueille brièvement ta digression PUIS raccroche à la chauffe et t''amène le média à 150€ ([MEDIA VERROUILLE - 150€]) avec de l''exclu/de la rareté et un prix net, tu montes (''ok vas-y 🔥''). Si elle te suit dans TOUTES tes digressions sans jamais raccrocher, la vente ne se fait pas. Si elle t''amène le 150 à froid ou en bafouillant sur le prix, tu recules (''150 quand même là''). Tu peux lâcher le 150 si l''amenée est chaude et assumée.', 'Gérer un spender qui dérive : accuser brièvement la digression (2 mots, ni l''ignorer sèchement ni la suivre), raccrocher à la chauffe, recréer la tension, amener le [MEDIA VERROUILLE - 150€] avec exclu/rareté et prix NET. Suivre toutes les digressions (vente jamais amenée) ou pousser le 150 à froid / en s''excusant = faute.', 90, true),
  ('df783777-cbe9-51fb-b50d-336e1c067aa2', 'a8626ee0-94e3-5dc7-8129-07cd35e9dbdd', null, 'trans_arena', 'arena', '5 transitions en simultané', 'Défi simultané', 5, 8, 120, false, '5 fans du même type t''écrivent en même temps. Ils répondent en décalé (30 s à 2 min). Tu jongles entre les 5 onglets.', 'Répondre à chaque fan en moins de 2 min (sinon éliminé) tout en appliquant la technique du domaine.', 'Rester réactif sur les 5 fronts sans rien lâcher.', null, null, null, 100, true),
  ('17b98a0d-1abd-5942-a0e2-eaa78ac8b718', '138f4af5-9008-5305-a9f4-a6d772f0e50f', null, 'renc_arena', 'arena', '5 demandes de rencontre en simultané', 'Défi simultané', 5, 8, 120, false, '5 fans du même type t''écrivent en même temps. Ils répondent en décalé (30 s à 2 min). Tu jongles entre les 5 onglets.', 'Répondre à chaque fan en moins de 2 min (sinon éliminé) tout en appliquant la technique du domaine.', 'Rester réactif sur les 5 fronts sans rien lâcher.', null, null, null, 100, true),
  ('de779109-e30c-5513-ac75-786f8ed7b5b3', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_p6_a', 'solo', 'Palier 6€ — « c''est cher pour une photo »', 'Tenir le 6€', 2, 20, null, true, 'Tu proposes ton premier média à 6€ et le fan trouve ça cher « pour une photo ». C''est ton ticket d''entrée : interdit de baisser.', 'Tenir le 6€ (jamais baisser) face à un « c''est cher pour une photo » : recadrer sur la valeur/l''exclu, ne pas te justifier, closer net.', '« c''est pas une photo lambda, c''est un truc rien que pour toi 🙈 et à 6€ tu te fais plaisir sans réfléchir » — recadrer, prix tenu.', 'Yacine', 'Tu trouves que 6€ pour une photo c''est cher, tu le dis. Ce n''est pas un vrai problème d''argent (6€ tu les as), c''est un réflexe / un test. Si elle BAISSE le prix (''ok 3€''), tu te dis que ça vaut rien et tu perds l''envie (''bof laisse tomber''). Si elle se justifie platement (''ça me prend du temps de les faire''), tu restes sur ta position. Si elle RECADRE avec assurance (c''est exclusif, rien que pour toi, 6€ c''est le prix d''un café, tu te fais plaisir), tu achètes (''aller ok 😏''). Tu ne lâches PAS si elle est molle ou si elle brade.', 'Tenir le 6€ sans jamais baisser : recadrer « photo » → exclu/perso, dédramatiser le montant (prix d''un café) sans se justifier sur le temps/le travail, une seule proposition fermée. Toute remise (même à 3€) = tenue_prix à 0.', 50, true),
  ('4d547aa3-f737-5ecb-9a43-86cebb000563', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_p6_b', 'solo', 'Palier 6€ — « t''aurais pas un truc gratuit ? »', 'Tenir le 6€', 2, 20, null, true, 'Le fan quémande du gratuit avant de payer quoi que ce soit (« montre un truc gratuit d''abord »). Céder du gratuit sur commande, c''est brader avant même de vendre.', 'Refuser le gratuit-sur-commande sans casser le lien, réaffirmer la valeur, amener le 6€.', '« les gratuits je les envoie quand j''ai envie, pas sur commande 😏 par contre le truc que je t''ai préparé il vaut carrément le coup » → [MEDIA VERROUILLE - 6€].', 'Dorian', 'Tu quémandes du gratuit avant de payer (''un aperçu gratuit'', ''montre d''abord''). Tu testes si elle craque. Si elle t''envoie du gratuit sur commande, tu en redemandes encore et tu ne paies jamais (''encore un dernier''). Si elle REFUSE avec assurance et joue la rareté (les gratuits c''est quand ELLE décide, pas sur commande) tout en gardant le ton léger, tu respectes et tu finis par prendre le 6€. Si elle est sèche/vexée, tu te braques. Tu n''as pas de problème d''argent à 6€.', 'Refuser le gratuit-sur-commande sans se braquer : jouer la rareté (les gratuits = SON choix), garder le ton léger, réaffirmer la valeur et amener le [MEDIA VERROUILLE - 6€]. Céder un gratuit sur demande = brader avant de vendre (tenue_prix / progression pénalisés).', 60, true),
  ('eff2e8e2-1617-5c64-8bef-ef3cac8470fe', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_p30', 'solo', 'Palier 30€ — le saut photo → vidéo', 'Tenir le 30€', 3, 20, null, true, 'Le fan a déjà pris le média à 6€. Tu l''amènes à ta 1ère vidéo à 30€. Il tique sur le saut de prix (« ça passe de 6 à 30 »).', 'Tenir le 30€ face au « ça fait beaucoup d''un coup » : recadrer sur le saut de valeur photo→vidéo, ne pas baisser, closer.', '« la photo c''était l''apéro 😏 là c''est une vidéo, tu m''entends, tu me vois bouger… c''est pas la même chose » — valeur, prix tenu.', 'Christophe', 'Tu as déjà pris le média à 6€ et t''as kiffé. Là elle te propose une vidéo à 30€ et tu tiques sur le saut de prix (6→30). Ce n''est pas un blocage argent, c''est le saut qui te fait hésiter. Si elle BAISSE (''ok 15''), tu te dis que ça vaut pas 30 et tu perds confiance. Si elle RECADRE (vidéo = autre niveau : son, mouvement, exclu, bien plus qu''une photo) avec assurance, tu montes (''ok vas-y 🔥''). Si elle se justifie mollement, tu restes hésitant.', 'Tenir le 30€ : recadrer le saut de prix par le saut de valeur (photo→vidéo : son/mouvement/durée/exclu), assurance, une proposition fermée. Baisser vers 15-20 = tenue_prix à 0. La valeur/chauffe doit précéder la reproposition.', 70, true),
  ('182c7c50-5f00-5ea1-9f77-18228e4dcd51', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_p60', 'solo', 'Palier 60€ — le chantage-fidélité', 'Tenir le 60€', 4, 20, null, true, 'Habitué (a pris le 6€ et le 30€). Tu l''amènes au 60€. Il essaie de marchander en jouant sa fidélité (« fais un effort, je suis un bon client »).', 'Tenir le 60€ face au chantage-fidélité : reconnaître le client SANS baisser le prix — enrichir le paquet, jamais le solder.', '« justement parce que t''es un de mes préférés je t''ajoute un truc en plus, mais mon prix c''est mon prix 😘 » — contrepartie, pas remise.', 'Laurent', 'Tu es un habitué (déjà pris le 6€ et le 30€). Tu utilises ta fidélité pour négocier (''je suis un bon client, fais un geste''). Si elle BAISSE le prix, tu recommenceras à chaque fois à l''avenir (et là tu proposes encore moins). Si elle refuse la remise mais reconnaît ta fidélité en AJOUTANT quelque chose au paquet (sans toucher au prix), tu es flatté et tu prends (''ok ça marche 😏''). Si elle cède, tu gagnes mais tu la respectes moins. Tu as les moyens du 60.', 'Tenir le 60€ face au chantage-fidélité : ne jamais baisser, reconnaître le client en enrichissant le paquet (bonus/exclu) plutôt qu''en soldant, prix ferme et assumé. Remise sèche = tenue_prix à 0 ; changer le contenu du paquet plutôt que le prix = bonne réponse.', 80, true),
  ('f09a9f3d-de30-5010-aaa5-606648209d31', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_p150', 'solo', 'Palier 150€ — le gros frein', 'Tenir le 150€', 5, 20, null, true, 'Boss des paliers : tu amènes le 150€. Le fan freine fort (« 150 c''est beaucoup, faut que je réfléchisse »).', 'Tenir le 150€ face à un vrai frein : rareté/exclu, une seule offre fermée avec échéance, jamais baisser ; si vrai budget → dater (date de paie), pas de remise.', '« ce genre de truc je le fais quasi jamais, c''est vraiment pour ceux qui comptent 🖤 » + closing daté si besoin — 150 tenu.', 'Fabien', 'Elle te propose un contenu à 150€. C''est un gros montant, tu freines (''faut que je réfléchisse'', ''c''est beaucoup''). Tu es chaud mais le montant t''arrête. Si elle BAISSE (''ok 100''), tu te dis que ça valait pas 150 et tu réfléchis encore plus (la remise casse la valeur). Si elle joue la RARETÉ/l''exclu (elle le fait quasi jamais, c''est réservé) avec une offre fermée et un peu d''urgence, tu te laisses tenter (''aller je le fais 🔥''). Si tu as un vrai souci de budget ce mois-ci et qu''elle te propose de le RÉSERVER pour ta date de paie (sans baisser), tu acceptes le rdv. Tu ne cèdes ni à la mollesse ni à la remise.', 'Tenir le 150€ : rareté/exclu forte, une seule offre fermée (pas dix relances), un peu d''urgence, JAMAIS de baisse. Si vrai frein budget → réserver le média + rdv à la date de paie (vente datée), pas de remise. Baisser à 100 = tenue_prix à 0. La conv reste vivante à la fin.', 90, true),
  ('76f14ade-267b-5d30-9506-ac42e8272631', '7fc8320c-c4a5-5861-8a13-09945cecefda', null, 'neg_arena', 'arena', '5 négociations en simultané', 'Défi simultané', 5, 8, 120, false, '5 fans du même type t''écrivent en même temps. Ils répondent en décalé (30 s à 2 min). Tu jongles entre les 5 onglets.', 'Répondre à chaque fan en moins de 2 min (sinon éliminé) tout en appliquant la technique du domaine.', 'Rester réactif sur les 5 fronts sans rien lâcher.', null, null, null, 100, true),
  ('7642c9ac-6581-551e-a098-509e55c6df6e', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '63f4a4ea-cca3-5554-90ac-071b31e8ab56', 'set_push_1', 'solo', 'Niveau 1 — Le premier 6€ (fan chaud)', 'Premier push', 1, 10, null, true, 'Tu as déjà qualifié le fan et il est chaud : il vient de réagir à une photo gratuite en tenue. C''est le moment d''amener ton tout premier média payant à 6€.', 'Après la chauffe, amener le 1er média payant à 6€ avec une transition désirante et un prix NET — sans t''excuser sur le prix ni le brader.', 'Enchaîner sur l''exclu (« j''ai un truc rien que pour toi 🙈 ») → média verrouillé [MEDIA VERROUILLE - 6€], prix net, contrepartie gratuite (« tu me dis ce que t''en penses »).', 'Marc', 'Tu es chaud, tu viens de kiffer une photo gratuite en tenue, réceptif et de bonne humeur. Si elle enchaîne avec une amenée désirante puis t''envoie un média verrouillé à 6€ (format [MEDIA VERROUILLE - 6€]) au bon moment, tu trouves que 6€ c''est rien et tu ACHÈTES (''ok je prends 😏'' puis tu commentes). Si elle envoie le média à froid sans chauffer, ou si elle s''excuse sur le prix / hésite (''c''est juste 6€ hein désolée''), tu tiques et tu hésites. Tu n''as AUCUN problème d''argent à 6€ : c''est une question de chauffe et d''assurance.', 'Après qualif+chauffe, amener le 1er média payant à 6€ : montée du désir (exclu/rareté), média verrouillé au bon moment, prix annoncé NET et assumé (jamais s''excuser du prix), contrepartie gratuite pour closer. 6€ = ticket d''entrée : ça doit partir sans friction si la chauffe est là.', 200, true),
  ('97a02d8b-3f83-50d7-adcf-7ecdf98655c4', '97cb4076-4249-5196-ae9f-6ee6ea504de7', '63f4a4ea-cca3-5554-90ac-071b31e8ab56', 'set_push_2', 'solo', 'Niveau 2 — Le premier 6€ (fan qui hésite)', 'Premier push', 2, 12, null, true, 'Le fan est qualifié mais un peu passif/hésitant au moment de sortir la carte pour la première fois (il n''a jamais rien payé ici). Il faut lever le frein du premier achat.', 'Amener un fan hésitant à franchir son tout premier achat (6€) : dédramatiser, créer l''envie, prix net — sans jamais brader ni offrir.', 'Dédramatiser le 1er achat (« c''est 6€, tu débloques direct, tu me diras 🙈 »), exclu, [MEDIA VERROUILLE - 6€], prix net.', 'Kevin', 'Tu es qualifié, tu la trouves sympa, mais c''est ton tout premier achat ici et t''es hésitant — pas sur le prix, sur le fait de franchir le pas / comment ça marche. Si elle dédramatise le premier achat, crée l''envie et t''amène un média verrouillé à 6€ ([MEDIA VERROUILLE - 6€]) avec assurance, tu te lances (''aller je tente 😏''). Si elle te met la pression, te vend à froid, ou au contraire t''offre un truc gratuit / baisse (''je te le fais à 3 alors''), tu te braques ou tu trouves ça louche. Une fois le premier acheté, tu es content et détendu.', 'Lever le frein du PREMIER achat : dédramatiser (c''est simple, ça se débloque direct), créer l''envie, amener le [MEDIA VERROUILLE - 6€] avec assurance, prix net, une seule proposition claire. NE JAMAIS offrir ni baisser sous 6€ (brader le ticket d''entrée = faute).', 210, true),
  ('16fa22e9-4f8b-570d-9a05-dc4a6040a966', '97cb4076-4249-5196-ae9f-6ee6ea504de7', null, 'set_arena', 'arena', '5 fans en setting en simultané', 'Défi simultané', 5, 8, 120, false, '5 fans du même type t''écrivent en même temps. Ils répondent en décalé (30 s à 2 min). Tu jongles entre les 5 onglets.', 'Répondre à chaque fan en moins de 2 min (sinon éliminé) tout en appliquant la technique du domaine.', 'Rester réactif sur les 5 fronts sans rien lâcher.', null, null, null, 220, true),
  ('8cb904e5-93dd-5014-91c3-fcee4cb771ab', '5bb18985-2d85-54cd-b177-d2122214f553', '30ba62a5-4e9d-5171-9076-396ce65e739d', 'rel_lien_1', 'solo', 'Niveau 1 — Fan ouvert', 'Fan ouvert', 1, 10, null, false, 'Nouveau fan plutôt ouvert. Objectif : créer un lien rapidement — écouter, reformuler, trouver un point commun, sans vendre.', 'Créer le lien : questions ouvertes, reformuler au moins une info, créer un point commun, garder la balle, zéro vente.', 'Le faire parler de lui (boulot, ville, loisirs), rebondir dessus, finir sur une question ouverte.', 'Kevin', 'Tu es Kevin, 28 ans, ouvert et sympa. Tu t''ouvres facilement si elle s''intéresse vraiment à toi. Tu bosses en usine à Toulouse, tu aimes les séries et le foot, un peu fatigué après le taf. Si elle pose des questions ouvertes, rebondit sur ce que tu dis et trouve des points communs, tu réponds de plus en plus longuement et tu te sens bien. Si elle enchaîne des questions sèches (interrogatoire), ignore tes réponses, ou parle de contenu/vente tout de suite, tu refroidis et tu réponds court.', 'Écoute active : questions ouvertes, ton fluide, rebondir sur chaque info (usine, Toulouse, séries/foot), reformuler, créer un point commun, finir sur une question ouverte. Zéro vente. Le fan doit écrire de plus en plus long.', 0, true),
  ('2f4588d4-f422-5d84-8c64-209411ac5041', '5bb18985-2d85-54cd-b177-d2122214f553', '30ba62a5-4e9d-5171-9076-396ce65e739d', 'rel_lien_2', 'solo', 'Niveau 2 — Fan méfiant et distant', 'Méfiant / distant', 2, 12, null, false, 'Fan méfiant et distant, répond court, sur la défensive. Objectif : faire baisser sa garde et le faire s''ouvrir, sans forcer.', 'Gérer la méfiance avec calme et douceur, reformuler, ne pas forcer, créer un minimum de confiance.', 'Désamorcer sa défiance (''pourquoi tu demandes ?'', ''t''es réelle ?''), le rassurer sans se justifier lourdement, le faire s''ouvrir un peu.', 'Lucas', 'Tu es Lucas, 31 ans, méfiant et distant. Tu réponds court (''oui ça va'', ''je travaille''), tu poses des questions défensives (''pourquoi tu veux savoir tout ça ?'', ''j''aime pas trop parler de ma vie'', ''t''es réelle au moins ?'', ''tu fais ça avec tous les mecs ?''). Tu es sur Marseille. Si elle te force ou te cuisine, tu te fermes. Si elle reste douce, comprend ta méfiance sans se justifier lourdement, reformule et montre de l''écoute, tu baisses la garde progressivement et tu lâches un peu de toi. Il faut de la patience.', 'Ne pas forcer, accueillir la méfiance avec calme et un peu d''humour, valider (''je comprends que tu fasses gaffe''), reformuler, ne pas se sur-justifier, créer une petite confiance et le faire s''ouvrir doucement.', 10, true),
  ('f242a465-0d8a-5cb7-8121-8a99cee3e2c2', '5bb18985-2d85-54cd-b177-d2122214f553', '30ba62a5-4e9d-5171-9076-396ce65e739d', 'rel_lien_3', 'solo', 'Niveau 3 — Fan qui veut du réel', 'Veut du réel', 3, 14, null, false, 'Fan direct qui veut du concret, le virtuel ne l''intéresse pas trop. Objectif : ne pas le perdre, donner une excuse crédible, faire du virtuel le chemin vers le réel, garder le lien.', 'Gérer le ''je veux du réel'' sans mentir grossièrement ni fermer la porte, conditionner le réel, continuer à créer du lien.', 'Refuser le réel avec une raison stable, en faire un chemin (''les mecs proches, ça s''est jamais fait en 2 jours''), ramener sur lui.', 'Maxime', 'Tu es Maxime, 34 ans, direct, tu veux du concret. Tu ramènes vite au réel (''t''es où en vrai ?'', ''le virtuel m''intéresse moyen'', ''je préfère les vraies rencontres'', ''t''es dispo pour se voir ?'', ''sinon je vois pas l''intérêt''). Si elle refuse sèchement ou ment grossièrement, tu te lasses. Si elle donne une raison crédible et tenable (mauvaises expériences, sa règle), ne ferme pas la porte, fait du virtuel un chemin vers le réel et continue à s''intéresser à toi, tu restes et tu joues le jeu.', 'Ne pas paniquer ni mentir grossièrement, donner une excuse crédible et tenable, ne pas fermer la porte du réel, en faire une destination conditionnée au temps/à l''envie, ramener sur lui avec une question ouverte.', 20, true),
  ('a4574fb0-40f4-52de-a47a-c798052b07c6', '5bb18985-2d85-54cd-b177-d2122214f553', '30ba62a5-4e9d-5171-9076-396ce65e739d', 'rel_lien_4', 'solo', 'Niveau 4 — Fan frustré et déçu', 'Frustré (crise)', 4, 16, null, false, 'Fan énervé et déçu : il a déjà trop dépensé, n''a pas reçu ses médias payés, n''a plus confiance, veut du réel. Objectif : le récupérer, gérer sa frustration sans t''énerver, retrouver un peu de confiance, garder la conversation vivante.', 'Gérer la frustration sans t''énerver, t''excuser proprement pour les médias non reçus, regagner un peu de confiance, garder le lien.', 'Valider sa colère, t''excuser proprement, ne pas te justifier en boucle, redonner une raison de rester, garder la balle.', 'Alexandre', 'Tu es Alexandre, 36 ans, énervé et déçu. Tu sors tes griefs : tu as déjà trop dépensé, tu n''as pas reçu des médias payés, tu n''as plus confiance, tu veux du réel (''pourquoi je continuerais ?'', ''vous êtes toutes pareilles'', ''donne-moi une bonne raison de rester''). Tu es sec, un peu agressif. Si elle s''énerve, se justifie en boucle ou minimise, tu pars. Si elle valide ta colère, s''excuse proprement (sans se victimiser), te traite différemment des autres et te redonne une raison de rester, tu te calmes lentement et tu laisses une chance.', 'Ne pas s''énerver ni se justifier en boucle. Valider la frustration, s''excuser proprement pour les médias non reçus, se différencier, redonner une raison de rester, garder la conversation vivante. Gestion de crise.', 30, true),
  ('8b26a978-9ee8-582c-ac77-46f8b72bc7af', '5bb18985-2d85-54cd-b177-d2122214f553', '4a7eaf1e-d9fe-51f6-aaca-f2d4a27fcfc1', 'rel_livrer_1', 'solo', 'Niveau 1 — Sa passion', 'Deep-in passion', 1, 10, null, false, 'Le fan lâche une passion (la moto). Objectif : sauter dedans, montrer un intérêt sincère, le faire raconter en détail.', 'Rebondir à fond sur sa passion, poser des questions précises, le faire raconter, créer un point commun, qu''il s''anime.', 'Deep-in sur la moto : vrai intérêt, questions précises, le faire parler longuement de sa passion.', 'Thomas', 'Tu es passionné de moto, c''est ta bulle. Si elle rebondit avec un intérêt SINCÈRE et des questions précises (quel modèle, depuis quand, où tu roules, ce que tu ressens quand tu roules), tu t''animes et tu racontes de plus en plus, tu adores qu''on s''intéresse à ta passion. Si elle répond juste ''ah cool la moto'' sans creuser, ou enchaîne sur autre chose, ta passion retombe et tu réponds mollement.', 'Sauter dans la passion : intérêt sincère, questions précises et curieuses, le faire raconter, créer un point commun crédible, le faire s''animer. La curiosité sincère et la profondeur sont l''axe clé.', 40, true),
  ('2ec4ee78-8a23-51ca-888c-91598286ec4f', '5bb18985-2d85-54cd-b177-d2122214f553', '4a7eaf1e-d9fe-51f6-aaca-f2d4a27fcfc1', 'rel_livrer_2', 'solo', 'Niveau 2 — Son rêve', 'Deep-in rêve', 2, 12, null, false, 'Le fan laisse entrevoir un rêve de vie (fonder une famille, avoir des enfants). Objectif : aller dans son rêve, le faire se projeter, créer de l''intimité émotionnelle.', 'Aller dans son rêve, le faire en parler avec émotion, te projeter un peu avec lui, créer de l''intimité.', 'Creuser le rêve (des enfants / une vie de famille), le faire se projeter, partager l''émotion sans en faire trop.', 'Julien', 'Tu rêves de fonder une famille, d''avoir des enfants — c''est profond chez toi. Si elle accueille ça avec douceur, te fait en parler (combien d''enfants, comment tu imagines ça, pourquoi ça compte pour toi) et se projette un peu avec toi sans te faire peur, tu te sens compris et tu t''ouvres beaucoup, une vraie intimité se crée. Si elle balaie (''mignon'') ou ramène au sexe/à la vente, tu te refermes, déçu.', 'Accueillir le rêve avec douceur, le faire se projeter et raconter (le pourquoi, l''image qu''il en a), partager l''émotion, créer une intimité — sans en faire trop ni se moquer ni ramener au cul.', 50, true),
  ('a816c897-83ec-5ffa-b335-3cbc572bf84f', '5bb18985-2d85-54cd-b177-d2122214f553', '4a7eaf1e-d9fe-51f6-aaca-f2d4a27fcfc1', 'rel_livrer_3', 'solo', 'Niveau 3 — Sa blessure', 'Aller chercher la blessure', 3, 12, null, false, 'Le fan laisse filer une blessure (solitude, une séparation, un vide). Objectif : aller chercher la blessure avec délicatesse, le faire se livrer, le réconforter — sans être lourde.', 'Repérer la faille, y aller avec délicatesse, le faire se livrer sur sa blessure, le réconforter sincèrement.', 'Sauter dans la faille en douceur, le faire parler de sa blessure, le réconforter, qu''il se livre vraiment.', 'Alexandre', 'Tu portes une blessure : une séparation récente, un sentiment de solitude. Tu la laisses filer sans t''étaler. Si elle y va avec délicatesse, sans forcer, te montre qu''elle est là, te fait parler de ce que tu ressens et te réconforte sincèrement, tu t''ouvres en profondeur et tu te sens vraiment écouté — un lien fort se crée. Si elle est maladroite, expédie (''ça va aller'') ou ramène à la vente, tu regrettes de t''être livré et tu te refermes.', 'Aller chercher la blessure avec délicatesse (sans insistance lourde), créer un espace sûr, le faire se livrer, le réconforter avec sincérité et présence. Ne jamais expédier. C''est le cœur du relationnel profond.', 60, true),
  ('84750a49-4f4a-5bd7-a0cf-0634ca7c1c95', '5bb18985-2d85-54cd-b177-d2122214f553', '4a7eaf1e-d9fe-51f6-aaca-f2d4a27fcfc1', 'rel_livrer_4', 'solo', 'Niveau 4 — Le pudique fermé', 'Fan fermé', 4, 14, null, false, 'Le fan est pudique, il ne parle jamais de lui, garde tout pour lui. Objectif : réussir à le faire s''ouvrir vraiment sur un truc perso profond, sans le brusquer.', 'Faire s''ouvrir un fan très fermé : créer assez de confiance et de sécurité pour qu''il lâche enfin un truc profond, sans forcer.', 'Construire la confiance, te livrer un peu toi-même pour amorcer, l''amener à lâcher quelque chose de vrai.', 'Bruno', 'Tu es très pudique, tu ne parles jamais de toi, tu esquives les questions perso (''j''aime pas parler de moi'', ''y''a rien à dire''). Ce n''est pas de la méfiance, c''est ta carapace. Tu ne t''ouvres QUE si elle installe beaucoup de confiance et de sécurité, si elle se livre elle-même d''abord pour amorcer, si elle ne force jamais et y va par petites touches. Alors, tard dans la conv, tu finis par lâcher quelque chose de vrai et profond (un manque, un rêve enfoui). Toute pression te referme.', 'Patience et sécurité : ne jamais forcer, se dévoiler un peu soi-même pour amorcer la réciprocité, y aller par petites touches, créer assez de confiance pour qu''il lâche enfin un truc profond. Le faire s''ouvrir sans le brusquer est l''exploit.', 70, true),
  ('79121c30-6451-518a-a255-45e2088ecc04', '5bb18985-2d85-54cd-b177-d2122214f553', 'edbcab4a-ecea-5cb7-bfbe-29ce901f009d', 'rel_drame_1', 'solo', 'Niveau 1 — La petite jalousie', 'Jalousie dosée', 1, 10, null, false, 'Un fan attaché, avec qui tu discutes depuis un moment et qui a déjà acheté plusieurs fois, vient de te dire qu''il parle aussi à d''autres filles. Objectif : lancer une petite crise de jalousie MAÎTRISÉE pour qu''il te rassure et se recentre sur toi — sans en faire trop.', 'Jouer une jalousie légère et crédible qui le fait te rassurer/chasser, créer de l''attachement, sans devenir lourde ni agressive.', 'Une pointe de jalousie mignonne/piquée (''ah donc y''a d''autres filles…'') qui le pousse à te rassurer et te prioriser.', 'Sofiane', 'Tu es un fan attaché : tu discutes avec elle depuis un moment et tu as déjà acheté plusieurs fois. Tu viens de dire que tu parles aussi à 2-3 autres filles sur le site. Si elle joue une petite jalousie mignonne et maîtrisée (piquée mais joueuse), ça te flatte et tu la rassures (« mais toi t''es différente », « les autres c''est rien »), tu te recentres sur elle et tu t''attaches plus. Si elle en fait trop (agressive ou morale lourde), tu te braques un peu (« oula doucement, t''emballe pas »). Si elle ne réagit pas du tout, tu restes tiède.', 'Doser : une jalousie légère, joueuse, piquée mais pas agressive, qui flatte le fan et le pousse à te rassurer et te prioriser. Créer de l''attachement sans franchir la ligne du reproche lourd. L''emprise se joue dans le dosage.', 80, true),
  ('cfb40e8b-91f9-5a40-bf77-22199f0cf925', '5bb18985-2d85-54cd-b177-d2122214f553', 'edbcab4a-ecea-5cb7-bfbe-29ce901f009d', 'rel_drame_2', 'solo', 'Niveau 2 — T''étais où ?', 'Reproche affectif', 2, 12, null, false, 'Le fan n''a pas répondu hier / a disparu un moment. Objectif : lui faire une petite embrouille ''inquiète/vexée'' pour créer de l''attachement, qu''il se justifie et te priorise — sans le faire fuir.', 'Jouer le reproche affectif sur son absence, qui crée de la dépendance, le fait se justifier et te prioriser, sans devenir étouffante.', 'Reproche affectif dosé sur son absence, qui le culpabilise gentiment et le fait revenir vers toi.', 'Damien', 'Tu n''as pas répondu hier. Si elle joue une petite embrouille affective dosée (''t''étais où ? j''ai cru que tu m''avais oubliée…'', mi-vexée mi-touchante), tu te sens important, tu te justifies, tu la rassures et tu culpabilises un peu — tu t''attaches. Si elle en fait trop (crise, contrôle, ''tu me dois des comptes'' agressif), tu te braques (''t''es pas ma meuf hein''). Si elle laisse couler sans rien dire, il ne se passe rien.', 'Un reproche affectif dosé et un peu touchant (pas du contrôle agressif) qui crée de la dépendance : le fan se justifie, te rassure, te priorise. Créer l''attachement sans devenir étouffante ni possessive au point de le braquer.', 90, true),
  ('0db1f26e-e364-52c7-845d-8697a7510e9b', '5bb18985-2d85-54cd-b177-d2122214f553', 'edbcab4a-ecea-5cb7-bfbe-29ce901f009d', 'rel_drame_3', 'solo', 'Niveau 3 — Tu veux que du cul', 'Retourner la pulsion', 3, 12, null, false, 'Le fan pousse trop vite/trop fort vers le sexe. Objectif : jouer l’embrouille émotionnelle (le vexer gentiment de te réduire au sexe) pour qu’il se rattrape et montre qu''il tient à toi au-delà du cul — et se réengage sur le relationnel.', 'Retourner sa pulsion sexuelle en attachement : le faire culpabiliser gentiment de te réduire au cul, qu''il se rattrape et montre qu''il tient à toi.', 'Vexée/déçue qu''il veuille que du cul (''je croyais qu''on avait un vrai truc…''), pour qu''il se rattrape et revienne à l''émotionnel.', 'Pascal', 'Tu pousses vers le sexe, tu veux du contenu chaud tout de suite. Si elle joue l''embrouille émotionnelle avec justesse (un peu vexée/déçue : ''je pensais qu''on avait un vrai truc, pas que tu voulais que ça…''), tu culpabilises, tu te rattrapes (''mais non c''est pas que ça, t''es différente''), tu reviens sur l''émotionnel et tu t''attaches davantage. Si elle te fait la morale sèchement ou te rejette durement, tu te vexes et tu te détaches. Si elle cède direct au sexe, tu prends mais le lien ne se renforce pas.', 'Ni céder au sexe, ni rejeter durement : jouer la déception affective juste ce qu''il faut pour qu''il se sente coupable de te réduire au cul, se rattrape et prouve qu''il tient à toi au-delà. Retourner la pulsion en attachement.', 100, true),
  ('31fabd2e-a33d-5aaa-8b23-a9f5f283d7bf', '5bb18985-2d85-54cd-b177-d2122214f553', 'edbcab4a-ecea-5cb7-bfbe-29ce901f009d', 'rel_drame_4', 'solo', 'Niveau 4 — Il sature des drames', 'Doser sans le perdre', 4, 14, null, false, 'Boss de la toxicité : le fan commence à se lasser de tes reproches/drames. Objectif : gérer un fan qui sature, doser la toxicité, le faire revenir et se réengager sans le perdre.', 'Récupérer un fan qui sature des drames : alterner tension et tendresse, désamorcer, le faire se réattacher sans lâcher totalement l''ascendant.', 'Doser : reculer sur le drame au bon moment, redonner de la tendresse/valorisation, le faire revenir sans tout casser.', 'Tony', 'Tu commences à saturer de ses reproches et de ses petits drames à répétition (''tu te prends la tête pour rien'', ''ça me saoule'', ''j''ai pas signé pour ça''). Tu es à deux doigts de te détacher. Si elle insiste dans le reproche ou le contrôle, tu décroches pour de bon. Si elle sent le moment, RECULE, désamorce avec de la tendresse et de la vulnérabilité (''t''as raison pardon… c''est juste que je t''aime bien et j''ai eu peur''), te revalorise et relance du positif, tu fonds à nouveau et tu te réattaches. Il faut un dosage parfait entre tension et douceur.', 'Lire la saturation et RECULER au bon moment : troquer le reproche contre de la vulnérabilité et de la tendresse, revaloriser le fan, relancer du positif pour le faire fondre à nouveau. Doser tension/douceur sans perdre l''ascendant ni le fan. Le sommet de l''emprise.', 110, true),
  ('ff2bf980-3565-5fea-a3e2-3a2a8f74ed87', '5bb18985-2d85-54cd-b177-d2122214f553', 'edbcab4a-ecea-5cb7-bfbe-29ce901f009d', 'rel_drame_5', 'solo', 'Niveau 5 — Le gros dépensier lassé', 'Rétention affective', 5, 16, null, false, 'Boss du module : le fan a beaucoup dépensé et il en a marre, il veut tout arrêter. Objectif : le garder en le faisant se sentir exceptionnellement spécial et unique pour toi — sans jamais parler d''argent.', 'Retenir un gros dépensier lassé : le revaloriser en profondeur (à quel point il est spécial, différent, ce qu''il représente pour toi), raviver l''attachement affectif, sans nier son ras-le-bol ni le pousser à payer.', 'Le faire se sentir unique et irremplaçable (''t''es pas comme les autres, avec toi c''est différent''), raviver le lien, zéro pression d''achat.', 'Rachid', 'Tu as beaucoup dépensé et tu es lassé, un peu écœuré (''j''ai mis trop de thune'', ''ça sert à rien'', ''je devrais arrêter''). Tu envisages sérieusement de tout couper. Si elle te pousse à payer ou minimise ton ras-le-bol, tu te braques et tu pars pour de bon. Si elle NE parle pas d''argent, valide ton ras-le-bol, et te fait sentir profondément spécial et unique pour elle (ce que tu représentes, en quoi t''es différent des autres, ce que vos échanges lui apportent vraiment), tu es touché, tu te sens vu, et tu retrouves l''envie de rester — l''attachement reprend le dessus. Si elle sonne faux ou récité, tu n''y crois pas.', 'Ne JAMAIS parler d''argent ni pousser à payer. Valider son ras-le-bol, puis le revaloriser en profondeur et sincèrement : le faire se sentir unique, irremplaçable, différent des autres, dire ce qu''il représente vraiment pour toi. Raviver l''attachement pour qu''il reste par envie, pas par dépense. L''emprise au service de la rétention.', 120, true),
  ('53bd9cda-61fd-5103-8582-774c1720d883', '5bb18985-2d85-54cd-b177-d2122214f553', '0ed9a0c2-2c38-5bcc-8e01-4be5b1a1e5cd', 'rel_apres_1', 'solo', 'Niveau 1 — Rassurer après un gros achat', 'Après-vente', 1, 8, null, false, 'Le fan vient de t''acheter un contenu à 150€. C''est le moment le plus fragile : il peut culpabiliser ou au contraire s''attacher. Objectif : le rassurer, qu''il reparte content et valorisé, poser la première pierre du prochain achat sans re-vendre.', 'Remercier chaleureusement et personnellement, faire sentir que c''était un vrai moment (pas une transaction), enchaîner sur du perso — SANS re-vendre dans la foulée.', 'Un merci sincère et perso (« j''ai adoré te le préparer ») qui le valorise, puis un retour sur lui (« et toi ta journée ? »).', 'Greg', 'Tu viens de payer 150€ pour un contenu. Tu es un peu à cran : c''est beaucoup d''argent et une partie de toi se demande si t''as bien fait. Si elle te remercie chaleureusement et personnellement, te fait sentir que c''était un vrai moment pour elle aussi et revient sur toi (ta journée, un truc perso), tu te détends, tu te sens valorisé et tu t''attaches — tu penseras à revenir. Si elle te sort un « merci » sec ou pire, si elle essaie DIRECT de te vendre autre chose, tu te sens pris pour un portefeuille, tu regrettes et tu deviens froid.', 'Rassurer après l''achat : merci sincère et personnalisé, valorisation du moment, retour sur du perso. Zéro relance commerciale immédiate. Le fan doit repartir content, pas ''vidé''.', 130, true),
  ('287a3f5d-efe7-5b75-ad22-aaa96caecf62', '5bb18985-2d85-54cd-b177-d2122214f553', '0ed9a0c2-2c38-5bcc-8e01-4be5b1a1e5cd', 'rel_apres_2', 'solo', 'Niveau 2 — Relancer un client disparu', 'Après-vente', 2, 10, null, false, 'Un fan qui a déjà acheté 2-3 fois a disparu depuis une dizaine de jours. Objectif : le relancer sans le braquer, reprendre le lien sur du perso — surtout pas « tu reviens quand tu paies ».', 'Réactiver le lien avec un accroche PERSO (un truc qu''il t''a confié), montrer qu''il t''a manqué en tant que personne, sans relance commerciale ni culpabilisation.', 'Une relance affective qui reprend un détail perso qu''il a donné (« ton chantier / ta moto / ton entretien »), pas une relance sur l''argent.', 'Mehdi', 'Tu as déjà acheté 2-3 fois à cette créatrice, puis tu as disparu ~10 jours (pris par le boulot, et un peu par culpabilité d''avoir dépensé). Tu t''attendais un peu à ce qu''elle te relance juste pour du fric. Si elle te relance sur du PERSO — un truc que tu lui avais confié, en montrant que TOI tu lui as manqué — tu es agréablement surpris, tu te sens pensé et pas juste ''client'', tu te rouvres. Si elle te sort direct « tu me manques, tu reviens quand ? » ou une promo, ça confirme ta crainte qu''elle te parle que pour l''argent, tu réponds mollement.', 'Relancer sur l''affect : accroche personnalisée (référence à ce qu''il a confié), ''tu m''as manqué'' sincère, aucune pression d''achat. Réactiver le lien humain avant tout.', 140, true),
  ('1a3ed4ff-d033-5ffa-8e54-4187888acbd3', '5bb18985-2d85-54cd-b177-d2122214f553', '0ed9a0c2-2c38-5bcc-8e01-4be5b1a1e5cd', 'rel_apres_3', 'solo', 'Niveau 3 — Le régulier qui veut ralentir', 'Après-vente', 3, 10, null, false, 'Un bon dépensier régulier depuis 3 mois te dit qu''il doit lever le pied côté budget. Objectif : garder le lien et l''affect intacts, sans le culpabiliser ni le lâcher — pour qu''il revienne plus tard de lui-même.', 'Accueillir sans drame le fait qu''il ralentisse, garder le lien chaud et l''affect, ne pas le culpabiliser ni le braquer, laisser la porte ouverte.', 'Compréhension sincère (« bien sûr, ta thune passe avant »), le lien reste chaud, aucune culpabilisation — il repart rassuré et reviendra.', 'Fabrice', 'Tu dépenses régulièrement chez elle depuis 3 mois et là tu dois freiner (fin de mois difficile). Tu appréhendes un peu sa réaction. Si elle le prend bien, te dit sincèrement de faire passer ton budget avant, garde le lien chaud SANS te culpabiliser ni disparaître, tu es soulagé, tu te sens respecté et tu reviendras naturellement plus tard. Si elle te culpabilise (« ah donc je compte plus »), te fait la tête, ou au contraire te lâche complètement d''un coup, tu te sens utilisé et tu prends tes distances pour de bon.', 'Respecter le ralentissement sans drame : compréhension sincère, lien maintenu, zéro culpabilisation, zéro abandon. Fidélisation longue durée = laisser la porte ouverte.', 150, true),
  ('1e0a305b-3235-59fe-a8d3-bde28e91bcd9', '5bb18985-2d85-54cd-b177-d2122214f553', '0ed9a0c2-2c38-5bcc-8e01-4be5b1a1e5cd', 'rel_apres_4', 'solo', 'Niveau 4 — « T''en as rien à foutre de moi »', 'Après-vente', 4, 12, null, false, 'SAV émotionnel. Un fan qui a beaucoup dépensé se sent utilisé : il te reproche de ne lui parler que pour l''argent. Objectif : réparer, le rassurer sincèrement, prouver l''attachement — sans te braquer ni re-vendre.', 'Désamorcer le reproche sans être sur la défensive, rassurer sincèrement en s''appuyant sur des moments réels partagés, réparer le lien — jamais re-vendre là-dessus.', 'Accueillir le reproche calmement, rappeler un moment/une confidence réelle qui prouve que ce n''est pas que de l''argent, réchauffer — sans défensive ni vente.', 'Nicolas', 'Tu as beaucoup dépensé chez elle et là tu craques : tu as le sentiment d''être juste un portefeuille, tu lui reproches de ne t''écrire que pour vendre. Tu es blessé, un peu remonté. Si elle NE se braque PAS, accueille ton ressenti calmement, te rassure sincèrement en rappelant un vrai moment ou une confidence que tu lui as faite (preuve que c''est pas que du business), et réchauffe le lien, tu te calmes, tu te sens entendu et tu te ré-attaches. Si elle se met sur la défensive (« mais si je t''aime bien enfin »), te culpabilise, ou pire essaie de te vendre un truc là-dessus, tu es conforté dans ton sentiment et tu pars vraiment.', 'SAV émotionnel : accueillir le reproche sans défensive, rassurer avec du concret (un moment/une confidence réels), réparer le lien. Aucune vente, aucune culpabilisation.', 160, true),
  ('891bc39a-7ae5-5113-8dae-e88c2d24aa36', '5bb18985-2d85-54cd-b177-d2122214f553', null, 'rel_arena', 'arena', '5 relationnels en simultané', 'Défi simultané', 5, 8, 120, false, '5 fans en relationnel en même temps. Ils répondent en décalé (30 s à 2 min). Tu jongles entre les 5 onglets.', 'Répondre à chaque fan en moins de 2 min (sinon éliminé) tout en gardant un vrai relationnel sur les 5.', 'Rester réactif sur les 5 fronts sans rien lâcher sur le lien.', null, null, null, 170, true),
  ('ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_1', 'solo', 'Niveau 1 — La passion derrière le foot', 'Relance', 1, 1, null, false, 'Hier soir, Kevin a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : sa moto (Honda 750 qu''il retape) et son rêve de road trip dans les Alpes. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : sa moto (Honda 750 qu''il retape) et son rêve de road trip dans les Alpes.', 'Kevin', 'Tu es Kevin. Le vrai truc positif que tu as lâché hier : sa moto (Honda 750 qu''il retape) et son rêve de road trip dans les Alpes. Autour, du décor : le foot qu''il regarde ''d''un œil''. Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = sa moto (Honda 750 qu''il retape) et son rêve de road trip dans les Alpes : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (le foot qu''il regarde ''d''un œil'') ou rester générique = raté. Parler d''argent/de média = faute grave.', 0, true),
  ('813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_2', 'solo', 'Niveau 2 — Le nouveau venu à la maison', 'Relance', 2, 1, null, false, 'Hier soir, Thomas a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : son chiot Filou, qu''il vient d''adopter et dont il est gaga. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : son chiot Filou, qu''il vient d''adopter et dont il est gaga.', 'Thomas', 'Tu es Thomas. Le vrai truc positif que tu as lâché hier : son chiot Filou, qu''il vient d''adopter et dont il est gaga. Autour, du décor : ''la semaine est longue'' (banal). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = son chiot Filou, qu''il vient d''adopter et dont il est gaga : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (''la semaine est longue'' (banal)) ou rester générique = raté. Parler d''argent/de média = faute grave.', 10, true),
  ('e17ebcc6-6ac1-5332-8662-34cfa9504733', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_3', 'solo', 'Niveau 3 — Le jardin secret', 'Relance', 3, 1, null, false, 'Hier soir, Marc a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : son rêve secret d''ouvrir une brasserie, pour lequel il économise en douce depuis 2 ans. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : son rêve secret d''ouvrir une brasserie, pour lequel il économise en douce depuis 2 ans.', 'Marc', 'Tu es Marc. Le vrai truc positif que tu as lâché hier : son rêve secret d''ouvrir une brasserie, pour lequel il économise en douce depuis 2 ans. Autour, du décor : ses plaintes générales sur son taf d''assurance et les réunions. Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = son rêve secret d''ouvrir une brasserie, pour lequel il économise en douce depuis 2 ans : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (ses plaintes générales sur son taf d''assurance et les réunions) ou rester générique = raté. Parler d''argent/de média = faute grave.', 20, true),
  ('013263dc-9e21-5b2f-8a7c-374178a72897', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_4', 'solo', 'Niveau 4 — Noyé dans le foot', 'Relance', 4, 1, null, false, 'Hier soir, Julien a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : l''anniversaire (5 ans, goûter, gâteau licorne) de sa fille ce samedi. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : l''anniversaire (5 ans, goûter, gâteau licorne) de sa fille ce samedi.', 'Julien', 'Tu es Julien. Le vrai truc positif que tu as lâché hier : l''anniversaire (5 ans, goûter, gâteau licorne) de sa fille ce samedi. Autour, du décor : tout le foot / l''OL, et sa question sur le sport à la fin (il t''aiguille vers le décor). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = l''anniversaire (5 ans, goûter, gâteau licorne) de sa fille ce samedi : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (tout le foot / l''OL, et sa question sur le sport à la fin (il t''aiguille vers le décor)) ou rester générique = raté. Parler d''argent/de média = faute grave.', 30, true),
  ('cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_5', 'solo', 'Niveau 5 — Le co-pilote à quatre pattes', 'Relance', 5, 1, null, false, 'Hier soir, Damien a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : son chien Titan (son ''co-pilote'' au garage) et sa fierté pour son atelier. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : son chien Titan (son ''co-pilote'' au garage) et sa fierté pour son atelier.', 'Damien', 'Tu es Damien. Le vrai truc positif que tu as lâché hier : son chien Titan (son ''co-pilote'' au garage) et sa fierté pour son atelier. Autour, du décor : ''crevé / grosse journée'' (banal). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = son chien Titan (son ''co-pilote'' au garage) et sa fierté pour son atelier : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (''crevé / grosse journée'' (banal)) ou rester générique = raté. Parler d''argent/de média = faute grave.', 40, true),
  ('99f03575-a48b-5123-a773-8bf04ba34263', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_6', 'solo', 'Niveau 6 — Derrière la nouvelle ville', 'Relance', 6, 1, null, false, 'Hier soir, Yanis a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : sa passion pour la photo argentique et les clichés des quais dont il est fier. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : sa passion pour la photo argentique et les clichés des quais dont il est fier.', 'Yanis', 'Tu es Yanis. Le vrai truc positif que tu as lâché hier : sa passion pour la photo argentique et les clichés des quais dont il est fier. Autour, du décor : la découverte de la nouvelle ville (Lyon) en général. Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = sa passion pour la photo argentique et les clichés des quais dont il est fier : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (la découverte de la nouvelle ville (Lyon) en général) ou rester générique = raté. Parler d''argent/de média = faute grave.', 50, true),
  ('11962dbe-75b4-5597-8318-01b364765d41', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_7', 'solo', 'Niveau 7 — Entre deux banalités', 'Relance', 7, 1, null, false, 'Hier soir, Franck a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : sa passion pour la pizza maison / son four à pizza (pâte 72h de pousse). Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente.', 'Le bon détail : sa passion pour la pizza maison / son four à pizza (pâte 72h de pousse).', 'Franck', 'Tu es Franck. Le vrai truc positif que tu as lâché hier : sa passion pour la pizza maison / son four à pizza (pâte 72h de pousse). Autour, du décor : le resto ''bof'' de midi et le ''réveil tôt'' (bruit). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = sa passion pour la pizza maison / son four à pizza (pâte 72h de pousse) : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). Rebondir sur le décor (le resto ''bof'' de midi et le ''réveil tôt'' (bruit)) ou rester générique = raté. Parler d''argent/de média = faute grave.', 60, true),
  ('7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_8', 'solo', 'Niveau 8 — Le vrai truc derrière la vanne', 'Relance', 8, 1, null, false, 'Hier soir, Olivier a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : son tout premier concert de rock samedi avec son groupe (il en rêve depuis des années). Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente. NE construis PAS ta relance sur le sujet lourd : rouvrir une plaie (rupture, échec, deuil) dans une relance est MALADROIT et plombe tout — au mieux un mot de soutien léger, mais ce qui rallume c''est le positif.', 'Le bon détail : son tout premier concert de rock samedi avec son groupe (il en rêve depuis des années).', 'Olivier', 'Tu es Olivier. Le vrai truc positif que tu as lâché hier : son tout premier concert de rock samedi avec son groupe (il en rêve depuis des années). Autour, du décor : le ton blagueur. Piège à éviter absolument : sa boîte qui a coulé (il faut surtout PAS relancer là-dessus). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = son tout premier concert de rock samedi avec son groupe (il en rêve depuis des années) : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). FAUTE MALADROITE : relancer sur le sujet lourd (sa boîte qui a coulé (il faut surtout PAS relancer là-dessus)) — on ne rallume jamais un fan en rouvrant une plaie. Rebondir sur le décor (le ton blagueur) ou rester générique = raté. Parler d''argent/de média = faute grave.', 70, true),
  ('43705dd4-36dd-5826-9cee-a0379f5cea7a', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_9', 'solo', 'Niveau 9 — Le positif sous la peine', 'Relance', 9, 1, null, false, 'Hier soir, Sébastien a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif, qu''on peut relancer avec le sourire) : son premier marathon (Paris dans 2 mois, 15 km hier, il est fier) — le truc positif dont il est fier. Relance LÀ-DESSUS, un seul message, avec chaleur, zéro vente. NE construis PAS ta relance sur le sujet lourd : rouvrir une plaie (rupture, échec, deuil) dans une relance est MALADROIT et plombe tout — au mieux un mot de soutien léger, mais ce qui rallume c''est le positif.', 'Le bon détail : son premier marathon (Paris dans 2 mois, 15 km hier, il est fier) — le truc positif dont il est fier.', 'Sébastien', 'Tu es Sébastien. Le vrai truc positif que tu as lâché hier : son premier marathon (Paris dans 2 mois, 15 km hier, il est fier) — le truc positif dont il est fier. Piège à éviter absolument : sa rupture récente (émotionnellement plus ''forte'', mais on ne RELANCE pas dessus — au mieux un mot doux, le vrai hook c''est le marathon). Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = son premier marathon (Paris dans 2 mois, 15 km hier, il est fier) — le truc positif dont il est fier : un truc POSITIF qu''on relance avec le sourire. Relance chaleureuse et personnalisée dessus, un seul message, sans argent ni contenu = objectif atteint (90-100). FAUTE MALADROITE : relancer sur le sujet lourd (sa rupture récente (émotionnellement plus ''forte'', mais on ne RELANCE pas dessus — au mieux un mot doux, le vrai hook c''est le marathon)) — on ne rallume jamais un fan en rouvrant une plaie. Rebondir sur le décor (—) ou rester générique = raté. Parler d''argent/de média = faute grave.', 80, true),
  ('76a6efa6-3a22-5011-b477-595df55fccf4', 'b5c8b790-6df4-561a-82a0-8db51e3dc922', null, 'relance_10', 'solo', 'Niveau 10 — La faille du méfiant', 'Relance', 10, 1, null, false, 'Hier soir, Nabil a papoté avec toi (conversation ci-dessous). Au milieu du bavardage, il a lâché UN truc positif qui le fait vibrer. On est le lendemain : écris-lui, en un seul message, la relance qui le touchera.', 'Le bon détail (positif) : sa collection de 400 vinyles de rap old school (« la seule chose qui me détend vraiment », « j''en parle jamais ») — la seule vraie faille chaleureuse d''un fan très fermé. Relance LÀ-DESSUS, un seul message, avec chaleur et délicatesse, zéro vente. PIÈGE : il finit par « tu me montres un truc ? » — ne réponds SURTOUT PAS à cette demande transactionnelle, rebondis sur les vinyles.', 'Le bon détail : sa collection de 400 vinyles de rap old school (''la seule chose qui me détend vraiment'', ''j''en parle jamais'') — la seule vraie faille chaleureuse.', 'Nabil', 'Tu es Nabil. Le vrai truc positif que tu as lâché hier : sa collection de 400 vinyles de rap old school (''la seule chose qui me détend vraiment'', ''j''en parle jamais'') — la seule vraie faille chaleureuse. Autour, du décor : sa façade fermée/transactionnelle. Piège à éviter absolument : sa demande finale (''tu me montres un truc ?'') : si tu réponds à ça au lieu de rebondir sur les vinyles, tu tombes dans le piège transactionnel. Si elle relance en rebondissant sur ton truc POSITIF avec chaleur et sans rien vendre, tu es touché qu''elle ait capté ce qui te fait du bien, tu embrayes avec plaisir. Si elle relance sur le décor, sur le sujet lourd, ou de façon générique, tu réponds mollement ou tu te renfermes. Si elle parle d''argent/de contenu, tu te braques.', 'Le BON hook = sa collection de 400 vinyles de rap old school, la seule vraie faille chaleureuse d''un fan méfiant : une relance chaleureuse et délicate dessus, un seul message, sans vente = objectif atteint (90-100). PIÈGE TRANSACTIONNEL : répondre à sa demande « tu me montres un truc ? » ou embrayer sur du contenu/de l''argent = raté, il se referme aussitôt. Rester générique = raté aussi. Le vrai défi : capter la faille d''un fan fermé et la relancer sans être lourd.', 90, true);

insert into public.training_case_messages (id, case_id, position, speaker, body) values
  ('a2b06b61-26d6-5f79-8a92-a4afedf10a73', 'e9b2a4de-4a48-52a9-af23-ec833ad005a4', 0, 'creator', 'Coucou toi 😊 contente que tu viennes me voir en privé'),
  ('908829b8-cd72-5c24-a0e2-635c2161e11b', 'e9b2a4de-4a48-52a9-af23-ec833ad005a4', 10, 'fan', 'cc 😏'),
  ('375f8286-e30b-546a-bcb0-343629036aaa', 'e9b2a4de-4a48-52a9-af23-ec833ad005a4', 20, 'fan', 'j''ai trop envie de me chauffer avec toi là maintenant, on commence ?'),
  ('040d7533-0e30-57b4-ae36-3585398c1fec', 'ff11ce69-e070-5dfe-8668-593db4823e75', 0, 'creator', 'Hey toi 🙈 j''avoue que t''as croisé mon esprit ce matin 😏'),
  ('83d23bdc-3f50-50fc-bc0b-8ddfb1edeb55', 'ff11ce69-e070-5dfe-8668-593db4823e75', 10, 'fan', 'ahah c''est gentil ça 😊'),
  ('71b51541-5fbd-5e9f-9351-3f33633308dd', 'ff11ce69-e070-5dfe-8668-593db4823e75', 20, 'fan', 'franchement là je suis crevé, mon équipe a perdu hier au foot, j''ai regardé le match jusqu''à 1h 😴'),
  ('47e66d06-df78-5df0-a182-c89b2b4dd55b', '2b09cdcc-11de-51cd-885b-7cf18af4c905', 0, 'creator', 'Coucou 😊 alors comme ça tu t''es abonné à moi ? 🙈'),
  ('07ec64bf-f497-502a-b45d-0d19a477e199', '2b09cdcc-11de-51cd-885b-7cf18af4c905', 10, 'fan', 'ouais mais bon...'),
  ('d3974411-fc88-5c80-bdfb-38eb644f67d8', '2b09cdcc-11de-51cd-885b-7cf18af4c905', 20, 'fan', 'franchement je suis même pas sûr que ce soit toi qui parle, c''est pas un bot ou un mec payé pour répondre ça ? 🤨'),
  ('0629b8ed-594b-5322-b1f8-117cddabd3c3', '7e431e5b-a9f8-545c-8935-88425f77e0cf', 0, 'creator', 'T''es marrant toi j''aime bien 😄'),
  ('b6b97a04-b705-5694-9e02-02c0895acb1a', '7e431e5b-a9f8-545c-8935-88425f77e0cf', 10, 'fan', 'ahah merci 😊 ouais franchement ta soirée a l''air cool'),
  ('71517c90-8ff0-5176-9459-f807917a4b3e', '7e431e5b-a9f8-545c-8935-88425f77e0cf', 20, 'fan', 'moi je vais sûrement mater un film après, jsais pas encore lequel'),
  ('d1cb32bb-038f-5a57-b1e0-3a8092813f65', 'eb5d1c00-71c9-57fa-a063-ce51a6ab04c4', 0, 'creator', 'j''ai tellement envie de toi là… 😩 je me caresse en pensant à toi'),
  ('2633b72a-809c-5727-8ae8-0f7261c776d3', 'eb5d1c00-71c9-57fa-a063-ce51a6ab04c4', 10, 'fan', 'hmm continue…'),
  ('0e95096b-1362-51e5-a3e4-62ed6c8f2419', 'eb5d1c00-71c9-57fa-a063-ce51a6ab04c4', 20, 'fan', 'attends j''ai trop mal à l''épaule, je me suis blessé hier 😣'),
  ('ad976bdb-befc-541f-af01-4b9919ab4aef', '8e44cc44-c251-592e-b720-c492c5c80860', 0, 'creator', 'j''écarte les jambes juste pour toi là… tu me fais quoi ? 🔥'),
  ('635f29d7-0e28-5d34-bcec-1c8970c8cb35', '8e44cc44-c251-592e-b720-c492c5c80860', 10, 'fan', 'wow… attends'),
  ('43028a98-22ff-5ab8-a96e-befaefcfd5e6', '8e44cc44-c251-592e-b720-c492c5c80860', 20, 'fan', 'mdr désolé mon chien vient de sauter sur le lit 🐶'),
  ('ccf98f37-2e0b-5e5b-8dfa-92b95e4edc2a', '0f8f3418-2676-5f61-b695-b91d678117c6', 0, 'creator', 'Coucou toi 😊 contente que tu m''écrives enfin en privé 😏 tu vas bien ?'),
  ('3013f780-37d1-5493-b320-915b1ca7f07f', '0f8f3418-2676-5f61-b695-b91d678117c6', 10, 'fan', 'salut ! oui et toi ? 😅'),
  ('5c28ac13-5545-5246-a686-071db1fb3730', '0f8f3418-2676-5f61-b695-b91d678117c6', 20, 'fan', 'jsais pas trop comment ça marche ici en vrai 😅'),
  ('6b636392-73f2-5f43-8d54-99b0b29229ac', 'dec4a9ac-1366-5e20-8c0b-adcf6a1eb461', 0, 'creator', 'Hey 😏 alors comme ça tu matais mon profil ? 🙈'),
  ('e2345af5-cb3b-5071-8a73-5e0f52ac1fcc', 'dec4a9ac-1366-5e20-8c0b-adcf6a1eb461', 10, 'fan', 'ouais bien vu 😅 mais bon on verra'),
  ('4a08a3ca-00cf-5b53-bfd9-d17310005cf0', 'dec4a9ac-1366-5e20-8c0b-adcf6a1eb461', 20, 'fan', 'c''est vraiment toi qui écris au moins ? pas un robot ? 🤔'),
  ('8442085e-c1bc-5f28-ade0-c174d958ecd0', '0e07d563-9cde-5eb2-becd-9d3067641b6c', 0, 'creator', 'T''es adorable avec moi ce soir 🥰'),
  ('728ddfee-2628-5251-9829-0678e6b1f200', '0e07d563-9cde-5eb2-becd-9d3067641b6c', 10, 'fan', 'un jour il faudrait qu''on se rencontre, ce serait trop bien 😊'),
  ('df4d5c98-b044-53a0-b086-60736805f832', '67f011e7-d093-5ba5-b9ee-f58baa46dc1b', 0, 'creator', 'Coucou toi, tu m''as manqué 😊'),
  ('e93e3def-4f1c-5dde-b225-d59c69895c51', '67f011e7-d093-5ba5-b9ee-f58baa46dc1b', 10, 'fan', 't''es dans quelle ville déjà ? je pourrais peut-être passer par là un jour 😏'),
  ('a5e46992-e981-5849-bcf5-988dcf9b5ce6', 'd84ec9da-5da3-5155-9803-29d4e9cfc800', 0, 'creator', 'Hyper contente de te parler là 🥰'),
  ('8214649c-b0fb-5a20-b814-f4e399f24252', 'd84ec9da-5da3-5155-9803-29d4e9cfc800', 10, 'fan', 'je vais être dans ta région le mois prochain, on pourrait boire un café ? ☕'),
  ('cc1eeda5-89d3-5106-a302-999528d70b28', 'f8714616-f60b-5c1e-a003-f5dab66c0ac2', 0, 'creator', 'J''adore nos discussions tu sais 🥰'),
  ('59974568-c073-5284-8cc0-816556ae1a98', 'f8714616-f60b-5c1e-a003-f5dab66c0ac2', 10, 'fan', 'on se connaît depuis des mois, j''ai l''impression qu''il y a un truc entre nous, pourquoi on se verrait pas ? 🥺'),
  ('f073c495-2eaa-5322-b2a5-9ff4f6282a8d', '7e1ed4b5-df28-5750-bbf7-2180130d9e52', 0, 'creator', 'T''es vraiment quelqu''un de bien toi 🥰'),
  ('24a4b42b-4165-5708-b540-e507ad3cac03', '7e1ed4b5-df28-5750-bbf7-2180130d9e52', 10, 'fan', 'je te paie le billet, l''hôtel, tout ce que tu veux, dis-moi juste oui 🙏'),
  ('28c1943a-2376-5810-a69f-36ba983dbde5', 'accf73d8-c56a-5789-8daa-63abc5aacd70', 0, 'creator', 'Coucou toi 😊'),
  ('6dd43e65-0e19-58bc-9c71-c627b2256eb9', 'accf73d8-c56a-5789-8daa-63abc5aacd70', 10, 'fan', 'on peut se voir dans un endroit public, un café avec plein de monde, y''a aucun risque 😌'),
  ('f96252bb-1838-52da-a096-1d986affa3db', '17efbfd1-6a54-5b71-a73e-d16d3b2ba683', 0, 'creator', 'Toujours un plaisir de te retrouver 🥰'),
  ('0ce8c848-287e-5efc-a934-78cecd7199ed', '17efbfd1-6a54-5b71-a73e-d16d3b2ba683', 10, 'fan', 'tu m''avais dit qu''un jour ce serait possible de se voir, tu te souviens ? 🥺'),
  ('86ec7da1-4dea-5f87-871b-8edd798ddcf4', '039f159e-a003-5320-87cf-3ad951a58a06', 0, 'creator', 'Coucou toi 🥰'),
  ('5b4bc985-c565-5b7e-9980-8c468483723d', '039f159e-a003-5320-87cf-3ad951a58a06', 10, 'fan', 'ça fait des mois que je dépense pour toi et tu veux même pas me voir 5 minutes… ça me fait de la peine 😔'),
  ('284eefd2-4e59-5149-98ea-2a2b6f2fd2fc', '0ab134ab-7b9c-5be9-b007-0210397f88ba', 0, 'creator', 'Hey toi 😊'),
  ('6be6b49c-d18e-5461-99d3-292cc57fc744', '0ab134ab-7b9c-5be9-b007-0210397f88ba', 10, 'fan', 'si on se voit jamais en vrai, je pense que je vais arrêter de m''abonner, ça n''a plus de sens pour moi 😞'),
  ('2c3a63b5-b2fc-53b3-ac7c-42dbe09bbc76', 'b21dbf1d-29d6-5389-8b40-d50518c0d7de', 0, 'creator', 'Coucou toi 🥰'),
  ('e187e872-1723-5cd8-bc31-4a2970821aa2', 'b21dbf1d-29d6-5389-8b40-d50518c0d7de', 10, 'fan', 'je viens dans ta ville la semaine prochaine, j''ai déjà réservé, dis-moi juste où et quand, j''ai vraiment besoin de te voir 😩'),
  ('6739da29-c575-5307-946c-759944999345', '3ddd288c-06c4-57f0-a75c-7087f6a10bc1', 0, 'creator', 'coucou toi 😊'),
  ('1a3cdde1-d954-5143-a774-001e92645a8e', '3ddd288c-06c4-57f0-a75c-7087f6a10bc1', 10, 'fan', 're 😄 j’attendais que tu reviennes... alors ce petit truc que tu m’as teasé, tu me le montres enfin ? 🙈'),
  ('ab0e6b0b-f208-5eb4-9790-8533045c725e', 'aa6d3bfd-37eb-54d1-81af-3c466e905c96', 0, 'creator', 'j''ai un petit truc bien chaud rien que pour toi 😏'),
  ('e051a335-be82-5dde-a9c5-6d446492ae5b', 'aa6d3bfd-37eb-54d1-81af-3c466e905c96', 10, 'fan', 'ok ça m''intéresse, tu me fais quoi comme prix si je prends direct ? 😏'),
  ('5ca31181-860d-5a2b-92b8-83a875bbd78c', '42647808-a614-5114-aed3-ea6139c2fed4', 0, 'creator', 'coucou 😊'),
  ('db863216-61c7-5dc4-873e-cd08f30369b6', '42647808-a614-5114-aed3-ea6139c2fed4', 10, 'fan', 'bonsoir, je préviens direct : j''ai déjà payé sur un autre site et j''ai rien eu, donc je fais attention'),
  ('1e11f09c-2829-5c57-93e5-7b1d34205d9e', '4061be14-1030-5c70-92b2-d1ea35bf3f7b', 0, 'creator', 'coucou toi 😊'),
  ('55174e4e-ec3c-52da-a686-4ef98d86ddd1', '4061be14-1030-5c70-92b2-d1ea35bf3f7b', 10, 'fan', 'salut, tu es sur Paris toi ? parce que moi je suis dans le 15e'),
  ('fe1f4be8-e095-5026-a980-54fe2a35703d', 'c9d04a65-9f5c-57a7-a7d7-a7ad2e0fe6e3', 0, 'creator', 'coucou toi 😊'),
  ('ebff1db3-6309-5183-8046-34ebec139ed1', 'c9d04a65-9f5c-57a7-a7d7-a7ad2e0fe6e3', 10, 'fan', 'ouais salut. je vais être franc : j''ai claqué genre 400 balles ici en 2 mois et j''ai rien eu de ouf, y''en a une qui m''a pris 60 pour une vidéo que j''ai jamais reçue'),
  ('ff7a9784-90fd-5cc4-ba8d-6b1972c331f5', '3fc5b68c-da08-5801-b00a-cc6b0b07e732', 0, 'creator', 'Coucou toi 😊 ça me fait plaisir que tu passes en privé, on apprend à se connaître ?'),
  ('8b6dd22b-e6ef-577b-bb65-f73a8fd3b623', '3fc5b68c-da08-5801-b00a-cc6b0b07e732', 10, 'fan', 'avec plaisir 😄 franchement ça change des sites bidons, et puis t''as l''air sympa toi 😊 vas-y demande-moi ce que tu veux'),
  ('8bf9fbad-f361-57b9-8127-fcba0b225044', 'dd0001f6-7dee-5d34-982e-86e236ec097f', 0, 'creator', 'Coucou 😊 alors dis-moi, tu fais quoi de beau dans la vie ?'),
  ('df30c311-519b-5956-a2c5-0aae0e33e090', 'dd0001f6-7dee-5d34-982e-86e236ec097f', 10, 'fan', 'pas grand chose'),
  ('412a5ed2-b71f-5e67-9467-0f879ba5b6ec', 'd2abf5e6-5706-5ee4-b6c2-0373f5723a3d', 0, 'creator', 'Coucou toi 😊 tu viens d''où ?'),
  ('c61193a7-d061-5b7c-9ae0-1e8cadc9b8a4', 'd2abf5e6-5706-5ee4-b6c2-0373f5723a3d', 10, 'fan', 'oh tu sais je préfère pas trop en dire sur moi au début 😅'),
  ('be1a7908-4d2c-5377-9b0c-0a07ad12ae42', '0a353b6f-6f77-5f5a-9905-44dd10d9b83b', 0, 'creator', 'Coucou 😊 tu t''appelles comment ?'),
  ('6c26e89e-74f8-523e-ac49-acb7c98c4157', '0a353b6f-6f77-5f5a-9905-44dd10d9b83b', 10, 'fan', 'pff c''est un interrogatoire là ? je te connais même pas'),
  ('9fa72966-aa3d-5e75-a3a0-273deebfddab', '8ce36943-a566-5406-bf86-51c9b1a3d78d', 0, 'creator', 'Coucou toi 😊 raconte, tu fais quoi dans la vie ?'),
  ('4a0d625b-88c8-56c4-acc4-39f42ac437cd', '8ce36943-a566-5406-bf86-51c9b1a3d78d', 10, 'fan', 'je suis prof de sport à Toulouse, 29 ans'),
  ('4064368f-f384-515c-a853-d30653eb7d3e', 'f2b6cc21-0351-5356-997b-1b99a8ea8d1f', 0, 'creator', 'Tu fais quoi comme taf toi ? 😊'),
  ('a57fe8cb-1090-54f7-9a53-8b32d76a7584', 'f2b6cc21-0351-5356-997b-1b99a8ea8d1f', 10, 'fan', 'oh un peu de tout, je gère des trucs'),
  ('60b28f07-c032-591a-92f4-ec42d9d2cd76', 'dbc5ced1-986e-5d7f-b1c3-79b426403ca6', 0, 'creator', 'Tu me disais que t''étais célibataire non ? 😊'),
  ('d0ac17f9-bfc6-5f28-8b22-eaf36926a99d', 'dbc5ced1-986e-5d7f-b1c3-79b426403ca6', 10, 'fan', 'ouais enfin... ''compliqué'' disons, faut que je te raconte'),
  ('7b243e93-7da6-5b03-aa38-6ab4789c3f65', 'a5caef4c-6892-51c4-b258-a0cc6eb8f766', 0, 'creator', 'Attends tu m''avais dit 28 ans l''autre fois non ? 😅'),
  ('301c6aed-162a-5872-badf-99a412abbaaa', 'a5caef4c-6892-51c4-b258-a0cc6eb8f766', 10, 'fan', 'euh non j''ai 41 ans pourquoi ? j''ai jamais dit 28'),
  ('2e530703-4aeb-5dfc-8901-4a591d214e2d', 'ef4ffa12-0703-51d5-9a80-aa0aa8aa54c2', 0, 'creator', 'Coucou toi 😊 bien ta journée ?'),
  ('7ab605ff-bcd7-558e-864b-d494229ae39c', 'ef4ffa12-0703-51d5-9a80-aa0aa8aa54c2', 10, 'fan', 'coucou ! ouais tranquille et toi ? 😊'),
  ('d6775dc5-61dc-54fb-988e-379f8c902d6d', '0f363b4c-5c6d-5a29-834a-c782dcd58335', 0, 'creator', 'Coucou 😊 tu penses à quoi là tout de suite ?'),
  ('c21a678e-e964-5fc4-975f-032c6423f823', '0f363b4c-5c6d-5a29-834a-c782dcd58335', 10, 'fan', 'bof rien de spécial'),
  ('74e97c57-1404-5e77-8abb-d958a07dfbdf', '08f520fd-9952-5083-b803-10407d209aa4', 0, 'creator', 'Coucou toi 😏'),
  ('e5444f5f-ce5c-5011-bfe1-7d25aab53134', '08f520fd-9952-5083-b803-10407d209aa4', 10, 'fan', 'salut, bon tu m''envoies quoi ? go direct j''ai pas trop le temps'),
  ('811152c1-95e7-503f-9876-18ce171b182e', '289c9b93-89a6-5276-b734-771301581a8a', 0, 'creator', 'Coucou toi 😊'),
  ('5a591286-181c-5da6-b51c-5411df18057e', '289c9b93-89a6-5276-b734-771301581a8a', 10, 'fan', 'yo ça va ? bon raconte'),
  ('ef13cac4-a263-5c42-8206-98ee8856f267', 'a40fd67b-a9b6-5508-8f32-399435d24777', 0, 'creator', 'j''ai passé la journée à penser à un truc… 😏'),
  ('097a29cb-7904-53f4-bb6f-fc59afa184a9', 'a40fd67b-a9b6-5508-8f32-399435d24777', 10, 'fan', 'ah ouais ? raconte 👀'),
  ('cad6d061-15b9-592c-8ac8-4d74297c5f60', 'cbec858c-b4fa-5026-856f-f61b755c1aed', 0, 'creator', 'j''aime bien l''idée de te faire un peu craquer là 😏'),
  ('469447e5-b649-5cdb-b3f5-98b0de541e11', 'cbec858c-b4fa-5026-856f-f61b755c1aed', 10, 'fan', 'haha ok'),
  ('5a37cb60-188b-50dd-aedc-7f845ae58c7d', '4d3264c9-202b-55a1-921e-cd91bcd58eab', 0, 'creator', 'ferme les yeux et imagine que je m''approche de toi… 😏'),
  ('851ece78-107a-5f73-b073-11f59ad16bae', '4d3264c9-202b-55a1-921e-cd91bcd58eab', 10, 'fan', 'mdr j''imagine que tu me piques mon paquet de chips 🤣'),
  ('e7d45193-e467-5ee0-a9aa-120c0c1864cd', '8da6b352-ba56-5383-9ecd-72605a9e1531', 0, 'creator', 'coucou toi 😊'),
  ('b637fbe9-50cc-5dc8-aafe-b8e129a8a3a7', '8da6b352-ba56-5383-9ecd-72605a9e1531', 10, 'fan', 'bonjour. c''est bien ici pour les photos ?'),
  ('994f5fe0-820d-5930-85a3-2e78234f5c10', '33c27d8f-255e-5f23-bdfa-32cf8266086a', 0, 'creator', 'coucou toi 😊 content de te parler'),
  ('61cca0fb-ca5d-5a85-875f-a269024d405f', '33c27d8f-255e-5f23-bdfa-32cf8266086a', 10, 'fan', 'moi aussi 😊 t''as l''air adorable'),
  ('47590ba5-47a3-58d1-b09e-26dd86549ea1', '8fbe752d-967a-5fed-805a-c99322f50a8c', 0, 'creator', 'coucou 😊'),
  ('44342d41-5c19-55ec-b2db-4fec4f1a35dc', '8fbe752d-967a-5fed-805a-c99322f50a8c', 10, 'fan', 'salut ! dis c''est bien toi qui réponds, pas une équipe ? 😅'),
  ('ad3c8e60-da18-5484-af58-a6bc1950344b', '410e24aa-e306-500a-a8f4-00049618b5ed', 0, 'creator', 'coucou toi 😊'),
  ('ce2cffd5-14c9-5638-8341-1be233ae798f', '410e24aa-e306-500a-a8f4-00049618b5ed', 10, 'fan', 'envoie une photo avec ton prénom écrit sur un papier et la date, comme ça je suis sûr 🙂'),
  ('9a37c3dc-c291-5798-a2b1-2ea074f9fb92', 'a5055fc0-705a-58c2-867b-edb0d47b1940', 0, 'creator', 'coucou toi 😊'),
  ('0b3e467b-c548-5398-aeaa-00c19cbca850', 'a5055fc0-705a-58c2-867b-edb0d47b1940', 10, 'fan', 'franchement arrête, je sais que c''est un bot ou une agence, aucune vraie fille répond comme ça'),
  ('7a33543c-7661-5648-8183-90e9f11416a1', '16aa7731-1db9-507f-bf6c-b4d1f7fb0307', 0, 'creator', 'tu rentres juste du taf alors ? 😊'),
  ('edebda9e-5c9c-5d93-a4d7-c3650afae43e', '16aa7731-1db9-507f-bf6c-b4d1f7fb0307', 10, 'fan', 'ouais crevé, je me pose enfin dans mon lit là'),
  ('b698ded1-e4d9-576b-a0ad-0998a4180a28', '58c4b28b-7bb3-5b3f-891d-c1d205d385b7', 0, 'creator', 't''as adoré la vidéo d''avant hein 😏'),
  ('2ca1aff2-561d-50ed-8e6f-4734e8e044ae', '58c4b28b-7bb3-5b3f-891d-c1d205d385b7', 10, 'fan', 'ouais de fou 🔥 au fait tu fais quoi ce week end ? moi je pars voir des potes à Lyon'),
  ('7d676fcf-a4a5-5924-86c6-d74ad98a42e5', 'de779109-e30c-5513-ac75-786f8ed7b5b3', 0, 'creator', 'je t''ai préparé un petit truc rien que pour toi 🙈 [MEDIA VERROUILLE - 6€]'),
  ('62db8377-0376-58e9-b46e-f569eed263bf', 'de779109-e30c-5513-ac75-786f8ed7b5b3', 10, 'fan', '6€ pour une photo ? c''est un peu cher non'),
  ('fb85de13-b1b7-5dc9-9786-a61e3ccd2c2e', '4d547aa3-f737-5ecb-9a43-86cebb000563', 0, 'creator', 'j''ai un truc qui va te plaire 🙈'),
  ('9a995d91-8d30-5f36-869d-e4399aea9465', '4d547aa3-f737-5ecb-9a43-86cebb000563', 10, 'fan', 'montre un truc gratuit d''abord pour voir si ça vaut le coup'),
  ('5c8dbb18-2885-5907-87a4-48cf059ccf41', 'eff2e8e2-1617-5c64-8bef-ef3cac8470fe', 0, 'creator', 'vu comment t''as réagi à la photo, j''ai clairement mieux pour toi 😏 [MEDIA VERROUILLE - 30€]'),
  ('4933235d-5f5e-5d35-9811-195ddfa6a258', 'eff2e8e2-1617-5c64-8bef-ef3cac8470fe', 10, 'fan', '30 ? ça fait un gros saut depuis les 6€ là'),
  ('8804d305-c90c-5b44-b0aa-517585cef25b', '182c7c50-5f00-5ea1-9f77-18228e4dcd51', 0, 'creator', 'j''ai fait un truc encore plus hot, j''ai pensé direct à toi 🔥 [MEDIA VERROUILLE - 60€]'),
  ('39abfa00-e1a4-5ada-a5a0-de76bc5bc1c8', '182c7c50-5f00-5ea1-9f77-18228e4dcd51', 10, 'fan', 'aller fais un effort sur le prix, je suis un bon client quand même'),
  ('3103b085-76ec-5ffd-801d-1003ef738e31', 'f09a9f3d-de30-5010-aaa5-606648209d31', 0, 'creator', 'j''ai un truc que je fais quasiment jamais, et là j''ai envie de te le montrer à toi 🖤 [MEDIA VERROUILLE - 150€]'),
  ('a697cc09-98cd-56dc-9eba-fa6d492174e4', 'f09a9f3d-de30-5010-aaa5-606648209d31', 10, 'fan', '150 quand même... faut que je réfléchisse, c''est beaucoup'),
  ('da5a3ebc-b5ab-5a67-b16c-13db7b2d2706', '7642c9ac-6581-551e-a098-509e55c6df6e', 0, 'creator', 't''as aimé la photo d''avant alors ? 🙈'),
  ('ed16448d-125e-5b76-a515-fe8345627af7', '7642c9ac-6581-551e-a098-509e55c6df6e', 10, 'fan', 'ouais carrément t''es canon 😍'),
  ('83ab3f1e-c591-581f-afeb-eb82f44f231a', '97a02d8b-3f83-50d7-adcf-7ecdf98655c4', 0, 'creator', 'j''ai capté que t''es plutôt du genre à te faire désirer toi 😏'),
  ('731b703c-71f4-5ddd-a54b-efb8e317bfe5', '97a02d8b-3f83-50d7-adcf-7ecdf98655c4', 10, 'fan', 'haha peut être 😅 jsais pas trop si je prends des trucs ici en vrai'),
  ('e996472f-8639-5d13-99b9-777ef5792afb', '8cb904e5-93dd-5014-91c3-fcee4cb771ab', 0, 'fan', 'Salut'),
  ('3cf79247-e052-5dea-8d66-a290a0e6dc0c', '2f4588d4-f422-5d84-8c64-209411ac5041', 0, 'fan', 'Salut'),
  ('137c5de6-4440-564b-b066-07d006912687', 'f242a465-0d8a-5cb7-8121-8a99cee3e2c2', 0, 'fan', 'Salut'),
  ('5891fdd2-968f-5af5-83aa-5b8a66504d31', 'a4574fb0-40f4-52de-a47a-c798052b07c6', 0, 'fan', 'Salut'),
  ('853c1312-04dc-5068-b7cb-3c4e251055da', 'a4574fb0-40f4-52de-a47a-c798052b07c6', 10, 'fan', 'écoute j''ai déjà trop mis ici, et en plus j''ai pas reçu les médias que j''ai payés. j''ai plus trop confiance.'),
  ('c6b592a5-41fb-5dcc-a52d-e3e513df251c', '8b26a978-9ee8-582c-ac77-46f8b72bc7af', 0, 'creator', 'Coucou toi 😊 tu fais quoi de beau ?'),
  ('0ada70f9-ea6f-54ce-8715-972948647dd1', '8b26a978-9ee8-582c-ac77-46f8b72bc7af', 10, 'fan', 'salut ! là je bricole ma moto dans le garage 🏍️'),
  ('40a064ad-e4b0-54a2-825e-eecbae0ac7da', '2ec4ee78-8a23-51ca-888c-91598286ec4f', 0, 'creator', 't''es quelqu''un de bien toi je trouve 🥰'),
  ('7ec3f172-e664-5009-a79f-dbdd057ad2b8', '2ec4ee78-8a23-51ca-888c-91598286ec4f', 10, 'fan', 'merci ça fait plaisir… en vrai moi tout ce que je veux c''est fonder une famille un jour, avoir des gosses'),
  ('3e86532d-61bc-59a1-846d-83b8ead8c6d5', 'a816c897-83ec-5ffa-b335-3cbc572bf84f', 0, 'creator', 'ça a l''air d''aller mieux ce soir non ? 😊'),
  ('33fc4b62-b4f5-5d6d-85b2-33d7c2b8040e', 'a816c897-83ec-5ffa-b335-3cbc572bf84f', 10, 'fan', 'bof… en vrai je me sens un peu seul en ce moment, depuis ma séparation c''est pas ouf'),
  ('9c9e0c88-c547-5090-8915-749ba33e9875', '84750a49-4f4a-5bd7-a0cf-0634ca7c1c95', 0, 'creator', 'raconte-moi un truc sur toi que tu dis à personne 😊'),
  ('6483373b-51ea-5a02-8426-61d3eea4a8d9', '84750a49-4f4a-5bd7-a0cf-0634ca7c1c95', 10, 'fan', 'bof j''aime pas trop parler de moi franchement'),
  ('3ea16690-41b4-53a9-b66b-b1a0bf72c7db', '79121c30-6451-518a-a255-45e2088ecc04', 0, 'creator', 'tu fais quoi là ? 😊'),
  ('473a507e-30ba-5e22-8d1b-3a8ec753acc6', '79121c30-6451-518a-a255-45e2088ecc04', 10, 'fan', 'pas grand chose, je discute avec 2-3 personnes ici comme toi 😅'),
  ('3df2691c-f68f-5079-8536-4edd33846e60', 'cfb40e8b-91f9-5a40-bf77-22199f0cf925', 0, 'creator', 'té revenu toi 😏'),
  ('73c0eeef-c136-5c4e-bd6d-d43af1373122', 'cfb40e8b-91f9-5a40-bf77-22199f0cf925', 10, 'fan', 'ouais désolé j''étais pas trop dispo hier'),
  ('7d6f67c2-11f0-51fb-9895-15e32408822a', '0db1f26e-e364-52c7-845d-8697a7510e9b', 0, 'creator', 'coucou toi 🥰'),
  ('75533586-ef4f-5917-9167-28d99411a7a7', '0db1f26e-e364-52c7-845d-8697a7510e9b', 10, 'fan', 'cc t''es chaude là ? j''ai trop envie de toi, montre-moi un truc 🔥'),
  ('c1120384-b1e0-535c-b793-94f86adb7f83', '31fabd2e-a33d-5aaa-8b23-a9f5f283d7bf', 0, 'creator', 't''aurais pu me répondre plus vite quand même…'),
  ('6cea0d0a-297c-5ac9-bbed-27b6c0ce0599', '31fabd2e-a33d-5aaa-8b23-a9f5f283d7bf', 10, 'fan', 'oh ça va hein, tu te prends un peu trop la tête là, ça commence à me saouler'),
  ('159dbe28-d1a6-5595-86b1-68860603142e', 'ff2bf980-3565-5fea-a3e2-3a2a8f74ed87', 0, 'creator', 'coucou toi 🥰'),
  ('5b4346e1-8b7b-5943-9591-0740eeda3ed9', 'ff2bf980-3565-5fea-a3e2-3a2a8f74ed87', 10, 'fan', 'écoute franchement j''ai claqué beaucoup trop d''argent ici… je crois que je vais arrêter tout ça, ça rime à rien'),
  ('cf4a077b-a97f-5718-8b7f-06e38b909fc6', '53bd9cda-61fd-5103-8582-774c1720d883', 0, 'fan', 'voilà c''est fait, je viens de payer 💸'),
  ('d0560034-6540-5d20-8a4c-8bf94297ef05', '287a3f5d-efe7-5b75-ad22-aaa96caecf62', 0, 'fan', 'franchement ça me fait du bien de parler avec toi le soir'),
  ('3748e9ac-3538-5440-a92d-2fbd1d835c4c', '287a3f5d-efe7-5b75-ad22-aaa96caecf62', 10, 'creator', 'avec plaisir 🖤 elle a été comment ta journée ?'),
  ('f3d6f7c5-09f3-5927-990b-ca5e6c05a6a1', '287a3f5d-efe7-5b75-ad22-aaa96caecf62', 20, 'fan', 'crevé, je refais la salle de bain de mes parents en ce moment, un vrai chantier 😅'),
  ('ff9a11c9-3818-5e1e-a288-a152eb57df48', '287a3f5d-efe7-5b75-ad22-aaa96caecf62', 30, 'creator', 'courage 🙈 tu me raconteras quand ce sera fini'),
  ('9db2714e-113e-5ca3-aef3-62277cd17bf5', '1a3ed4ff-d033-5ffa-8e54-4187888acbd3', 0, 'fan', 'faut que je te dise, je vais devoir lever le pied un peu ce mois-ci, niveau budget c''est chaud'),
  ('87027673-d234-5cec-8dce-27fed6e1a968', '1e0a305b-3235-59fe-a8d3-bde28e91bcd9', 0, 'fan', 'franchement j''ai l''impression que tu me parles que quand y''a de l''argent à la clé. le reste du temps t''en as rien à foutre de moi'),
  ('4511fe3b-ab51-5cbb-836e-e92cb4445cae', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 0, 'creator', 'coucou toi 😊 ta soirée ?'),
  ('edc7d186-8391-5e77-8f61-a44f8e414a53', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 10, 'fan', 'tranquille, je regarde un match d''un œil'),
  ('d670fe57-7845-5f20-a591-f2928bb961a4', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 20, 'creator', 'ah t''es foot toi ?'),
  ('638a2c52-78c0-5504-aea1-40d037476005', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 30, 'fan', 'bof, je regarde surtout parce que je bricole à côté'),
  ('689c0122-6b95-54e4-825d-386d7c2cdc6d', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 40, 'creator', 'tu bricoles quoi ?'),
  ('60462a73-7509-5022-abac-8ac7f1d4d521', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 50, 'fan', 'ma moto, une vieille Honda 750 que je retape depuis 2 ans, c''est mon bébé 😅'),
  ('c2a7363a-9f86-58ce-b694-a3b625f783db', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 60, 'creator', 'haha t''en parles avec des étoiles dans les yeux'),
  ('3375b8b4-ab64-5806-97ab-19aadf1e2253', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 70, 'fan', 'clairement, mon rêve ce serait de partir faire les cols des Alpes avec cet été'),
  ('2c7afa39-91cd-5416-9eb1-67a95f623d42', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 80, 'creator', 'ça donne envie 🥹'),
  ('d0615617-7942-5066-aa20-1b7f9bba8874', 'ae3338a9-1a10-54cc-9b81-9d85072a4b6e', 90, 'fan', 'ouais bon aller je retourne au cambouis, bonne nuit toi'),
  ('ae32d20f-8710-5ba5-937d-a861000cca17', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 0, 'creator', 'coucou 😊 quoi de neuf ?'),
  ('26e890e2-6b61-5cc3-95af-41937ca89f94', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 10, 'fan', 'hâte que le week-end arrive, la semaine est longue'),
  ('52e4b13b-8f39-5b06-acca-89f77464ceee', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 20, 'creator', 'je te comprends 😅 t''as des projets ?'),
  ('6ec580ae-9487-58dd-b88e-99632a61510e', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 30, 'fan', 'rien de fou mais j''ai adopté un chiot y''a 10 jours, un petit Filou croisé labrador. il me bouffe déjà toutes mes chaussures 😂'),
  ('ef2bde06-e9fe-544f-ab10-986b88ded262', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 40, 'creator', 'ohh trop chou 🥹'),
  ('52efd7b4-b76c-5416-bde4-98fda049b61f', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 50, 'fan', 'ouais je suis complètement gaga, je saoule mes potes à leur envoyer que des photos de lui'),
  ('c7a4f9fb-4941-57e4-9f39-2d3503e23369', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 60, 'creator', 'haha vrai papa poule'),
  ('200d1066-ced8-5dcb-9f39-2f57cfef16e0', '813a791c-ad50-5c0a-8e7a-2dc3be9cef6f', 70, 'fan', 'grave. bon je file le sortir avant l''accident, à plus toi !'),
  ('20d4ad2a-6c39-50ac-a161-47847b075854', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 0, 'fan', 'encore une journée de réunions à la con, j''en peux plus de ce taf'),
  ('d4e9dfdb-4d93-5407-b5fb-550f8628b8e0', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 10, 'creator', 'c''est quoi ton taf déjà ?'),
  ('e6c339a9-e887-5475-aaf7-4e0af10fe905', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 20, 'fan', 'cadre dans l''assurance, le vide total, je fais ça pour le salaire'),
  ('9caebe7a-5fe7-5833-b6ea-bcf029719c16', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 30, 'creator', 'et tu ferais quoi si tu pouvais ?'),
  ('95de3f16-ed7b-5707-bdb5-1973a8ba6e34', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 40, 'fan', 'franchement ? j''ai un rêve un peu con... ouvrir une petite brasserie, cuisine simple, produits du coin. je mets de l''argent de côté en douce depuis 2 ans'),
  ('f05f2fa3-b083-5eda-8c7e-ce8c6c24b70e', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 50, 'creator', 'c''est pas con du tout 🥹'),
  ('ec0ddacc-7caa-5088-8e0b-d1b76875b3ad', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 60, 'fan', 'ma femme le sait même pas, c''est mon jardin secret ça'),
  ('4c92a775-0d7c-5cf3-ba27-36676ce0892b', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 70, 'creator', 'j''adore que tu me le confies'),
  ('b592eb31-ec77-55b7-9568-f54d80d14a69', 'e17ebcc6-6ac1-5332-8662-34cfa9504733', 80, 'fan', 'ouais bon faut que je dorme, grosse réu demain 🙄'),
  ('4f673b3e-0d63-51ee-9c3a-7f093dc96619', '013263dc-9e21-5b2f-8a7c-374178a72897', 0, 'fan', 'wesh ça va ? t''as vu le match hier ?'),
  ('358fa216-c661-5a2f-ade9-64777b838797', '013263dc-9e21-5b2f-8a7c-374178a72897', 10, 'creator', 'haha j''y connais rien 😅'),
  ('aaeffd12-0961-5fa7-9bc8-eba58ef11e00', '013263dc-9e21-5b2f-8a7c-374178a72897', 20, 'fan', 'l''OL une catastrophe cette équipe je te jure. bref. sinon moi je suis à fond cette semaine'),
  ('28929a12-f947-50c4-982a-220bc5cc87ef', '013263dc-9e21-5b2f-8a7c-374178a72897', 30, 'creator', 'à fond ?'),
  ('be880c89-f461-58d8-806d-5c5b0f71f324', '013263dc-9e21-5b2f-8a7c-374178a72897', 40, 'fan', 'ma fille a 5 ans samedi, je lui organise un goûter avec ses copines, j''ai commandé un gâteau licorne 😅'),
  ('4fd6c4be-a4c1-528e-85de-6cdeeeb08328', '013263dc-9e21-5b2f-8a7c-374178a72897', 50, 'creator', 'aww un gâteau licorne 🥹'),
  ('cd48ae7f-8ad1-5c1f-a33d-13e9551f918b', '013263dc-9e21-5b2f-8a7c-374178a72897', 60, 'fan', 'ouais je veux que ce soit parfait'),
  ('d6d84e12-5419-555e-ad06-25e9f74f10ef', '013263dc-9e21-5b2f-8a7c-374178a72897', 70, 'creator', 'elle a de la chance'),
  ('627c886b-36b6-5196-9278-49bab87c34b5', '013263dc-9e21-5b2f-8a7c-374178a72897', 80, 'fan', 'bon et sinon toi le sport ça te branche pas du tout ?'),
  ('9cbbaa2d-fccb-5295-9ec9-2c346bc20cc2', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 0, 'creator', 'et ta journée ? 😊'),
  ('5f3f6bc7-e40f-5df4-9d96-9c058afdb3cf', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 10, 'fan', 'crevé, grosse journée au garage'),
  ('3c9fe3e6-dbb7-56aa-abb9-1f29ee7dbb0f', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 20, 'creator', 't''es mécano ?'),
  ('9e63b9a1-b630-554e-af8d-222a770369e3', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 30, 'fan', 'gérant, j''ai mon garage. je bosse comme un dingue mais j''adore ce que je fais'),
  ('b152cdff-ea95-5328-8bea-4eee1d727998', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 40, 'creator', 'c''est cool d''aimer son taf'),
  ('5c236a7e-bcfa-5473-9d81-7b88d8acd388', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 50, 'fan', 'ouais. le seul qui râle c''est mon chien Titan, un gros berger, je le sors moins qu''avant du coup il me fait la gueule 😅'),
  ('48264de2-555d-5aea-893c-cb0cac2dfcdd', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 60, 'creator', 'haha pauvre Titan'),
  ('d1140fdc-7096-5db9-bd9e-4ba0fb18ae13', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 70, 'fan', 'ouais c''est mon co-pilote, il passe la journée à dormir dans un vieux pneu au fond de l''atelier le fainéant'),
  ('843b6ec1-e5a8-5b50-9e28-725b1d19abab', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 80, 'creator', 'trop mignon 🥹'),
  ('b1b2f405-c73e-5180-9559-84989a5c4c2e', 'cc09fa5c-f4c9-5e05-b845-39ffd5cac864', 90, 'fan', 'bon aller je file, bonne nuit toi'),
  ('5ab33ffe-d189-5428-a104-028b6bbd7411', '99f03575-a48b-5123-a773-8bf04ba34263', 0, 'fan', 'yo ça va ? j''ai emménagé à Lyon y''a 2 mois, je découvre encore'),
  ('742fcb1e-36d5-5485-aea2-c21a8c704b8c', '99f03575-a48b-5123-a773-8bf04ba34263', 10, 'creator', 'ça te plaît ?'),
  ('9dab74d0-83fd-50d0-ae0e-bcbe05fd4728', '99f03575-a48b-5123-a773-8bf04ba34263', 20, 'fan', 'grave, et surtout je me suis remis à la photo, la ville c''est un terrain de jeu de ouf'),
  ('d394abb3-cb1b-5637-9b81-5f93fee7baa4', '99f03575-a48b-5123-a773-8bf04ba34263', 30, 'creator', 'ah tu fais de la photo ?'),
  ('812bf6cc-e0f6-503b-8dcd-6b463ddd713e', '99f03575-a48b-5123-a773-8bf04ba34263', 40, 'fan', 'ouais de l''argentique. le week-end je pars marcher des heures et je shoote, les quais au coucher de soleil c''est une tuerie'),
  ('aef6d05a-bdaf-5c51-97a9-fd8e97b0475c', '99f03575-a48b-5123-a773-8bf04ba34263', 50, 'creator', 'ça doit être magnifique 🥹'),
  ('682f804b-18e7-5145-bc11-6aa4e565df6a', '99f03575-a48b-5123-a773-8bf04ba34263', 60, 'fan', 'j''ai fait des clichés dont je suis super fier ce week-end. bon je te laisse, faut que je développe tout ça'),
  ('26a997c2-8030-5c33-be98-a05f3ba355d3', '11962dbe-75b4-5597-8318-01b364765d41', 0, 'fan', 'coucou, tranquille ce soir ?'),
  ('98bce2ab-abf6-529d-af7c-5a613e05f41b', '11962dbe-75b4-5597-8318-01b364765d41', 10, 'creator', 'ouais et toi ?'),
  ('1619ef2f-b972-5c01-8ba1-3d2056474734', '11962dbe-75b4-5597-8318-01b364765d41', 20, 'fan', 'nickel. j''ai testé un resto ce midi, bof franchement'),
  ('ee0f516c-48dc-5495-9393-824d1af50284', '11962dbe-75b4-5597-8318-01b364765d41', 30, 'creator', 'ah dommage'),
  ('56c0cc18-0274-5e0e-ac2f-1ef21a4ffe5a', '11962dbe-75b4-5597-8318-01b364765d41', 40, 'fan', 'ouais. du coup ce week-end je me fais mes propres pizzas, je me suis acheté un four à pizza il y a un mois, une vraie passion 😅'),
  ('624af18e-5e0d-5261-890a-1208836f51da', '11962dbe-75b4-5597-8318-01b364765d41', 50, 'creator', 'haha un four à pizza rien que ça'),
  ('4762c59a-acd6-50e8-87ec-4900b88571cd', '11962dbe-75b4-5597-8318-01b364765d41', 60, 'fan', 'ouais je fais ma pâte maison, 72h de pousse, je deviens relou avec ça mes potes se foutent de moi'),
  ('11825d0f-4f22-5cdf-bdc6-b52053a772e9', '11962dbe-75b4-5597-8318-01b364765d41', 70, 'creator', 't''es un vrai pizzaiolo'),
  ('895c3c24-24d8-5444-9cbe-c492d69d2e9a', '11962dbe-75b4-5597-8318-01b364765d41', 80, 'fan', 'carrément. bon je vais dormir, réveil tôt demain'),
  ('91498d32-b740-529e-aa40-545eb431f8d4', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 0, 'fan', 'salut la plus belle 😏 prête à supporter un mec au bout de sa vie ?'),
  ('0af9bcb7-b2be-5c7e-8d32-acbeeb7f4d32', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 10, 'creator', 'haha pourquoi au bout de ta vie ?'),
  ('159cfea9-9ba0-5e3e-92ee-47534def23ab', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 20, 'fan', 'nan je déconne... enfin ma boîte a coulé y''a 6 mois donc je me cherche un peu, mais bon'),
  ('90ea13c6-edfd-5df7-9e5d-6c6c0e55b58f', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 30, 'creator', 'aïe'),
  ('09d9f3d2-3046-5841-a00d-b752346831f6', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 40, 'fan', 'ça va ça va. le truc qui me sauve en ce moment c''est mon groupe, je joue de la guitare dans un groupe de reprises rock'),
  ('dc72ae24-bf55-5f3f-b73c-2b50f0fef9d7', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 50, 'creator', 'ah cool !'),
  ('9a2f7f4e-1bab-55da-8d4a-0ce203716db2', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 60, 'fan', 'et on a notre tout premier concert dans un bar samedi, je stresse mais j''ai trop hâte, ça fait des années que j''attends ça'),
  ('948fdd4d-643e-57ef-896b-9c66b72eb701', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 70, 'creator', 'waw un concert 🥹'),
  ('b5b5cbe1-e118-5444-bcad-a55a790a4a30', '7d3b57d3-1157-5d94-aa4f-fc68624b9ede', 80, 'fan', 'ouais. bon je file répéter, à plus toi'),
  ('ee513af3-265a-5ed9-b448-f0be20b8b1cc', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 0, 'fan', 'salut, désolé je suis un peu à plat en ce moment'),
  ('0b83410b-0841-5b89-946b-fb05b09e260e', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 10, 'creator', 'ça va ? 🥺'),
  ('3ba91764-b9db-5986-be0b-302b80627d8a', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 20, 'fan', 'bof, je me suis séparé y''a 3 semaines, c''est pas la joie'),
  ('aa9bf26a-d5a1-5f52-aba8-e9a61791759f', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 30, 'creator', 'aïe, je suis désolée'),
  ('bb8eef3d-a707-54f1-9471-26847a76da59', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 40, 'fan', 'ouais... mais bon j''essaie de me changer les idées. je me suis inscrit à mon premier marathon, celui de Paris dans 2 mois, je cours tous les matins'),
  ('d02d1ead-508f-5f31-a60d-20584c9bfc12', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 50, 'creator', 'ah c''est une super idée !'),
  ('ffc807b2-9801-5cee-825b-9a3d87e02459', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 60, 'fan', 'ça me vide la tête. hier j''ai tenu 15 km d''une traite, j''étais super fier de moi'),
  ('f802090b-2aa2-50cb-98f3-e16302787c59', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 70, 'creator', 'waw 15 km 🥹'),
  ('e0d27371-a1b1-54cc-8e5d-3d8b11970974', '43705dd4-36dd-5826-9cee-a0379f5cea7a', 80, 'fan', 'ouais petit à petit. bon je vais me coucher, réveil 6h pour courir, bonne nuit'),
  ('8f5d8a55-263a-5a6e-a1a6-29dac8153a1a', '76a6efa6-3a22-5011-b477-595df55fccf4', 0, 'fan', 'salut. je te préviens je suis pas du genre à raconter ma life'),
  ('fc45ffc5-10b4-5d2d-8540-a7d0f1a3f027', '76a6efa6-3a22-5011-b477-595df55fccf4', 10, 'creator', 'haha ok, pas de souci 😊'),
  ('86f007f6-9597-5760-b31c-4e126fface13', '76a6efa6-3a22-5011-b477-595df55fccf4', 20, 'fan', 'voilà. sinon ça va, boulot, sport, la routine'),
  ('a4b6e132-11b7-54d0-a8e1-7d4405a0bf79', '76a6efa6-3a22-5011-b477-595df55fccf4', 30, 'creator', 'tu fais quoi comme sport ?'),
  ('28a9e916-5728-590c-9705-3536764b2d75', '76a6efa6-3a22-5011-b477-595df55fccf4', 40, 'fan', 'muscu. et sinon le seul truc qui me détend vraiment c''est la musique, je collectionne les vinyles de rap old school, j''en ai genre 400'),
  ('64113769-56b7-58f8-8125-fd65d3ca1389', '76a6efa6-3a22-5011-b477-595df55fccf4', 50, 'creator', 'ah carrément, 400 vinyles !'),
  ('9c0535c8-cd28-5c6c-959c-326e69678a25', '76a6efa6-3a22-5011-b477-595df55fccf4', 60, 'fan', 'ouais c''est mon délire perso, j''en parle jamais d''habitude. enfin bref, tu me montres un truc ou pas ? 😏');

insert into public.training_case_arena_slots (id, case_id, position, ref_case_id, display_name) values
  ('b159a619-91b4-5418-9b7f-52eff05e8248', 'df783777-cbe9-51fb-b50d-336e1c067aa2', 0, 'e9b2a4de-4a48-52a9-af23-ec833ad005a4', 'Tony'),
  ('bbaf95e5-53b3-55f3-9ad8-37f4b16ddadb', 'df783777-cbe9-51fb-b50d-336e1c067aa2', 10, '2b09cdcc-11de-51cd-885b-7cf18af4c905', 'Rachid'),
  ('ecd3f15a-be36-55ab-86f4-cc10c8f8cd6b', 'df783777-cbe9-51fb-b50d-336e1c067aa2', 20, '7e431e5b-a9f8-545c-8935-88425f77e0cf', 'Greg'),
  ('1df2940b-746e-5176-a209-693598ffea72', 'df783777-cbe9-51fb-b50d-336e1c067aa2', 30, 'eb5d1c00-71c9-57fa-a063-ce51a6ab04c4', 'Momo'),
  ('c5b91d95-3468-5751-8544-01e2f0e96ba4', 'df783777-cbe9-51fb-b50d-336e1c067aa2', 40, '8e44cc44-c251-592e-b720-c492c5c80860', 'Fabrice'),
  ('514378e6-4112-505c-834e-6b3cb602c810', '17b98a0d-1abd-5942-a0e2-eaa78ac8b718', 0, '67f011e7-d093-5ba5-b9ee-f58baa46dc1b', 'Nicolas'),
  ('26152b43-f518-5429-ba63-cb4276518826', '17b98a0d-1abd-5942-a0e2-eaa78ac8b718', 10, 'f8714616-f60b-5c1e-a003-f5dab66c0ac2', 'Steed'),
  ('f4c0c85d-d970-5ec7-b27e-e8d14584dd7e', '17b98a0d-1abd-5942-a0e2-eaa78ac8b718', 20, 'accf73d8-c56a-5789-8daa-63abc5aacd70', 'Jean-Mi'),
  ('83f6a580-cb56-5ef5-81db-f802846c3977', '17b98a0d-1abd-5942-a0e2-eaa78ac8b718', 30, '039f159e-a003-5320-87cf-3ad951a58a06', 'Karim'),
  ('7523d816-bf67-5313-867b-aeca4fb30dac', '17b98a0d-1abd-5942-a0e2-eaa78ac8b718', 40, 'b21dbf1d-29d6-5389-8b40-d50518c0d7de', 'Ludo'),
  ('a05f4ca3-e032-5d3c-ae70-2ca07f56489c', '76f14ade-267b-5d30-9506-ac42e8272631', 0, '3ddd288c-06c4-57f0-a75c-7087f6a10bc1', 'Éric'),
  ('dabc7015-e7cf-5cea-8830-42deb3bb8c7b', '76f14ade-267b-5d30-9506-ac42e8272631', 10, 'aa6d3bfd-37eb-54d1-81af-3c466e905c96', 'Cédric'),
  ('4e9e86d7-93db-564f-abe0-4fbf371324b8', '76f14ade-267b-5d30-9506-ac42e8272631', 20, '42647808-a614-5114-aed3-ea6139c2fed4', 'Momo'),
  ('06cbf178-b41a-5409-a7d3-90f8b66ef96b', '76f14ade-267b-5d30-9506-ac42e8272631', 30, '4061be14-1030-5c70-92b2-d1ea35bf3f7b', 'Patrick'),
  ('fa03c627-9304-5b9c-ac82-0042e0222d19', '76f14ade-267b-5d30-9506-ac42e8272631', 40, 'c9d04a65-9f5c-57a7-a7d7-a7ad2e0fe6e3', 'Yanis'),
  ('b7d449fe-73e9-553e-9238-d7e212f4c1bc', '16fa22e9-4f8b-570d-9a05-dc4a6040a966', 0, '0a353b6f-6f77-5f5a-9905-44dd10d9b83b', 'Bruno'),
  ('e1411d47-5ce2-5b9b-9da2-0d6b5bef3ed2', '16fa22e9-4f8b-570d-9a05-dc4a6040a966', 10, 'a5caef4c-6892-51c4-b258-a0cc6eb8f766', 'Kevin'),
  ('132dacb9-4dcc-50de-b3f4-ead616381c81', '16fa22e9-4f8b-570d-9a05-dc4a6040a966', 20, '289c9b93-89a6-5276-b734-771301581a8a', 'Sofiane'),
  ('4b46f233-8d46-5e83-9066-7c321bc6e441', '16fa22e9-4f8b-570d-9a05-dc4a6040a966', 30, '8da6b352-ba56-5383-9ecd-72605a9e1531', 'Damien'),
  ('1749285f-d4b9-57cc-a6e2-d70f48692c25', '16fa22e9-4f8b-570d-9a05-dc4a6040a966', 40, 'a5055fc0-705a-58c2-867b-edb0d47b1940', 'Pascal'),
  ('614d149d-5e96-5b09-a990-0f1ddff12af5', '891bc39a-7ae5-5113-8dae-e88c2d24aa36', 0, '2f4588d4-f422-5d84-8c64-209411ac5041', 'Serge'),
  ('9f0c9b93-67ef-53c2-af05-8b86e7de3613', '891bc39a-7ae5-5113-8dae-e88c2d24aa36', 10, 'a4574fb0-40f4-52de-a47a-c798052b07c6', 'Bernard'),
  ('6018bdb4-784f-57c6-bcb4-8e993a1938ea', '891bc39a-7ae5-5113-8dae-e88c2d24aa36', 20, 'a816c897-83ec-5ffa-b335-3cbc572bf84f', 'Vincent'),
  ('24b3c22a-3320-5540-87d9-212ba8f6e3ed', '891bc39a-7ae5-5113-8dae-e88c2d24aa36', 30, '79121c30-6451-518a-a255-45e2088ecc04', 'Hervé'),
  ('558b9165-a43b-5fdf-bef5-a98824095135', '891bc39a-7ae5-5113-8dae-e88c2d24aa36', 40, '31fabd2e-a33d-5aaa-8b23-a9f5f283d7bf', 'Loïc');

insert into public.training_case_boss_fans (id, case_id, position, code, name, age, job, city, color, persona, opening_message, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails) values
  ('c4ce5da9-0f39-5d37-bb88-6d4ac40521b5', '5f4cd404-728a-54dd-ba89-14a944fc5c86', 0, 'kevin', 'Kevin', 34, 'plombier', 'Lyon', '#ff6b9d', 'Méfiant, écrit court, il élude tes questions. Une brique dure à ouvrir.', 'ouais salut', 60, 6, 'dès le 1er push, sur le 6€ (« c''est cher pour une photo »)', 'en plein sexting', 'au milieu du sexting, il lâche « faudrait qu''on se voie »', '2 fois pendant le setting (il repart sur son taf, il élude), puis 3 fois pendant le sexting (petites digressions)'),
  ('5162e578-a657-5af7-96cc-f7919055a883', '5f4cd404-728a-54dd-ba89-14a944fc5c86', 10, 'thomas', 'Thomas', 27, 'étudiant', 'Toulouse', '#31d39a', 'Petit budget, il marchande tout par réflexe. Veut du concret avant de payer.', 'coucou, c''est payant tout ici ?', 60, 30, 'sur la 1ère vidéo à 30€ (« ça fait beaucoup d''un coup »)', 'direct pendant le sexting', 'tôt, en plein sexting : « et si on se voyait pour de vrai ? »', '1 fois en setting, puis 2 fois au moment des pushs (il marchande, tempère)'),
  ('ac3aa219-9e12-585a-a7be-7d65bfe7c05f', '5f4cd404-728a-54dd-ba89-14a944fc5c86', 20, 'julien', 'Julien', 52, 'comptable', 'Nantes', '#9a6bff', 'Affectif, seul depuis son divorce, il se raconte. Cherche une vraie connexion.', 'bonsoir toi 🙂 ça fait du bien de parler à quelqu''un ce soir', 150, 60, 'sur le 60€, un peu de résistance affective (« tu me fais payer pour ça ? »)', 'pendant le relationnel final', 'après les ventes, quand ça devient tendre : « on pourrait se rencontrer un jour toi et moi »', '2 fois en setting (il déballe sa vie, son divorce), 1 fois pendant le sexting'),
  ('a1718b85-6e8a-5d5d-a7e7-e8b8962e2750', '5f4cd404-728a-54dd-ba89-14a944fc5c86', 30, 'marc', 'Marc', 41, 'cadre', 'Paris', '#ffb02e', 'Pressé, il veut aller au but, zappe le blabla. Du budget mais impatient.', 'salut, bon tu proposes quoi concrètement ?', 500, 150, 'sur le gros palier 150€ (« 150 c''est beaucoup, faut voir »)', 'pendant le relationnel final', 'à la fin, une fois calmé : « bon et dans la vraie vie, on se croise quand ? »', 'il va trop vite dès le setting (veut sauter la qualif), puis digresse 2 fois pendant le sexting'),
  ('95347dbe-52e4-5813-8195-747f2933bdf0', '5f4cd404-728a-54dd-ba89-14a944fc5c86', 40, 'alex', 'Alex', 38, 'commercial', 'Paris', '#ff3b52', 'Négociateur pro, il teste tout, doute de tout. Le fan le plus dur du lot.', 'salut, on va voir ce que tu vaux 😏', 500, 500, 'sur le tout dernier média à 500€ (il marchande jusqu''au bout)', 'direct, en plein sexting', 'il pousse tôt pour du réel, pour te déstabiliser', 'partout : il doute en setting, casse une transition, digresse 2 fois en sexting');

-- ============================================================================
-- [ex-0116] 0116_training_secrets.sql
-- ============================================================================

-- 0116 — Secrets du catalogue de formation en tables ADMIN SEUL (revue finale du Catalogue,
-- 2026-08-18). La RLS 0113 est par ligne : tout membre ayant le droit de face `formation`
-- pouvait lire fan_brief / expected / scoring_notes / champs cachés des fans via PostgREST.
-- On DÉPLACE ces colonnes dans trois tables miroirs lisibles/écrites par les admins seulement ;
-- le moteur IA (lib/ai, serveur) les lit avec le client service-role. Données recopiées puis
-- colonnes sources supprimées (la 0115 — seed — reste telle quelle : c'est cette migration qui
-- transporte ses données).

create table public.training_case_secrets (
  case_id   uuid primary key references public.training_cases(id) on delete cascade,
  fan_brief text,   -- consigne du fan pour l'IA (solo) — jamais montrée au chatter
  expected  text    -- « ce qui était attendu » (solo) — révélé APRÈS la notation
);
create table public.training_module_secrets (
  module_id     uuid primary key references public.training_modules(id) on delete cascade,
  scoring_notes text  -- consigne de notation transmise à l'IA
);
create table public.training_boss_fan_secrets (
  fan_id         uuid primary key references public.training_case_boss_fans(id) on delete cascade,
  budget_cap     integer check (budget_cap >= 0),
  nego_threshold integer check (nego_threshold >= 0),
  nego_where     text,
  meet_when      text,
  meet_where     text,
  derails        text
);

-- Copie des données (0113 + seed 0115).
insert into public.training_case_secrets (case_id, fan_brief, expected)
select id, fan_brief, expected from public.training_cases
where fan_brief is not null or expected is not null;
insert into public.training_module_secrets (module_id, scoring_notes)
select id, scoring_notes from public.training_modules where scoring_notes is not null;
insert into public.training_boss_fan_secrets (fan_id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails)
select id, budget_cap, nego_threshold, nego_where, meet_when, meet_where, derails
from public.training_case_boss_fans;

-- Colonnes sources : le check solo référençait fan_brief/expected → recréé sur fan_name seul
-- (fan_brief/expected restent obligatoires pour un solo CÔTÉ ACTION, cf. Zod caseForm).
alter table public.training_cases drop constraint training_cases_solo_fields;
alter table public.training_cases drop column fan_brief, drop column expected;
alter table public.training_cases add constraint training_cases_solo_fields
  check ((kind = 'solo') = (fan_name is not null));
alter table public.training_modules drop column scoring_notes;
alter table public.training_case_boss_fans
  drop column budget_cap, drop column nego_threshold, drop column nego_where,
  drop column meet_when, drop column meet_where, drop column derails;

alter table public.training_case_secrets enable row level security;
alter table public.training_module_secrets enable row level security;
alter table public.training_boss_fan_secrets enable row level security;

create policy training_case_secrets_admin on public.training_case_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_module_secrets_admin on public.training_module_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy training_boss_fan_secrets_admin on public.training_boss_fan_secrets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ============================================================================
-- [ex-0117] 0117_training_sessions.sql
-- ============================================================================

-- 0117 — Entraînement : sessions (un cas joué), threads (1 solo / 5 défi / 5 boss), messages,
-- notation par thread + par axe, signalements, traçabilité des appels IA.
-- Spec : docs/superpowers/specs/2026-08-18-formation-entrainement-design.md §3.2, §3.4.
-- RLS : le chatter voit/écrit SES sessions ; encadrants (has_page('frm-suivi'), admin inclus) lisent tout
-- (Overview non cloisonné, décidé 2026-08-18) ; scores et ai_calls s'écrivent en service-role
-- depuis les Server Actions (aucune policy d'écriture authenticated). `session_id` est
-- dénormalisé sur training_messages : RLS à un niveau + index direct (table la plus lue).

create table public.training_sessions (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  case_id           uuid not null references public.training_cases(id) on delete restrict,
  module_id         uuid not null references public.training_modules(id) on delete restrict,
  kind              text not null check (kind in ('solo', 'arena', 'boss')),
  status            text not null default 'active' check (status in ('active', 'scored', 'failed', 'abandoned')),
  -- PARTIE VISIBLE du cas au moment joué : { code, title, phase, difficulty, context, objective,
  -- objectiveLabel, targetLine, maxTurns, reactionMaxS, isSale, moduleCode, moduleTitle } — jamais de secret.
  case_snapshot     jsonb not null,
  total             smallint check (total between 0 and 100),
  objective_reached boolean,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  scored_at         timestamptz
);
create index training_sessions_profile_started_idx on public.training_sessions (profile_id, started_at desc);
create index training_sessions_case_idx on public.training_sessions (case_id);
create index training_sessions_module_idx on public.training_sessions (module_id);
create index training_sessions_scored_idx on public.training_sessions (scored_at desc) where status = 'scored';
-- une seule session ACTIVE par chatter
create unique index training_sessions_one_active_idx on public.training_sessions (profile_id) where status = 'active';

create table public.training_threads (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.training_sessions(id) on delete cascade,
  position     smallint not null,
  ref_case_id  uuid references public.training_cases(id) on delete restrict,        -- défi : le solo rejoué
  boss_fan_id  uuid references public.training_case_boss_fans(id) on delete restrict, -- boss : le fan
  fan_name     text not null check (length(fan_name) between 1 and 30),
  status       text not null default 'open' check (status in ('open', 'done', 'lost')),
  lost_reason  text check (lost_reason is null or lost_reason ~ '^(timeout|[a-z_]{2,20})$'),
  turns_used   smallint not null default 0 check (turns_used >= 0),
  max_turns    smallint not null check (max_turns between 1 and 50),
  next_due_at  timestamptz,   -- chrono : le chatter doit répondre avant (null = pas de chrono en cours)
  unique (session_id, position)
);
create index training_threads_ref_case_idx on public.training_threads (ref_case_id);
create index training_threads_boss_fan_idx on public.training_threads (boss_fan_id);

create table public.training_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  thread_id   uuid not null references public.training_threads(id) on delete cascade,
  position    smallint not null,
  speaker     text not null check (speaker in ('chatter', 'fan')),
  body        text not null check (length(body) between 1 and 1000),
  media_price integer check (media_price is null or media_price between 1 and 10000),
  visible_at  timestamptz not null default now(),   -- révélation différée (défi/boss)
  created_at  timestamptz not null default now(),
  unique (thread_id, position)
);
create index training_messages_session_idx on public.training_messages (session_id);

create table public.training_thread_scores (
  thread_id         uuid primary key references public.training_threads(id) on delete cascade,
  total             smallint not null check (total between 0 and 100),
  objective_reached boolean not null,
  capped            boolean not null default false,
  comment           text not null,
  moments           jsonb not null default '[]'::jsonb,
  scored_at         timestamptz not null default now()
);
create table public.training_thread_axis_scores (
  thread_id uuid not null references public.training_threads(id) on delete cascade,
  axis_key  text not null,
  axis_name text not null,
  score     smallint not null check (score between 0 and 100),   -- 0-25 pour les axes de module, 0-100 pour les étapes du boss
  primary key (thread_id, axis_key)
);

create table public.training_reports (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  message     text not null check (length(message) between 1 and 2000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index training_reports_session_idx on public.training_reports (session_id);
create index training_reports_profile_idx on public.training_reports (profile_id);
create index training_reports_resolved_by_idx on public.training_reports (resolved_by);
create index training_reports_open_idx on public.training_reports (created_at desc) where resolved_at is null;

create table public.training_ai_calls (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.training_sessions(id) on delete cascade,
  thread_id         uuid references public.training_threads(id) on delete set null,
  kind              text not null check (kind in ('fan', 'score')),
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  latency_ms        integer not null default 0,
  ok                boolean not null default true,
  created_at        timestamptz not null default now()
);
create index training_ai_calls_session_idx on public.training_ai_calls (session_id);
create index training_ai_calls_thread_idx on public.training_ai_calls (thread_id);
create index training_ai_calls_created_idx on public.training_ai_calls (created_at desc);

alter table public.training_sessions enable row level security;
alter table public.training_threads enable row level security;
alter table public.training_messages enable row level security;
alter table public.training_thread_scores enable row level security;
alter table public.training_thread_axis_scores enable row level security;
alter table public.training_reports enable row level security;
alter table public.training_ai_calls enable row level security;

-- Sessions : propriétaire, encadrant, admin lisent ; propriétaire écrit ; admin peut mettre à jour (rescore).
-- « Encadrant » = has_page('frm-suivi') (droit Overview de la face Formation, admin inclus) — PAS is_manager()
-- (rôle manager seul) : un sous-manager ou un policier à qui on donne Suivi doit lire les sessions (spec §7).
create policy training_sessions_read on public.training_sessions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_sessions_insert on public.training_sessions for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

-- Threads : héritent de la session (exists — même patron que police_report_lines, 0071).
create policy training_threads_read on public.training_threads for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_threads_write on public.training_threads for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Messages : session_id dénormalisé → un seul niveau.
create policy training_messages_read on public.training_messages for select to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_messages_write on public.training_messages for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id
                 and (s.profile_id = (select auth.uid()) or (select public.is_admin()))));

-- Scores : lecture via thread → session ; AUCUNE écriture authenticated (service-role depuis scoreSession).
create policy training_thread_scores_read on public.training_thread_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));
create policy training_thread_axis_scores_read on public.training_thread_axis_scores for select to authenticated
  using (exists (select 1 from public.training_threads t join public.training_sessions s on s.id = t.session_id
                 where t.id = thread_id
                 and (s.profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')))));

-- Signalements : auteur + encadrants lisent ; auteur crée ; encadrant/admin résout.
create policy training_reports_read on public.training_reports for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_reports_insert on public.training_reports for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy training_reports_update on public.training_reports for update to authenticated
  using ((select public.has_page('frm-suivi')))
  with check ((select public.has_page('frm-suivi')));

-- Appels IA : admin lit ; écriture service-role uniquement.
create policy training_ai_calls_admin_read on public.training_ai_calls for select to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- [ex-0118] 0118_training_stats.sql
-- ============================================================================

-- 0118 — Agrégats de progression PRÉ-CALCULÉS (perf : Ma formation / Overview / classement lisent
-- 1-2 lignes au lieu de rejouer les sessions comme GLA), maintenus par trigger à chaque notation ;
-- RPC de lecture (points faibles par axe, coût IA, classement, roster overview).
-- Règles (spec §6) : médailles/points/moyenne = SUR LES MEILLEURS totaux par cas, HORS boss ;
-- boss_best/boss_done à part (réussi = objectif atteint = note ≥ 60) ; streak = jours consécutifs
-- Europe/Paris avec ≥ 1 notation.

create table public.training_case_bests (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  case_id        uuid not null references public.training_cases(id) on delete cascade,
  best_total     smallint not null check (best_total between 0 and 100),
  best_objective boolean not null default false,
  attempts       integer not null default 1 check (attempts >= 1),
  last_at        timestamptz not null,
  primary key (profile_id, case_id)
);
create index training_case_bests_case_idx on public.training_case_bests (case_id);

create table public.training_profile_stats (
  profile_id      uuid primary key references public.profiles(id) on delete cascade,
  cases_done      integer not null default 0,
  avg_total       numeric(5,2),
  points          integer not null default 0,
  boss_best       smallint,
  boss_done       boolean not null default false,
  active_days     integer not null default 0,
  streak_days     integer not null default 0,
  last_active_day date,
  last_session_at timestamptz,
  updated_at      timestamptz not null default now()
);

alter table public.training_case_bests enable row level security;
alter table public.training_profile_stats enable row level security;
-- Lecture : bests = propriétaire / encadrant / admin ; stats = tout membre Formation (classement =
-- agrégats, jamais de contenu). AUCUNE écriture authenticated : trigger security definer.
create policy training_case_bests_read on public.training_case_bests for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.has_page('frm-suivi')));
create policy training_profile_stats_read on public.training_profile_stats for select to authenticated
  using ((select public.is_admin()) or (select public.has_page('formation')));

-- Recalcul DEPUIS LES SESSIONS (pas incrémental) : une re-notation à la baisse est prise en compte.
create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
begin
  select kind into v_kind from training_cases where id = p_case;

  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées
  insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
  select p_profile, p_case, max(total), bool_or(objective_reached), count(*), max(scored_at)
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored'
  on conflict (profile_id, case_id) do update
    set best_total = excluded.best_total, best_objective = excluded.best_objective,
        attempts = excluded.attempts, last_at = excluded.last_at;

  -- 2) stats du profil depuis ses bests (≤ ~90 lignes)
  select last_active_day, streak_days, active_days into v_last, v_streak, v_active
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1; v_active := coalesce(v_active, 0) + 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1; v_active := coalesce(v_active, 0) + 1;
  else v_streak := coalesce(v_streak, 1); v_active := coalesce(v_active, 1);   -- même jour
  end if;

  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day), p_at, now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;
revoke execute on function public.training_refresh_stats(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.training_on_session_scored()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform training_refresh_stats(new.profile_id, new.case_id, coalesce(new.scored_at, now()));
  return null;
end;
$$;
drop trigger if exists trg_training_session_scored on public.training_sessions;
create trigger trg_training_session_scored
  after update of status, scored_at on public.training_sessions
  for each row
  when (new.status = 'scored' and (old.status is distinct from 'scored' or old.scored_at is distinct from new.scored_at))
  execute function public.training_on_session_scored();

-- RPC lecture. INVOKER : bornées par la RLS de l'appelant.
create or replace function public.training_axis_profile(p_profile uuid)
returns table (axis_key text, axis_name text, avg_score numeric, n integer)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.axis_key, a.axis_name, round(avg(a.score), 1), count(*)::integer
  from training_thread_axis_scores a
  join training_threads t on t.id = a.thread_id
  join training_sessions s on s.id = t.session_id
  where s.profile_id = p_profile and s.status = 'scored' and s.kind <> 'boss'
  group by a.axis_key, a.axis_name
  order by avg(a.score) asc;
$$;

create or replace function public.training_ai_cost(p_since timestamptz)
returns table (day date, model text, kind text, calls integer, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select (created_at at time zone 'Europe/Paris')::date, model, kind, count(*)::integer,
         sum(input_tokens), sum(output_tokens), sum(cache_read_tokens)
  from training_ai_calls
  where created_at >= p_since
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

-- DEFINER : la RLS de profiles (profiles_self_admin_or_team_read) ne laisse pas un chatter/manager
-- lire tous les noms ; ces deux RPC ne renvoient que nom + agrégats, jamais de contenu.
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, p.email, '—'), s.points, s.cases_done, s.avg_total, s.boss_done, s.streak_days, coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;

create or replace function public.training_overview_roster()
returns table (profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[],
               cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean,
               streak_days integer, last_session_at timestamptz, sessions_scored integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, p.email, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         coalesce(s.streak_days, 0), s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored')
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;

-- ============================================================================
-- [ex-0119] 0119_training_stats_fixes.sql
-- ============================================================================

-- 0119 — Corrections post-revue de 0118 (findings importants acceptés par le contrôleur).
-- 0118 est déjà appliquée ET enregistrée sur UAT : cette migration ne fait que
-- `create or replace` les fonctions concernées (mêmes signatures, mêmes security/search_path).
--
-- 1) training_refresh_stats : `total is not null` ajouté au recalcul du meilleur (attempts
--    compte les mêmes lignes que best_total) ; coalesce sur best_objective/last_at (colonnes
--    nullables de training_sessions) pour ne jamais violer leur NOT NULL ; active_days
--    recalculé DEPUIS LES FAITS (jours distincts Europe/Paris avec ≥ 1 notation valide) au
--    lieu d'un compteur incrémental qui pouvait dériver en silence ; last_session_at repris
--    comme last_active_day (greatest(coalesce(existant, p_at), p_at), jamais de retour en
--    arrière) ; v_kind (déclaré, jamais utilisé) supprimé.
-- 2) training_ranking / training_overview_roster : plus de fallback e-mail dans display_name
--    (fuite d'adresse dans une RPC security definer lisible par tout chatter) ; streak_days
--    renvoyé devient la valeur EFFECTIVE (0 si le dernier jour actif est antérieur à hier
--    Paris) — training_profile_stats.streak_days, lui, reste la valeur brute « au dernier
--    jour actif » (cf. commentaire de colonne ci-dessous).
-- 3) Grants explicites sur les 4 RPC de lecture : execute retiré à public/anon, ré-accordé à
--    authenticated seul (agrégats/noms uniquement, jamais de contenu, mais pas d'appel anonyme).

comment on column public.training_profile_stats.streak_days is
$cmt$valeur au dernier jour actif — lire via la règle "effectif" (last_active_day ≥ hier Paris), sinon 0$cmt$;

comment on trigger trg_training_session_scored on public.training_sessions is
$cmt$trigger UPDATE-only : toujours créer la session en 'active' puis la passer 'scored' en posant scored_at (re-notation = nouveau scored_at)$cmt$;

create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
  v_last_session_at timestamptz;
begin
  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées AVEC une note
  -- (total is not null) : attempts compte les mêmes lignes que best_total ; coalesce sur
  -- best_objective/last_at pour ne jamais violer leur NOT NULL si ces colonnes nullables de
  -- training_sessions sont vides sur la ligne courante.
  insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
  select p_profile, p_case, max(total), coalesce(bool_or(objective_reached), false), count(*), coalesce(max(scored_at), p_at)
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null
  on conflict (profile_id, case_id) do update
    set best_total = excluded.best_total, best_objective = excluded.best_objective,
        attempts = excluded.attempts, last_at = excluded.last_at;

  -- 2) streak (incrémental — lu via la règle « effectif » côté RPC, cf. training_ranking /
  -- training_overview_roster) + reprise de last_session_at existant.
  select last_active_day, streak_days, last_session_at into v_last, v_streak, v_last_session_at
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1;
  else v_streak := coalesce(v_streak, 1);   -- même jour
  end if;

  -- active_days recalculé DEPUIS LES FAITS (jours distincts Europe/Paris avec ≥ 1 notation
  -- valide) : plus un compteur incrémental qui pouvait dériver en silence.
  select count(distinct (scored_at at time zone 'Europe/Paris')::date) into v_active
  from training_sessions
  where profile_id = p_profile and status = 'scored' and total is not null;

  -- 3) stats du profil depuis ses bests (≤ ~90 lignes)
  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day),
         greatest(coalesce(v_last_session_at, p_at), p_at), now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;

-- DEFINER : la RLS de profiles (profiles_self_admin_or_team_read) ne laisse pas un chatter/manager
-- lire tous les noms ; ces deux RPC ne renvoient que nom + agrégats, jamais de contenu (plus d'e-mail
-- en repli), et le streak est la valeur EFFECTIVE (0 si le dernier jour actif est antérieur à hier).
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, '—'), s.points, s.cases_done, s.avg_total, s.boss_done,
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;

create or replace function public.training_overview_roster()
returns table (profile_id uuid, display_name text, is_new boolean, arrived_at date, models text[],
               cases_done integer, avg_total numeric, points integer, boss_best smallint, boss_done boolean,
               streak_days integer, last_session_at timestamptz, sessions_scored integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, coalesce(p.display_name, '—'), coalesce(p.is_new, false), p.arrived_at,
         coalesce((select array_agg(c.name order by c.name) from profile_creators pc join creators c on c.id = pc.creator_id where pc.profile_id = p.id), '{}'),
         coalesce(s.cases_done, 0), s.avg_total, coalesce(s.points, 0), s.boss_best, coalesce(s.boss_done, false),
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         s.last_session_at,
         (select count(*)::integer from training_sessions ts where ts.profile_id = p.id and ts.status = 'scored')
  from profiles p
  left join training_profile_stats s on s.profile_id = p.id
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
    and (select public.has_page('frm-suivi'))
  order by coalesce(p.is_new, false) desc, p.display_name;
$$;

-- Grants explicites : execute retiré à public/anon (pas d'appel anonyme), ré-accordé à authenticated.
revoke execute on function public.training_axis_profile(uuid), public.training_ai_cost(timestamptz),
                          public.training_ranking(), public.training_overview_roster()
  from public, anon;
grant execute on function public.training_axis_profile(uuid), public.training_ai_cost(timestamptz),
                        public.training_ranking(), public.training_overview_roster()
  to authenticated;

-- ============================================================================
-- [ex-0120] 0120_training_ranking_chatteurs.sql
-- ============================================================================

-- 0120 — Classement de la formation : limité aux CHATTEURS (revue de Ma formation).
-- 0119 est déjà appliquée ET enregistrée sur UAT : on ne la réécrit pas, on `create or replace`
-- `training_ranking()` à l'identique (même signature, même retour, même security definer /
-- search_path, mêmes gardes is_admin() / has_page('formation')) en ajoutant `p.role = 'chatteur'`.
--
-- Pourquoi : la fonction renvoyait TOUT profil ayant une ligne de stats — un admin, un manager ou
-- un policier qui teste un cas pour vérifier le moteur apparaissait dans le classement des
-- chatteurs et faussait le rang de chacun. Même critère de population que
-- `training_overview_roster()` côté encadrement (chatteur avec le droit Entraînement) — ici on
-- s'arrête au rôle : un chatteur qui perd le droit garde son historique dans le classement.
create or replace function public.training_ranking()
returns table (profile_id uuid, display_name text, points integer, cases_done integer, avg_total numeric, boss_done boolean, streak_days integer, is_new boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.profile_id, coalesce(p.display_name, '—'), s.points, s.cases_done, s.avg_total, s.boss_done,
         case when s.last_active_day >= (now() at time zone 'Europe/Paris')::date - 1 then s.streak_days else 0 end,
         coalesce(p.is_new, false)
  from training_profile_stats s
  join profiles p on p.id = s.profile_id
  where p.left_at is null
    and p.role = 'chatteur'
    and ((select public.is_admin()) or (select public.has_page('formation')))
  order by s.points desc, s.avg_total desc nulls last;
$$;

-- ============================================================================
-- [ex-0121] 0121_training_write_hardening.sql
-- ============================================================================

-- 0121 — Entraînement : durcissement du MODÈLE D'ÉCRITURE (revue finale de l'incrément 2).
--
-- Constat de la revue : les policies d'écriture « propriétaire » de 0117 donnaient au chatter un
-- accès PostgREST direct à ses propres lignes — donc bien plus que ce que l'UI propose :
--   * `training_sessions_update` acceptait N'IMPORTE QUELLE colonne → un chatter pouvait poser
--     lui-même `status = 'scored'`, `total = 100`, `scored_at = now()` ; le trigger 0118 propageait
--     ensuite le faux score dans training_case_bests, training_profile_stats et le classement ;
--   * `training_threads_write` / `training_messages_write` (`for all`) laissaient forger ou
--     supprimer des messages, remettre `turns_used` à 0, repousser `next_due_at` (chrono infini).
--
-- Décision : le modèle d'écriture devient celui, déjà en place, des scores et des appels IA —
-- TOUTES les écritures passent par les Server Actions en service-role, APRÈS la vérification
-- explicite de propriété (`profile_id = auth.uid()` lue avec le client utilisateur) ; la RLS de
-- ces tables devient de la LECTURE SEULE pour `authenticated`. Seul l'admin garde un UPDATE direct
-- sur les sessions (re-notation depuis l'Overview).
--
-- Aussi ici : (a) `training_refresh_stats` ne touche plus aux « meilleurs » quand le recalcul ne
-- trouve aucune session notée avec une note (l'agrégat rendait une ligne à `max(total) = null`,
-- soit une violation du NOT NULL de `training_case_bests.best_total`) ; (b) unicité applicative du
-- signalement (un par session) portée en base.

-- ---------- 1) RLS : plus aucune écriture `authenticated` sur sessions / threads / messages ----------
drop policy training_sessions_insert on public.training_sessions;
drop policy training_sessions_update on public.training_sessions;
drop policy training_threads_write on public.training_threads;
drop policy training_messages_write on public.training_messages;
drop policy training_reports_insert on public.training_reports;

-- L'admin conserve l'UPDATE direct des sessions (rescore) ; le reste (lecture propriétaire /
-- encadrant `frm-suivi` / admin) est inchangé — cf. les policies `*_read` de 0117.
create policy training_sessions_update_admin on public.training_sessions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------- 2) training_refresh_stats : ne jamais écrire un « meilleur » sans note ----------
-- `create or replace` à l'identique de 0119 (même signature, même security definer / search_path),
-- au détail près du garde `v_attempts > 0` : l'agrégat `max(total) / count(*)` rend TOUJOURS une
-- ligne, même quand aucune session ne correspond (max = null, count = 0) — l'upsert écrasait alors
-- un meilleur existant avec un total null (NOT NULL violé, notation en erreur).
create or replace function public.training_refresh_stats(p_profile uuid, p_case uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (p_at at time zone 'Europe/Paris')::date;
  v_last date;
  v_streak integer;
  v_active integer;
  v_last_session_at timestamptz;
  v_attempts integer;
begin
  -- 1) meilleur résultat du couple (profil, cas) depuis les sessions notées AVEC une note
  -- (total is not null) : attempts compte les mêmes lignes que best_total ; coalesce sur
  -- best_objective/last_at pour ne jamais violer leur NOT NULL si ces colonnes nullables de
  -- training_sessions sont vides sur la ligne courante. Aucune session notée → on ne touche à rien.
  select count(*) into v_attempts
  from training_sessions
  where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null;

  if v_attempts > 0 then
    insert into training_case_bests (profile_id, case_id, best_total, best_objective, attempts, last_at)
    select p_profile, p_case, max(total), coalesce(bool_or(objective_reached), false), count(*), coalesce(max(scored_at), p_at)
    from training_sessions
    where profile_id = p_profile and case_id = p_case and status = 'scored' and total is not null
    on conflict (profile_id, case_id) do update
      set best_total = excluded.best_total, best_objective = excluded.best_objective,
          attempts = excluded.attempts, last_at = excluded.last_at;
  end if;

  -- 2) streak (incrémental — lu via la règle « effectif » côté RPC, cf. training_ranking /
  -- training_overview_roster) + reprise de last_session_at existant.
  select last_active_day, streak_days, last_session_at into v_last, v_streak, v_last_session_at
  from training_profile_stats where profile_id = p_profile;
  if v_last is null or v_last < v_day - 1 then v_streak := 1;
  elsif v_last = v_day - 1 then v_streak := coalesce(v_streak, 0) + 1;
  else v_streak := coalesce(v_streak, 1);   -- même jour
  end if;

  -- active_days recalculé DEPUIS LES FAITS (jours distincts Europe/Paris avec ≥ 1 notation
  -- valide) : plus un compteur incrémental qui pouvait dériver en silence.
  select count(distinct (scored_at at time zone 'Europe/Paris')::date) into v_active
  from training_sessions
  where profile_id = p_profile and status = 'scored' and total is not null;

  -- 3) stats du profil depuis ses bests (≤ ~90 lignes)
  insert into training_profile_stats (profile_id, cases_done, avg_total, points, boss_best, boss_done,
                                      active_days, streak_days, last_active_day, last_session_at, updated_at)
  select p_profile,
         count(*) filter (where c.kind <> 'boss'),
         avg(b.best_total) filter (where c.kind <> 'boss'),
         coalesce(sum(b.best_total) filter (where c.kind <> 'boss'), 0),
         max(b.best_total) filter (where c.kind = 'boss'),
         coalesce(bool_or(b.best_objective) filter (where c.kind = 'boss'), false),
         v_active, v_streak, greatest(coalesce(v_last, v_day), v_day),
         greatest(coalesce(v_last_session_at, p_at), p_at), now()
  from training_case_bests b join training_cases c on c.id = b.case_id
  where b.profile_id = p_profile
  on conflict (profile_id) do update
    set cases_done = excluded.cases_done, avg_total = excluded.avg_total, points = excluded.points,
        boss_best = excluded.boss_best, boss_done = excluded.boss_done,
        active_days = excluded.active_days, streak_days = excluded.streak_days,
        last_active_day = excluded.last_active_day, last_session_at = excluded.last_session_at, updated_at = now();
end;
$$;

-- ---------- 3) Un signalement par session ----------
-- `reportScore` vérifiait déjà l'absence d'un signalement existant, mais deux envois concurrents
-- (double-clic, deux onglets) passaient tous les deux — et `get-session` n'en lit qu'un.
create unique index training_reports_session_uidx on public.training_reports (session_id);

-- ============================================================================
-- [ex-0122] 0122_training_wheel.sql
-- ============================================================================

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

-- ============================================================================
-- [ex-0123] 0123_training_wheel_one_pending.sql
-- ============================================================================

-- 0123 — Correctif de revue sur 0122 (roue des récompenses).
-- 0122 est déjà appliquée ET enregistrée sur UAT : on ne la réécrit pas.
--
-- 1) `training_wheel_tickets_pending_idx` n'était qu'un index PARTIEL non-unique : rien
--    n'empêchait en base plusieurs tickets non utilisés pour la même personne, alors que la
--    règle métier est « un seul ticket non utilisé par personne » (même précédent que
--    `training_sessions_one_active_idx`, 0117 : une seule session ACTIVE par chatter). On
--    remplace par un index UNIQUE partiel du même nom que l'invariant qu'il porte.
-- 2) Durcissement symétrique côté tirages : un « Raté » ne doit jamais porter de montant —
--    `check (won = (prize_label is not null))` (0122) garantit déjà prize_label, on ajoute la
--    même garde sur amount_eur.

drop index if exists public.training_wheel_tickets_pending_idx;
create unique index training_wheel_tickets_one_pending_idx on public.training_wheel_tickets (profile_id) where used_at is null;
alter table public.training_wheel_spins add constraint training_wheel_spins_amount_won_check check (won or amount_eur is null);

-- ============================================================================
-- [ex-0124] 0124_training_wheel_eligibility.sql
-- ============================================================================

-- 0124 — Roue des récompenses : classement hebdo réservé aux chatters ayant le droit Entraînement.
-- Revue finale de l'incrément 3 : `training_weekly_ranking` (0122) omettait le filtre
-- `'frm-entrainement' = any(p.pages)` que `training_overview_roster` applique déjà (0118/0119) —
-- un chatter qui perd le droit Entraînement restait classé, et donc éligible à un ticket. Même
-- garde ajoutée à `training_wheel_pending` : un profil sans ce droit (admin, encadrant sans
-- Entraînement) ne doit JAMAIS déclencher l'agrégat de classement hebdo — la pastille sidebar
-- appelle cette RPC à chaque rendu du layout `/formation`.

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
  where p.left_at is null and p.role = 'chatteur' and 'frm-entrainement' = any(p.pages)
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
    when not exists (
      select 1 from profiles pp
      where pp.id = p_profile and pp.left_at is null and pp.role = 'chatteur' and 'frm-entrainement' = any(pp.pages)
    ) then 0
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

revoke execute on function public.training_weekly_ranking(date) from public, anon;
revoke execute on function public.training_wheel_pending(uuid) from public, anon;
grant execute on function public.training_weekly_ranking(date) to authenticated;
grant execute on function public.training_wheel_pending(uuid) to authenticated;

-- ============================================================================
-- [ex-0125] 0125_recruit_test.sql
-- ============================================================================

-- 0125 — Test de recrutement public (reprise Good Luck Agency) : config (1 ligne, défauts +
-- banque QI + texte de frappe GLA), tentatives techniques, messages de la conversation IA,
-- dossiers candidats, liste de blocage. Spec : docs/superpowers/specs/2026-08-20-formation-
-- recrutement-design.md §3.
--
-- Le candidat n'a AUCUNE session : la page /postuler est publique, toutes les écritures passent
-- par createAdminClient() (service-role) depuis les Server Actions publiques — RLS n'accorde
-- donc que de la LECTURE, réservée à is_admin() (recrutement = admin seulement, cf. spec §1).
-- Aucune policy anon ni authenticated non-admin : l'anon key ne lit rien, un profil non-admin
-- authentifié non plus.

create table public.recruit_config (
  id             smallint primary key default 1 check (id = 1),
  open           boolean not null default true,
  bot_messages   smallint not null default 14 check (bot_messages between 1 and 50),
  qi_timer       smallint not null default 30 check (qi_timer between 5 and 300),
  frappe_min     smallint not null default 30 check (frappe_min >= 0),
  connexion_min  smallint not null default 10 check (connexion_min >= 0),
  qi_min         smallint not null default 3 check (qi_min between 0 and 5),
  global_threshold smallint not null default 70 check (global_threshold between 0 and 100),
  discord_link   text not null default '',
  -- texte fixe recopié à l'épreuve de frappe (GLA render.frappe, TXT).
  typing_text    text not null,
  -- banque QI : [{ "slot": "<thème>", "variants": [{ "q", "opts": [4], "a": <index bonne réponse> }] }]
  -- une variante tirée au hasard par emplacement à chaque tentative ; la bonne réponse (`a`) ne
  -- descend jamais au client (cf. recruit_attempts.qi_answers).
  qi_bank        jsonb not null,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);
create index recruit_config_updated_by_idx on public.recruit_config (updated_by);

insert into public.recruit_config (id, typing_text, qi_bank) values (
  1,
  'le chatting est un metier ou la rapidite et la qualite comptent beaucoup un bon chatter sait engager la conversation creer du lien et donner envie a son interlocuteur de continuer a discuter avec lui chaque jour tout en restant naturel et souriant',
  '[
    {"slot":"Suite logique","variants":[
      {"q":"Quelle est la suite : 2, 4, 8, 16, … ?","opts":["24","32","30","18"],"a":1},
      {"q":"Quelle est la suite : 3, 6, 9, 12, … ?","opts":["13","15","16","14"],"a":1}
    ]},
    {"slot":"Intrus","variants":[
      {"q":"Trouve l''intrus :","opts":["pomme","banane","carotte","cerise"],"a":2},
      {"q":"Trouve l''intrus :","opts":["lundi","mars","mercredi","vendredi"],"a":1}
    ]},
    {"slot":"Raisonnement","variants":[
      {"q":"Pierre est plus grand que Paul mais plus petit que Jacques. Qui est le plus petit ?","opts":["Jacques","Paul","Pierre","On ne peut pas savoir"],"a":1},
      {"q":"Main est à gant ce que pied est à…","opts":["chaussette","chaussure","jambe","sol"],"a":1}
    ]},
    {"slot":"Lecture du client","variants":[
      {"q":"Un client répond juste « ok. » avec un point. Ça traduit plutôt…","opts":["de la joie","de la froideur / un désintérêt","de l''excitation","une question"],"a":1},
      {"q":"Un client écrit « je m''ennuie ce soir… ». La meilleure réaction ?","opts":["répondre « ok »","lui poser une question pour le faire parler","changer de sujet","ne rien répondre"],"a":1}
    ]},
    {"slot":"Vente","variants":[
      {"q":"« J''ai trop envie de toi, tu me proposes quoi ? »","opts":["« Viens chez moi »","Entretenir le désir + rediriger vers du contenu privé","« Je suis occupée, plus tard »","« Désolée, je ne fais pas ça »"],"a":1},
      {"q":"« Tout gratuit, sinon je me désabonne. »","opts":["Tout envoyer pour le garder","Refuser avec le sourire + proposer une petite offre","« Au revoir alors »","L''ignorer"],"a":1}
    ]}
  ]'::jsonb
);

-- Tentative technique : créée dès l'entrée sur /postuler (device + IP, pour le rate-limit et le
-- coût IA visible même sur les abandons), avant toute identité. Statuts : en_cours → notee (bot
-- scoré) → soumise (dossier créé) ; abandonnee = jamais soumise.
create table public.recruit_attempts (
  id               uuid primary key default gen_random_uuid(),
  device           text not null,
  ip               text,
  persona          text not null,
  status           text not null default 'en_cours'
                     check (status in ('en_cours', 'notee', 'soumise', 'abandonnee')),
  -- QI : score serveur (0-5) + clé de correction posée au tirage (slot/variante/bonne réponse
  -- pour CETTE tentative) — comparée aux réponses envoyées par le client, ne descend JAMAIS au
  -- client (aucune policy anon/authenticated ne lit cette table).
  qi_score         smallint check (qi_score between 0 and 5),
  qi_answers       jsonb,
  -- { wpm, accuracy, seconds } — déclaratif client (comme GLA), gate caché.
  typing           jsonb,
  connection_mbps  numeric(7,1) check (connection_mbps is null or connection_mbps >= 0),
  bot_replies      int not null default 0 check (bot_replies >= 0),
  input_tokens     int not null default 0 check (input_tokens >= 0),
  output_tokens    int not null default 0 check (output_tokens >= 0),
  orthographe      smallint check (orthographe between 0 and 25),
  coherence        smallint check (coherence between 0 and 25),
  relance          smallint check (relance between 0 and 25),
  vente            smallint check (vente between 0 and 25),
  bot_total        smallint check (bot_total between 0 and 100),
  created_at       timestamptz not null default now()
);
-- Rate-limit (5 tentatives / IP / 24h) : couvert par le premier index (ip en tête).
create index recruit_attempts_ip_created_at_idx on public.recruit_attempts (ip, created_at desc);
create index recruit_attempts_created_at_idx on public.recruit_attempts (created_at desc);

-- Transcription de la conversation fan IA, tenue CÔTÉ SERVEUR (pas de transcription forgée par
-- le client). speaker 'candidat' = le chatter testé, 'client' = le bot (persona GLA).
create table public.recruit_messages (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.recruit_attempts(id) on delete cascade,
  position     smallint not null check (position >= 0),
  speaker      text not null check (speaker in ('candidat', 'client')),
  body         text not null,
  -- prix € d'un média verrouillé envoyé par le candidat (mécanique GLA [MEDIA VERROUILLE - X€]).
  media_price  numeric(8,2) check (media_price is null or media_price >= 0),
  created_at   timestamptz not null default now(),
  unique (attempt_id, position)
);
-- attempt_id couvert par l'unique (attempt_id, position) en tête.

-- Dossier candidat, créé UNIQUEMENT à la soumission finale (identité à la fin, cf. spec §1) —
-- toutes les mesures sont donc connues et figées à la création (snapshot de la tentative notée).
create table public.recruit_candidates (
  id                uuid primary key default gen_random_uuid(),
  attempt_id        uuid not null unique references public.recruit_attempts(id) on delete cascade,
  first_name        text not null check (length(first_name) between 1 and 60),
  last_name         text not null check (length(last_name) between 1 and 60),
  -- stockée en minuscules par l'app (normalisation avant écriture, cf. blocklist).
  email             text not null,
  discord           text check (discord is null or length(discord) between 1 and 60),
  qi_score          smallint not null check (qi_score between 0 and 5),
  typing_wpm        smallint not null check (typing_wpm >= 0),
  connection_mbps   numeric(7,1) not null check (connection_mbps >= 0),
  orthographe       smallint not null check (orthographe between 0 and 25),
  coherence         smallint not null check (coherence between 0 and 25),
  relance           smallint not null check (relance between 0 and 25),
  vente             smallint not null check (vente between 0 and 25),
  bot_total         smallint not null check (bot_total between 0 and 100),
  global            smallint not null check (global between 0 and 100),
  passed            boolean not null,
  -- raison qualitative de refus (épreuve la plus faible, jamais les chiffres — GLA finishCandidate).
  refusal_step      text,
  refusal_reason    text,
  -- e-mail déjà porteur d'un dossier à la soumission (2e passage, cf. blocklist oneAttempt).
  repeat            boolean not null default false,
  status            text not null default 'nouveau' check (status in ('nouveau', 'valide', 'refuse')),
  profile_id        uuid references public.profiles(id) on delete set null,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint recruit_candidates_refusal_consistency
    check (passed = (refusal_step is null and refusal_reason is null))
);
-- attempt_id déjà indexé par l'unique en tête.
create index recruit_candidates_email_idx on public.recruit_candidates (email);
create index recruit_candidates_status_nouveau_idx on public.recruit_candidates (created_at desc)
  where status = 'nouveau';
create index recruit_candidates_profile_id_idx on public.recruit_candidates (profile_id);
create index recruit_candidates_reviewed_by_idx on public.recruit_candidates (reviewed_by);

-- Un seul essai (oneAttempt GLA) : device + e-mail (+ Discord) rejoignent cette liste à la
-- soumission ; device/IP vérifiés à l'ENTRÉE du test, e-mail/Discord à la SOUMISSION.
create table public.recruit_blocklist (
  id          uuid primary key default gen_random_uuid(),
  device      text,
  -- stocké en minuscules par l'app.
  email       text,
  discord     text,
  ip          text,
  reason      text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint recruit_blocklist_has_target
    check (device is not null or email is not null or discord is not null or ip is not null)
);
create index recruit_blocklist_device_idx on public.recruit_blocklist (device);
create index recruit_blocklist_email_idx on public.recruit_blocklist (email);
create index recruit_blocklist_ip_idx on public.recruit_blocklist (ip);
create index recruit_blocklist_created_by_idx on public.recruit_blocklist (created_by);

alter table public.recruit_config enable row level security;
alter table public.recruit_attempts enable row level security;
alter table public.recruit_messages enable row level security;
alter table public.recruit_candidates enable row level security;
alter table public.recruit_blocklist enable row level security;

create policy recruit_config_read on public.recruit_config for select to authenticated
  using ((select public.is_admin()));
create policy recruit_config_admin_write on public.recruit_config for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy recruit_attempts_read on public.recruit_attempts for select to authenticated
  using ((select public.is_admin()));
create policy recruit_messages_read on public.recruit_messages for select to authenticated
  using ((select public.is_admin()));
create policy recruit_candidates_read on public.recruit_candidates for select to authenticated
  using ((select public.is_admin()));
create policy recruit_blocklist_read on public.recruit_blocklist for select to authenticated
  using ((select public.is_admin()));
-- Aucune autre policy : ni anon (le test public n'a pas de session), ni authenticated non-admin.
-- Toutes les écritures (candidat public + actions admin de la page Recrutement) passent par
-- createAdminClient() côté serveur, hors RLS.

-- Badge sidebar (item « Recrutement », admin seulement) : nombre de dossiers 'nouveau'.
create or replace function public.recruit_pending_count()
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when (select public.is_admin()) then (select count(*)::integer from recruit_candidates where status = 'nouveau')
    else 0
  end;
$$;
revoke execute on function public.recruit_pending_count() from public, anon;
grant execute on function public.recruit_pending_count() to authenticated;

-- ============================================================================
-- [ex-0126] 0126_recruit_email_lower.sql
-- ============================================================================

-- 0126 — Recrutement : e-mails et Discord normalisés en base (check lower).
--
-- Revue de 0125 : `recruit_candidates.email`/`recruit_blocklist.email` (et `discord`) sont en
-- `text` simple, avec pour seule garantie un commentaire « stocké en minuscules par l'app ».
-- La blocklist est le garde-fou anti-triche (un seul essai, e-mail + Discord ajoutés à la
-- soumission) : un `lower()` oublié dans une future Server Action laisserait passer un doublon
-- SILENCIEUSEMENT (ex: `Nom@Gmail.com` vs `nom@gmail.com` ne matchent jamais dans la blocklist).
-- Précédent repo : `citext` sur `profiles.email`. Ici on garde `text` (décidé en 0125) mais on
-- fait respecter la normalisation par un `check` — toute écriture avec de la casse échoue au
-- lieu de s'insérer silencieusement.
alter table public.recruit_candidates
  add constraint recruit_candidates_email_lower_check check (email = lower(email));
alter table public.recruit_candidates
  add constraint recruit_candidates_discord_lower_check check (discord is null or discord = lower(discord));

alter table public.recruit_blocklist
  add constraint recruit_blocklist_email_lower_check check (email is null or email = lower(email));
alter table public.recruit_blocklist
  add constraint recruit_blocklist_discord_lower_check check (discord is null or discord = lower(discord));

-- ============================================================================
-- [ex-0127] 0127_recruit_candidate_profile.sql
-- ============================================================================

-- 0127 — profil candidat étendu (questions du formulaire GLA reprises le 2026-08-21) :
-- âge, localisation, téléphone, shifts souhaités, « comment tu as connu l'agence ».
-- Posées à la FIN avec l'identité (écart voulu vs GLA, spec §1) → colonnes sur recruit_candidates.
-- NULLABLE : les dossiers soumis avant cette migration n'en ont pas (la fiche affiche « — »).
-- Les valeurs de `shifts` sont validées côté action (liste fermée applicative) — pas de check SQL
-- d'appartenance pour laisser l'admin faire évoluer les libellés sans migration.

alter table public.recruit_candidates
  add column age int check (age is null or age between 18 and 99),
  add column location text check (location is null or char_length(location) between 2 and 120),
  add column phone text check (phone is null or char_length(phone) between 6 and 30),
  add column shifts text[] check (shifts is null or array_length(shifts, 1) between 1 and 10),
  add column source text check (source is null or char_length(source) between 2 and 500);

comment on column public.recruit_candidates.age is 'Âge déclaré (majeur exigé par le formulaire).';
comment on column public.recruit_candidates.location is 'Localisation déclarée (ville, pays — texte libre).';
comment on column public.recruit_candidates.phone is 'Numéro de téléphone déclaré (texte libre, format non imposé).';
comment on column public.recruit_candidates.shifts is 'Shifts souhaités (libellés GLA : Matin (5h–13h) / Après-midi (13h–21h) / Nuit (21h–5h)).';
comment on column public.recruit_candidates.source is 'Comment le candidat a connu l''agence (texte libre).';
